#!/usr/bin/env python3
import argparse
import gzip
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.transform import from_origin


PRODUCT_PATTERN = re.compile(
    r"(?:^|/)T_IMFR27_C_LFPW_(?P<timestamp>\d{14})\.bufr\.gz$"
)
SOURCE_GRID_NODATA = -9999.0
RENDER_VERSION = "meteofrance-v2"
RAIN_PROBABILITY_DISPLAY_THRESHOLD = 0.25
SOURCE_PROJECTION = (
    "+proj=stere +lat_0=90 +lon_0=0 +lat_ts=45 "
    "+ellps=WGS84 +datum=WGS84 +units=m +no_defs"
)
SOURCE_CRS = CRS.from_proj4(SOURCE_PROJECTION)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def timestamp_from_compact(value: str) -> str:
    return datetime.strptime(value, "%Y%m%d%H%M%S").replace(
        tzinfo=timezone.utc
    ).isoformat().replace("+00:00", "Z")


def frame_key(timestamp: str) -> str:
    return timestamp.replace("-", "").replace(":", "").replace("T", "-").replace("Z", "")


def select_members(archive: tarfile.TarFile, requested_timestamp: str | None) -> list[tuple[tarfile.TarInfo, str]]:
    selected: list[tuple[tarfile.TarInfo, str]] = []
    for member in archive.getmembers():
        if not member.isfile():
            continue
        match = PRODUCT_PATTERN.search(member.name)
        if match is None:
            continue
        timestamp = timestamp_from_compact(match.group("timestamp"))
        if requested_timestamp is None or timestamp == requested_timestamp:
            selected.append((member, timestamp))

    selected.sort(key=lambda item: item[1])
    if requested_timestamp is not None and not selected:
        raise RuntimeError(f"Météo-France frame {requested_timestamp} is absent from the package.")
    if not selected:
        raise RuntimeError("The package contains no IMFR27 mainland reflectivity mosaic.")
    return selected


def geographic_geometry(
    transform: rasterio.Affine,
    width: int,
    height: int,
) -> tuple[list[float], list[list[float]]]:
    to_geographic = Transformer.from_crs(SOURCE_CRS, "EPSG:4326", always_xy=True)
    projected_corners = [
        (transform.c, transform.f),
        (transform.c + width * transform.a, transform.f),
        (transform.c + width * transform.a, transform.f + height * transform.e),
        (transform.c, transform.f + height * transform.e),
    ]
    corners = [list(to_geographic.transform(x, y)) for x, y in projected_corners]
    longitudes = [corner[0] for corner in corners]
    latitudes = [corner[1] for corner in corners]
    return [min(longitudes), min(latitudes), max(longitudes), max(latitudes)], corners


def render_frame(
    archive: tarfile.TarFile,
    member: tarfile.TarInfo,
    timestamp: str,
    output_root: Path,
    decoder: Path,
    tables: Path,
    keep_intermediate: bool,
) -> dict[str, Any]:
    final_directory = output_root / frame_key(timestamp)
    final_metadata = final_directory / "metadata.json"
    final_grid = final_directory / "source-grid.tif"
    if final_metadata.is_file() and final_grid.is_file():
        cached = json.loads(final_metadata.read_text(encoding="utf-8"))
        if (
            cached.get("timestamp") == timestamp
            and cached.get("tileReady") is True
            and cached.get("renderVersion") == RENDER_VERSION
        ):
            return cached

    output_root.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{frame_key(timestamp)}-", dir=output_root))
    try:
        compressed_path = staging / "source.bufr.gz"
        bufr_path = staging / "source.bufr"
        raw_path = staging / "reflectivity.float32"
        probability_path = staging / "reflectivity.float32.probability"
        decode_metadata_path = staging / "decode.json"
        source_grid_path = staging / "source-grid.tif"
        raw_source_grid_path = staging / "source-grid-raw.tif"

        source = archive.extractfile(member)
        if source is None:
            raise RuntimeError(f"Unable to read {member.name} from the package.")
        with source, compressed_path.open("wb") as destination:
            shutil.copyfileobj(source, destination)
        with gzip.open(compressed_path, "rb") as source, bufr_path.open("wb") as destination:
            shutil.copyfileobj(source, destination)

        completed = subprocess.run(
            [str(decoder), str(tables), str(bufr_path), str(raw_path), str(decode_metadata_path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=90,
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout).strip()[-2000:]
            raise RuntimeError(f"Météo-France BUFR decoding failed: {detail}")

        decoded = json.loads(decode_metadata_path.read_text(encoding="utf-8"))
        if decoded.get("timestamp") != timestamp:
            raise RuntimeError("The BUFR timestamp does not match the package member name.")

        width = int(decoded["rows"])
        height = int(decoded["columns"])
        pixel_size_x = float(decoded["pixelSizeX"])
        pixel_size_y = float(decoded["pixelSizeY"])
        raw = np.memmap(raw_path, dtype="<f4", mode="r", shape=(height, width))
        expected_bytes = width * height * np.dtype("<f4").itemsize
        if raw_path.stat().st_size != expected_bytes:
            raise RuntimeError("The decoded Météo-France reflectivity grid has an invalid byte length.")
        has_probability_grid = (
            probability_path.is_file() and probability_path.stat().st_size == expected_bytes
        )
        probability = (
            np.memmap(probability_path, dtype="<f4", mode="r", shape=(height, width))
            if has_probability_grid
            else None
        )

        top_left_transformer = Transformer.from_crs("EPSG:4326", SOURCE_CRS, always_xy=True)
        top_left_x, top_left_y = top_left_transformer.transform(
            float(decoded["topLeftLongitude"]),
            float(decoded["topLeftLatitude"]),
        )
        transform = from_origin(top_left_x, top_left_y, pixel_size_x, pixel_size_y)
        raw_grid = np.asarray(raw).copy()
        missing = (~np.isfinite(raw_grid)) | (raw_grid == float(decoded["nodata"]))
        undetect = raw_grid == float(decoded["undetectDbzh"])
        raw_grid[missing | undetect] = SOURCE_GRID_NODATA
        grid = raw_grid.copy()
        if probability is not None:
            probability_values = np.asarray(probability)
            rejected_by_probability = (
                (~np.isfinite(probability_values))
                | (probability_values == float(decoded["nodata"]))
                | (probability_values < RAIN_PROBABILITY_DISPLAY_THRESHOLD)
            )
            grid[rejected_by_probability] = SOURCE_GRID_NODATA

        profile = {
            "driver": "GTiff",
            "height": height,
            "width": width,
            "count": 1,
            "dtype": "float32",
            "crs": SOURCE_CRS,
            "transform": transform,
            "nodata": SOURCE_GRID_NODATA,
            "compress": "deflate",
            "predictor": 3,
            "tiled": True,
            "blockxsize": 256,
            "blockysize": 256,
        }
        def write_source_grid(path: Path, values: np.ndarray, display_filter: str) -> None:
            with rasterio.open(path, "w", **profile) as dataset:
                dataset.write(values, 1)
                dataset.update_tags(
                    provider="Météo-France",
                    attribution="Source : Météo-France",
                    product="Mosaique_metropole_Z_1km",
                    product_code="IMFR27_C_LFPW",
                    quantity="DBZH",
                    timestamp=timestamp,
                    source_format="BUFR",
                    display_filter=display_filter,
                )

        write_source_grid(
            source_grid_path,
            grid,
            (
                f"rain-probability>={RAIN_PROBABILITY_DISPLAY_THRESHOLD:.2f}"
                if has_probability_grid
                else "none"
            ),
        )
        if has_probability_grid:
            write_source_grid(raw_source_grid_path, raw_grid, "none")

        bounds = rasterio.transform.array_bounds(height, width, transform)
        bbox, maplibre_coordinates = geographic_geometry(transform, width, height)
        valid_values = raw_grid[raw_grid != SOURCE_GRID_NODATA]
        display_values = grid[grid != SOURCE_GRID_NODATA]
        probability_values = np.asarray(probability) if probability is not None else None
        valid_probability = (
            probability_values[probability_values != float(decoded["nodata"])]
            if probability_values is not None
            else np.asarray([], dtype=np.float32)
        )
        metadata = {
            "source": "Météo-France",
            "renderVersion": RENDER_VERSION,
            "provider": "Météo-France",
            "attribution": "Source : Météo-France",
            "license": "Licence Ouverte Etalab 2.0",
            "product": "Mosaique_metropole_Z_1km",
            "productCode": "IMFR27_C_LFPW",
            "timestamp": timestamp,
            "quantity": "DBZH",
            "format": "BUFR",
            "gain": 1.0,
            "offset": 0.0,
            "nodata": float(decoded["nodata"]),
            "undetect": float(decoded["undetectDbzh"]),
            "width": width,
            "height": height,
            "nativeResolutionMeters": pixel_size_x,
            "minimumDbzh": float(decoded["minimumDbzh"]),
            "maximumDbzh": float(decoded["maximumDbzh"]),
            "nodataPixelCount": int(decoded["missingPixels"]),
            "undetectPixelCount": int(decoded["undetectPixels"]),
            "visiblePixelCount": int(decoded["visiblePixels"]),
            "strongPixelCount": int(decoded["strongPixels"]),
            "rainProbabilityAvailable": has_probability_grid,
            "probabilityPixelCount": int(decoded.get("probabilityPixelCount", 0)),
            "probabilityMissingPixelCount": int(decoded.get("probabilityMissingPixels", 0)),
            "minimumRainProbability": (
                float(decoded["minimumProbability"]) if has_probability_grid else None
            ),
            "maximumRainProbability": (
                float(decoded["maximumProbability"]) if has_probability_grid else None
            ),
            "rainProbabilityMean": (
                float(np.mean(valid_probability)) if valid_probability.size else None
            ),
            "rainProbabilityDisplayThreshold": (
                RAIN_PROBABILITY_DISPLAY_THRESHOLD if has_probability_grid else None
            ),
            "displayFilter": (
                "Météo-France rain probability"
                if has_probability_grid
                else "none"
            ),
            "displayValidPixelCount": int(display_values.size),
            "displayVisiblePixelCount": int(np.count_nonzero(display_values >= 5.5)),
            "projection": SOURCE_PROJECTION,
            "projectionBounds": [bounds[0], bounds[1], bounds[2], bounds[3]],
            "mapLibreCoordinates": maplibre_coordinates,
            "geographicBounds": bbox,
            "bbox": bbox,
            "hasGeoreferencing": True,
            "sourceGridPath": str(final_grid),
            "sourceGridRawPath": str(
                final_directory / "source-grid-raw.tif"
                if has_probability_grid
                else final_grid
            ),
            "sourceGridCrs": SOURCE_CRS.to_string(),
            "sourceGridTransform": list(transform)[:6],
            "sourceGridWidth": width,
            "sourceGridHeight": height,
            "sourceGridNodata": SOURCE_GRID_NODATA,
            "sourceGridPixelSize": [pixel_size_x, pixel_size_y],
            "tileReady": True,
            "renderedAt": utc_now(),
            "decoder": "EUMETNET OPERA BUFR 3.2 / Weyra binary adapter",
            "sourceMember": Path(member.name).name,
            "sourceValidPixels": int(valid_values.size),
        }
        (staging / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        del raw
        if probability is not None:
            del valid_probability
            del probability_values
            del probability
        if not keep_intermediate:
            compressed_path.unlink(missing_ok=True)
            bufr_path.unlink(missing_ok=True)
            raw_path.unlink(missing_ok=True)
            probability_path.unlink(missing_ok=True)
            decode_metadata_path.unlink(missing_ok=True)

        if final_directory.exists():
            shutil.rmtree(final_directory)
        staging.replace(final_directory)
        return metadata
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Decode official Météo-France IMFR27 BUFR mosaics into georeferenced GeoTIFF grids."
    )
    parser.add_argument("--package", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--decoder", required=True, type=Path)
    parser.add_argument("--tables", required=True, type=Path)
    parser.add_argument("--timestamp")
    parser.add_argument("--keep-intermediate", action="store_true")
    args = parser.parse_args()

    try:
        args.package = args.package.resolve()
        args.output_root = args.output_root.resolve()
        args.decoder = args.decoder.resolve()
        args.tables = args.tables.resolve()
        if not args.decoder.is_file():
            raise RuntimeError(f"BUFR decoder is missing: {args.decoder}")
        if not args.tables.is_dir():
            raise RuntimeError(f"BUFR descriptor tables are missing: {args.tables}")

        rendered = []
        with tarfile.open(args.package, "r:gz") as archive:
            for member, timestamp in select_members(archive, args.timestamp):
                rendered.append(
                    render_frame(
                        archive,
                        member,
                        timestamp,
                        args.output_root,
                        args.decoder,
                        args.tables,
                        args.keep_intermediate,
                    )
                )
        print(json.dumps({"ok": True, "frames": rendered}, ensure_ascii=False), flush=True)
        return 0
    except Exception as error:
        print(f"render_meteofrance.py failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
