#!/usr/bin/env python3
import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import h5py
import numpy as np
from PIL import Image

try:
    from pyproj import CRS, Transformer
except Exception:  # pyproj is validated by the Node wrapper; keep the render error clean.
    CRS = None
    Transformer = None

try:
    import rasterio
    from rasterio.transform import from_bounds
except Exception:
    rasterio = None
    from_bounds = None


def decode_attr(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, np.bytes_):
        return bytes(value).decode("utf-8", errors="replace")
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return [decode_attr(item) for item in value.tolist()]
    return value


def attrs_dict(node: h5py.Group | h5py.Dataset) -> dict[str, Any]:
    return {key: decode_attr(value) for key, value in node.attrs.items()}


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ",".join(normalize_text(item) for item in value)
    return str(value).strip()


def number_or_none(value: Any) -> float | None:
    try:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        numeric = float(value)
        if math.isnan(numeric):
            return None
        return numeric
    except (TypeError, ValueError):
        return None


def first_attr(groups: list[h5py.Group | h5py.Dataset], names: list[str]) -> Any:
    for group in groups:
        attributes = attrs_dict(group)
        lower = {key.lower(): value for key, value in attributes.items()}
        for name in names:
            if name.lower() in lower:
                return lower[name.lower()]
    return None


def find_dbzh_dataset(handle: h5py.File) -> tuple[str, h5py.Dataset, h5py.Group | h5py.Dataset, dict[str, Any]]:
    candidates: list[tuple[str, h5py.Dataset, h5py.Group | h5py.Dataset, dict[str, Any]]] = []

    def visit(name: str, node: h5py.Group | h5py.Dataset) -> None:
        if not isinstance(node, h5py.Group):
            return

        what = node.get("what")
        what_attrs = attrs_dict(what) if isinstance(what, (h5py.Group, h5py.Dataset)) else {}
        group_attrs = attrs_dict(node)
        quantity = normalize_text(what_attrs.get("quantity") or group_attrs.get("quantity")).upper()
        if quantity != "DBZH":
            return

        data = node.get("data")
        if isinstance(data, h5py.Dataset) and data.ndim >= 2:
            candidates.append((data.name, data, what if what is not None else node, what_attrs or group_attrs))
            return

        for child in node.values():
            if isinstance(child, h5py.Dataset) and child.ndim >= 2:
                candidates.append((child.name, child, what if what is not None else node, what_attrs or group_attrs))
                return

    handle.visititems(visit)

    if not candidates:
        raise RuntimeError("No DBZH dataset was found in this ODIM HDF5 file.")

    return candidates[0]


def parent_groups(dataset: h5py.Dataset) -> list[h5py.Group | h5py.Dataset]:
    groups: list[h5py.Group | h5py.Dataset] = [dataset]
    current: h5py.Group | h5py.Dataset = dataset

    while current.name != "/":
        parent = current.parent
        groups.append(parent)
        current = parent

    return groups


def find_where_groups(dataset: h5py.Dataset, handle: h5py.File) -> list[h5py.Group | h5py.Dataset]:
    groups: list[h5py.Group | h5py.Dataset] = []

    for group in parent_groups(dataset):
        where = group.get("where") if isinstance(group, h5py.Group) else None
        if isinstance(where, (h5py.Group, h5py.Dataset)):
            groups.append(where)
        groups.append(group)

    root_where = handle.get("where")
    if isinstance(root_where, (h5py.Group, h5py.Dataset)):
        groups.insert(0, root_where)

    return groups


def parse_timestamp(handle: h5py.File, dataset: h5py.Dataset) -> str | None:
    groups = parent_groups(dataset)
    root_what = handle.get("what")
    if isinstance(root_what, (h5py.Group, h5py.Dataset)):
        groups.insert(0, root_what)

    date_value = normalize_text(first_attr(groups, ["date", "startdate", "enddate"]))
    time_value = normalize_text(first_attr(groups, ["time", "starttime", "endtime"]))

    if date_value and time_value:
        compact_time = time_value.ljust(6, "0")[:6]
        try:
            parsed = datetime.strptime(f"{date_value}{compact_time}", "%Y%m%d%H%M%S")
            return parsed.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            pass

    for group in groups:
        for value in attrs_dict(group).values():
            text = normalize_text(value)
            if "T" in text and text.endswith("Z"):
                try:
                    return datetime.fromisoformat(text.replace("Z", "+00:00")).isoformat().replace("+00:00", "Z")
                except ValueError:
                    continue

    return None


def parse_projection(where_groups: list[h5py.Group | h5py.Dataset]) -> tuple[str | None, str | None]:
    projection = first_attr(where_groups, ["projdef", "projection", "proj_id", "projstr"])
    projection_text = normalize_text(projection) or None

    if not projection_text or CRS is None:
        return projection_text, None

    try:
        crs = CRS.from_user_input(projection_text)
        crs.to_string()
        return projection_text, None
    except Exception as error:
        return projection_text, f"Projection metadata was found but pyproj could not parse it: {error}"


def parse_geographic_corners(where_groups: list[h5py.Group | h5py.Dataset]) -> tuple[dict[str, tuple[float, float]] | None, str | None]:
    values: dict[str, float] = {}

    for name in ["LL_lon", "LL_lat", "LR_lon", "LR_lat", "UL_lon", "UL_lat", "UR_lon", "UR_lat"]:
        value = number_or_none(first_attr(where_groups, [name, name.lower()]))
        if value is not None:
            values[name] = value

    if len(values) == 8:
        return {
            "topLeft": (values["UL_lon"], values["UL_lat"]),
            "topRight": (values["UR_lon"], values["UR_lat"]),
            "bottomRight": (values["LR_lon"], values["LR_lat"]),
            "bottomLeft": (values["LL_lon"], values["LL_lat"]),
        }, None

    missing = [name for name in ["LL_lon", "LL_lat", "LR_lon", "LR_lat", "UL_lon", "UL_lat", "UR_lon", "UR_lat"] if name not in values]
    return None, f"Corner lon/lat attributes are missing or unreadable: {', '.join(missing)}."


def valid_lon_lat(lon: float, lat: float) -> bool:
    return math.isfinite(lon) and math.isfinite(lat) and -180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0


def parse_georeferencing(
    where_groups: list[h5py.Group | h5py.Dataset],
    projection: str | None,
) -> tuple[dict[str, float] | None, list[list[float]] | None, dict[str, float] | None, str | None]:
    corners, corner_warning = parse_geographic_corners(where_groups)
    if corner_warning or not corners:
        return None, None, None, corner_warning

    if not projection:
        return None, None, None, "Projection metadata is missing."

    if CRS is None or Transformer is None:
        return None, None, None, "pyproj is unavailable, so projected OPERA corners cannot be transformed."

    try:
        source_crs = CRS.from_user_input(projection)
        to_projected = Transformer.from_crs("EPSG:4326", source_crs, always_xy=True)
        to_geographic = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
    except Exception as error:
        return None, None, None, f"Projection transformer could not be created: {error}"

    ordered_keys = ["topLeft", "topRight", "bottomRight", "bottomLeft"]
    projected: dict[str, tuple[float, float]] = {}

    try:
        for key in ordered_keys:
            lon, lat = corners[key]
            x, y = to_projected.transform(lon, lat)
            if not math.isfinite(x) or not math.isfinite(y):
                return None, None, None, f"Projected corner {key} is invalid: {x}, {y}."
            projected[key] = (float(x), float(y))
    except Exception as error:
        return None, None, None, f"Corner projection failed: {error}"

    maplibre_coordinates: list[list[float]] = []
    try:
        for key in ordered_keys:
            x, y = projected[key]
            lon, lat = to_geographic.transform(x, y)
            if not valid_lon_lat(float(lon), float(lat)):
                return None, None, None, f"MapLibre coordinate {key} is invalid: {lon}, {lat}."
            maplibre_coordinates.append([float(lon), float(lat)])
    except Exception as error:
        return None, None, None, f"Corner transform to EPSG:4326 failed: {error}"

    xs = [point[0] for point in projected.values()]
    ys = [point[1] for point in projected.values()]
    lons = [point[0] for point in maplibre_coordinates]
    lats = [point[1] for point in maplibre_coordinates]

    projection_bounds = {
        "minX": min(xs),
        "minY": min(ys),
        "maxX": max(xs),
        "maxY": max(ys),
    }
    geographic_bounds = {
        "west": min(lons),
        "south": min(lats),
        "east": max(lons),
        "north": max(lats),
    }

    return projection_bounds, maplibre_coordinates, geographic_bounds, None


PALETTE_VERSION = "weyra-v3"
DIAGNOSTIC_PERCENTILES = [1, 5, 25, 50, 75, 95, 99]
SOURCE_GRID_NODATA = -9999.0


def colorize(dbz: np.ndarray, valid: np.ndarray) -> np.ndarray:
    # Neon-night ramp shared with the tiled pipeline (render_opera_tile.py "v5"):
    # saturated blue -> cyan -> green -> yellow -> orange -> pink -> magenta cores.
    stops = np.array(
        [
            [-10.0, 12, 80, 200, 36],
            [8.0, 12, 80, 200, 40],
            [14.0, 8, 145, 240, 70],
            [18.0, 15, 185, 235, 96],
            [22.0, 25, 220, 210, 124],
            [26.0, 35, 230, 165, 152],
            [30.0, 80, 235, 110, 176],
            [33.0, 150, 240, 75, 196],
            [36.0, 215, 240, 60, 210],
            [39.0, 250, 220, 50, 220],
            [43.0, 255, 175, 45, 228],
            [47.0, 255, 120, 45, 236],
            [50.0, 252, 70, 80, 242],
            [54.0, 240, 50, 150, 247],
            [58.0, 225, 55, 210, 251],
            [63.0, 205, 70, 240, 253],
            [70.0, 170, 90, 250, 255],
        ],
        dtype=np.float32,
    )

    rgba = np.zeros((*dbz.shape, 4), dtype=np.uint8)
    clipped = np.clip(dbz, stops[0, 0], stops[-1, 0])

    for channel in range(4):
        channel_values = np.interp(clipped, stops[:, 0], stops[:, channel + 1])
        rgba[..., channel] = np.clip(channel_values, 0, 255).astype(np.uint8)

    rgba[..., 3] = np.where(valid, rgba[..., 3], 0).astype(np.uint8)
    return rgba


def finite_array(values: np.ndarray) -> np.ndarray:
    flattened = values[np.isfinite(values)]
    return flattened.astype(np.float64, copy=False)


def value_range(values: np.ndarray) -> dict[str, float | None]:
    finite = finite_array(values)
    if finite.size == 0:
        return {"min": None, "max": None}
    return {"min": float(np.min(finite)), "max": float(np.max(finite))}


def percentile_stats(values: np.ndarray) -> dict[str, float | None]:
    finite = finite_array(values)
    if finite.size == 0:
        return {f"p{percentile}": None for percentile in DIAGNOSTIC_PERCENTILES}

    percentiles = np.percentile(finite, DIAGNOSTIC_PERCENTILES)
    return {
        f"p{percentile}": float(percentiles[index])
        for index, percentile in enumerate(DIAGNOSTIC_PERCENTILES)
    }


def mask_for_value(data: np.ndarray, value: float | None) -> np.ndarray:
    if value is None:
        return np.zeros(data.shape, dtype=bool)
    return data == value


def corners_dict(coordinates: list[list[float]] | None) -> dict[str, list[float]] | None:
    if not coordinates or len(coordinates) != 4:
        return None
    return {
        "topLeft": coordinates[0],
        "topRight": coordinates[1],
        "bottomRight": coordinates[2],
        "bottomLeft": coordinates[3],
    }


def build_diagnostic(
    *,
    data_path: str,
    dataset: h5py.Dataset,
    raw_data: np.ndarray,
    data: np.ndarray,
    dbz: np.ndarray,
    valid: np.ndarray,
    rgba: np.ndarray,
    gain: float,
    offset: float,
    nodata: float | None,
    undetect: float | None,
    projection: str | None,
    projection_bounds: dict[str, float] | None,
    maplibre_coordinates: list[list[float]] | None,
    geographic_bounds: dict[str, float] | None,
    warning: str | None,
) -> dict[str, Any]:
    nodata_mask = mask_for_value(data, nodata)
    undetect_mask = mask_for_value(data, undetect)
    finite_mask = np.isfinite(data)
    transparent = rgba[..., 3] == 0
    visible = rgba[..., 3] > 0
    invalid_mask = ~valid
    invalid_colored = invalid_mask & visible
    visible_dbz = dbz[valid]

    nodata_count = int(np.count_nonzero(nodata_mask))
    undetect_count = int(np.count_nonzero(undetect_mask))
    transparent_pixel_count = int(np.count_nonzero(transparent))
    visible_precipitation_count = int(np.count_nonzero(visible))

    dbz_range = value_range(visible_dbz)
    raw_range = value_range(data)
    plausible_min = dbz_range["min"] is None or dbz_range["min"] >= -40
    plausible_max = dbz_range["max"] is None or dbz_range["max"] <= 80

    nodata_transparent = True if nodata_count == 0 else bool(np.all(transparent[nodata_mask]))
    undetect_transparent = True if undetect_count == 0 else bool(np.all(transparent[undetect_mask]))
    nonfinite_transparent = True if np.count_nonzero(~finite_mask) == 0 else bool(np.all(transparent[~finite_mask]))
    invalid_colored_count = int(np.count_nonzero(invalid_colored))

    return {
        "event": "opera_dbzh_diagnostic",
        "hdf5DataPath": data_path,
        "datasetShape": list(dataset.shape),
        "rawShape": list(raw_data.shape),
        "rawDtype": str(dataset.dtype),
        "rawRange": raw_range,
        "rawPercentiles": percentile_stats(data),
        "gain": gain,
        "offset": offset,
        "nodata": nodata,
        "undetect": undetect,
        "totalPixels": int(data.size),
        "nodataPixelCount": nodata_count,
        "undetectPixelCount": undetect_count,
        "transparentPixelCount": transparent_pixel_count,
        "visiblePrecipitationPixelCount": visible_precipitation_count,
        "invalidColoredPixelCount": invalid_colored_count,
        "dbzhRange": dbz_range,
        "dbzhPercentiles": percentile_stats(visible_dbz),
        "projection": projection,
        "projectionBounds": projection_bounds,
        "geographicBounds": geographic_bounds,
        "mapLibreCoordinates": maplibre_coordinates,
        "mapLibreCorners": corners_dict(maplibre_coordinates),
        "checks": {
            "nodataExcludedBeforePalette": nodata_transparent,
            "undetectExcludedBeforePalette": undetect_transparent,
            "nonFiniteExcludedBeforePalette": nonfinite_transparent,
            "pixelsWithoutEchoTransparent": undetect_transparent,
            "noInvalidPixelColored": invalid_colored_count == 0,
            "dbzhRangeLooksMeteorological": bool(plausible_min and plausible_max),
            "transparentPixelsMatchInvalidMask": transparent_pixel_count == int(np.count_nonzero(invalid_mask)),
        },
        "diagnostic": {
            "dbzhDecodingLooksCorrect": bool(plausible_min and plausible_max and invalid_colored_count == 0),
            "transparencyLooksCorrect": bool(nodata_transparent and undetect_transparent and nonfinite_transparent and invalid_colored_count == 0),
            "paletteLikelyPrimaryIssue": False,
            "smoothingLikelyIssue": True,
            "fourCornerLaeaWarpLikelyIssue": bool(projection and "laea" in projection.lower() and maplibre_coordinates),
            "mixedCauseLikely": True,
            "summary": (
                "Le décodage DBZH et la transparence semblent cohérents si les contrôles sont tous vrais. "
                "Le flou et les étirements attendus viennent surtout du rééchantillonnage d'une grille LAEA "
                "et de sa pose dans MapLibre avec quatre coins géographiques."
            ),
        },
        "warning": warning,
        "palette": PALETTE_VERSION,
    }


def write_source_grid(
    output_path: Path,
    dbz: np.ndarray,
    valid: np.ndarray,
    projection: str | None,
    projection_bounds: dict[str, float] | None,
) -> dict[str, Any]:
    if rasterio is None or from_bounds is None:
        return {
            "tileReady": False,
            "warning": "rasterio is unavailable. Install Python dependencies with: python -m pip install -r radar-worker\\requirements.txt",
        }

    if not projection or not projection_bounds:
        return {
            "tileReady": False,
            "warning": "Source grid cannot be written because OPERA projection metadata is incomplete.",
        }

    width = int(dbz.shape[1])
    height = int(dbz.shape[0])
    min_x = float(projection_bounds["minX"])
    min_y = float(projection_bounds["minY"])
    max_x = float(projection_bounds["maxX"])
    max_y = float(projection_bounds["maxY"])
    transform = from_bounds(min_x, min_y, max_x, max_y, width, height)
    source = np.where(valid, dbz, SOURCE_GRID_NODATA).astype(np.float32, copy=False)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        output_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs=projection,
        transform=transform,
        nodata=SOURCE_GRID_NODATA,
        compress="deflate",
        predictor=3,
        tiled=True,
        blockxsize=256,
        blockysize=256,
        BIGTIFF="IF_SAFER",
    ) as destination:
        destination.write(source, 1)
        destination.update_tags(
            source="EUMETNET OPERA",
            product="DBZH",
            palette=PALETTE_VERSION,
            note="Decoded DBZH values. nodata and undetect are stored as the GeoTIFF nodata value.",
        )

    return {
        "tileReady": True,
        "sourceGridPath": str(output_path),
        "sourceGridCrs": projection,
        "sourceGridTransform": [float(value) for value in transform.to_gdal()],
        "sourceGridWidth": width,
        "sourceGridHeight": height,
        "sourceGridNodata": SOURCE_GRID_NODATA,
        "sourceGridPixelSize": {
            "x": abs(float(transform.a)),
            "y": abs(float(transform.e)),
        },
        "warning": None,
    }


def summarize_hdf5(handle: h5py.File, selected_path: str) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []

    def visit(name: str, node: h5py.Group | h5py.Dataset) -> None:
        if len(entries) >= 80:
            return

        if isinstance(node, h5py.Dataset):
            entries.append({
                "path": node.name,
                "kind": "dataset",
                "shape": list(node.shape),
                "dtype": str(node.dtype),
            })
        elif isinstance(node, h5py.Group):
            attrs = attrs_dict(node)
            compact_attrs = {
                key: attrs[key]
                for key in ["quantity", "gain", "offset", "nodata", "undetect", "date", "time", "projdef"]
                if key in attrs
            }
            entries.append({
                "path": node.name,
                "kind": "group",
                "attrs": compact_attrs,
            })

    handle.visititems(visit)
    return {
        "event": "hdf5_structure",
        "selectedDataPath": selected_path,
        "entryCount": len(entries),
        "truncated": len(entries) >= 80,
        "entries": entries,
    }


def render(
    input_path: Path,
    output_path: Path,
    metadata_path: Path,
    diagnostic_path: Path | None = None,
    native_output_path: Path | None = None,
    source_grid_path: Path | None = None,
) -> None:
    with h5py.File(input_path, "r") as handle:
        data_path, dataset, quantity_node, quantity_attrs = find_dbzh_dataset(handle)
        raw_data = np.asarray(dataset)
        if raw_data.ndim > 2:
            raw_data = raw_data[0]

        data = raw_data.astype(np.float32, copy=False)
        groups = [quantity_node, *parent_groups(dataset)]
        gain = number_or_none(first_attr(groups, ["gain"])) or 1.0
        offset = number_or_none(first_attr(groups, ["offset"])) or 0.0
        nodata = number_or_none(first_attr(groups, ["nodata"]))
        undetect = number_or_none(first_attr(groups, ["undetect"]))
        quantity = normalize_text(quantity_attrs.get("quantity")) or "DBZH"

        valid = np.isfinite(data)
        if nodata is not None:
            valid &= data != nodata
        if undetect is not None:
            valid &= data != undetect

        dbz = data * gain + offset
        rgba = colorize(dbz, valid)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgba, "RGBA").save(output_path, "WEBP", lossless=True, method=6)
        if native_output_path is not None:
            native_output_path.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(rgba, "RGBA").save(native_output_path, "WEBP", lossless=True, method=6)

        where_groups = find_where_groups(dataset, handle)
        projection, projection_warning = parse_projection(where_groups)
        projection_bounds, maplibre_coordinates, geographic_bounds, georef_warning = parse_georeferencing(where_groups, projection)
        has_georeferencing = bool(projection_bounds and maplibre_coordinates and geographic_bounds)
        warnings = [warning for warning in [projection_warning, georef_warning] if warning]
        if not has_georeferencing and not warnings:
            warnings.append("Georeferencing metadata is incomplete or unreadable.")

        source_grid = {
            "tileReady": False,
            "sourceGridPath": None,
            "sourceGridCrs": None,
            "sourceGridTransform": None,
            "sourceGridWidth": None,
            "sourceGridHeight": None,
            "sourceGridNodata": None,
            "sourceGridPixelSize": None,
        }
        if source_grid_path is not None:
            source_grid = write_source_grid(source_grid_path, dbz, valid, projection, projection_bounds)
            if source_grid.get("warning"):
                warnings.append(str(source_grid["warning"]))

        metadata = {
            "source": "EUMETNET OPERA",
            "timestamp": parse_timestamp(handle, dataset),
            "quantity": quantity,
            "gain": gain,
            "offset": offset,
            "nodata": nodata,
            "undetect": undetect,
            "width": int(data.shape[1]),
            "height": int(data.shape[0]),
            "projection": projection,
            "projectionBounds": projection_bounds,
            "mapLibreCoordinates": maplibre_coordinates,
            "geographicBounds": geographic_bounds,
            "bbox": geographic_bounds,
            "hasGeoreferencing": has_georeferencing,
            "renderedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "warning": " ".join(warnings) if warnings else None,
            "hdf5DataPath": data_path,
            "palette": PALETTE_VERSION,
            "sourceGridPath": source_grid.get("sourceGridPath"),
            "sourceGridCrs": source_grid.get("sourceGridCrs"),
            "sourceGridTransform": source_grid.get("sourceGridTransform"),
            "sourceGridWidth": source_grid.get("sourceGridWidth"),
            "sourceGridHeight": source_grid.get("sourceGridHeight"),
            "sourceGridNodata": source_grid.get("sourceGridNodata"),
            "sourceGridPixelSize": source_grid.get("sourceGridPixelSize"),
            "tileReady": bool(source_grid.get("tileReady")),
        }

        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        if diagnostic_path is not None:
            diagnostic = build_diagnostic(
                data_path=data_path,
                dataset=dataset,
                raw_data=raw_data,
                data=data,
                dbz=dbz,
                valid=valid,
                rgba=rgba,
                gain=gain,
                offset=offset,
                nodata=nodata,
                undetect=undetect,
                projection=projection,
                projection_bounds=projection_bounds,
                maplibre_coordinates=maplibre_coordinates,
                geographic_bounds=geographic_bounds,
                warning=" ".join(warnings) if warnings else None,
            )
            diagnostic_path.parent.mkdir(parents=True, exist_ok=True)
            diagnostic_path.write_text(json.dumps(diagnostic, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(summarize_hdf5(handle, data_path), ensure_ascii=False), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render an OPERA ODIM HDF5 DBZH composite to transparent WebP.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--diagnostic", type=Path)
    parser.add_argument("--native-output", type=Path)
    parser.add_argument("--source-grid", type=Path)
    args = parser.parse_args()

    try:
        render(args.input, args.output, args.metadata, args.diagnostic, args.native_output, args.source_grid)
        return 0
    except Exception as error:
        print(f"render_opera.py failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
