#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np

from render_opera_tile import (
    DISPLAY_CONFIGS,
    GUTTER_PIXELS,
    STRONG_ECHO_DBZH,
    TARGET_CRS,
    TILE_SIZE,
    alpha_resampling_for_zoom,
    colorize,
    display_smoothing_radius,
    expanded_bounds,
    resampling_for_zoom,
    save_tile,
    smooth_rgba,
    tile_bounds,
    utc_now,
)

try:
    import rasterio
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, reproject
except Exception as import_error:
    rasterio = None
    from_bounds = None
    Resampling = None
    reproject = None
    IMPORT_ERROR = import_error
else:
    IMPORT_ERROR = None


def cache_key(timestamp: str) -> str:
    return "".join(char for char in timestamp if char.isalnum() or char in "_-")


def read_jobs(path: Path) -> list[dict[str, int]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise RuntimeError("jobs.json must contain a list of XYZ tile jobs.")

    jobs: list[dict[str, int]] = []
    seen: set[tuple[int, int, int]] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise RuntimeError("Each tile job must be an object.")
        z = int(item["z"])
        x = int(item["x"])
        y = int(item["y"])
        key = (z, x, y)
        if key in seen:
            continue
        seen.add(key)
        jobs.append({"z": z, "x": x, "y": y})
    return jobs


def write_metadata(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def output_paths(output_root: Path, style: str, timestamp: str, z: int, x: int, y: int) -> tuple[Path, Path]:
    key = cache_key(timestamp)
    image_path = output_root / "tiles" / style / key / str(z) / str(x) / f"{y}.webp"
    metadata_path = output_root / "tile-meta" / style / key / str(z) / str(x) / f"{y}.json"
    return image_path, metadata_path


def render_one_tile(
    source: Any,
    source_values: np.ndarray,
    source_mask: np.ndarray,
    display_config: dict[str, Any],
    timestamp: str,
    output_root: Path,
    style: str,
    job: dict[str, int],
) -> dict[str, Any]:
    z = job["z"]
    x = job["x"]
    y = job["y"]
    image_path, metadata_path = output_paths(output_root, style, timestamp, z, x, y)
    image_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)

    tile_bounds_3857, tile_bounds_4326 = tile_bounds(z, x, y)
    render_size = TILE_SIZE + GUTTER_PIXELS * 2
    render_bounds_3857 = expanded_bounds(tile_bounds_3857, render_size, GUTTER_PIXELS)
    dst_transform = from_bounds(
        render_bounds_3857["left"],
        render_bounds_3857["bottom"],
        render_bounds_3857["right"],
        render_bounds_3857["top"],
        render_size,
        render_size,
    )
    dbzh_resampling, dbzh_resampling_label, resampling_reason = resampling_for_zoom(z, display_config["displayVersion"])
    alpha_resampling, alpha_resampling_label = alpha_resampling_for_zoom(z, display_config["displayVersion"])
    nodata = source.nodata if source.nodata is not None else -9999.0

    destination = np.full((render_size, render_size), nodata, dtype=np.float32)
    destination_strong = np.full((render_size, render_size), nodata, dtype=np.float32)
    destination_mask = np.zeros((render_size, render_size), dtype=np.float32)
    strong_echo_preservation_used = False

    reproject(
        source=rasterio.band(source, 1),
        destination=destination,
        src_transform=source.transform,
        src_crs=source.crs,
        src_nodata=nodata,
        dst_transform=dst_transform,
        dst_crs=TARGET_CRS,
        dst_nodata=nodata,
        resampling=dbzh_resampling,
        init_dest_nodata=True,
    )

    if display_config["displayVersion"] in {"v3", "v3b", "v3c", "v4a", "v5"} and z <= 6:
        reproject(
            source=rasterio.band(source, 1),
            destination=destination_strong,
            src_transform=source.transform,
            src_crs=source.crs,
            src_nodata=nodata,
            dst_transform=dst_transform,
            dst_crs=TARGET_CRS,
            dst_nodata=nodata,
            resampling=Resampling.max,
            init_dest_nodata=True,
        )

    reproject(
        source=source_mask,
        destination=destination_mask,
        src_transform=source.transform,
        src_crs=source.crs,
        src_nodata=0,
        dst_transform=dst_transform,
        dst_crs=TARGET_CRS,
        dst_nodata=0,
        resampling=alpha_resampling,
        init_dest_nodata=True,
    )

    inner = np.s_[GUTTER_PIXELS:GUTTER_PIXELS + TILE_SIZE, GUTTER_PIXELS:GUTTER_PIXELS + TILE_SIZE]
    if display_config["displayVersion"] in {"v3", "v3b", "v3c", "v4a", "v5"} and z <= 6:
        strong_mask = (
            np.isfinite(destination_strong)
            & (destination_strong != nodata)
            & (destination_strong >= STRONG_ECHO_DBZH)
        )
        if np.any(strong_mask):
            destination = np.where(strong_mask, destination_strong, destination)
            strong_echo_preservation_used = True

    valid_full = (destination_mask > 0.01) & np.isfinite(destination) & (destination != nodata)
    coverage = destination_mask if display_config["displayVersion"] in {"v4a", "v5"} else None
    rgba_full, visible_full = colorize(destination, valid_full, display_config, coverage)
    smoothing_radius = display_smoothing_radius(z, display_config["displayVersion"])
    rgba_full = smooth_rgba(rgba_full, smoothing_radius)
    rgba = rgba_full[inner]
    visible = rgba[..., 3] > 0
    valid = valid_full[inner]
    save_tile(image_path, rgba)

    visible_pixels = int(np.count_nonzero(visible))
    transparent_pixels = int((TILE_SIZE * TILE_SIZE) - visible_pixels)
    metadata = {
        "ok": True,
        "timestamp": timestamp,
        "z": z,
        "x": x,
        "y": y,
        "tileBounds3857": tile_bounds_3857,
        "tileBounds4326": tile_bounds_4326,
        "sourceCrs": source.crs.to_string() if source.crs else None,
        "targetCrs": TARGET_CRS,
        "resampling": f"{dbzh_resampling_label}-{alpha_resampling_label}",
        "resamplingDBZH": dbzh_resampling_label,
        "resamplingAlpha": alpha_resampling_label,
        "resamplingReason": f"{resampling_reason} Alpha uses a separate source-coverage mask ({alpha_resampling_label}) and never mixes nodata into DBZH.",
        "displayVersion": display_config["displayVersion"],
        "displayConfig": {
            "thresholdDbzh": display_config["thresholdDbzh"],
            "alphaRampDbzh": display_config["alphaRampDbzh"],
            "stops": display_config["stops"],
        },
        "thresholdDbzh": display_config["thresholdDbzh"],
        "gutterPixels": GUTTER_PIXELS,
        "displaySmoothingPixels": smoothing_radius,
        "strongEchoPreservationUsed": strong_echo_preservation_used,
        "renderedPixelsWithGutter": render_size,
        "sourceGridWidth": int(source.width),
        "sourceGridHeight": int(source.height),
        "sourceGridPixelSize": {
            "x": abs(float(source.transform.a)),
            "y": abs(float(source.transform.e)),
        },
        "sourceValidPixels": int(np.count_nonzero(valid)),
        "validPixels": visible_pixels,
        "transparentPixels": transparent_pixels,
        "generatedAt": utc_now(),
    }
    write_metadata(metadata_path, metadata)
    return {
        "z": z,
        "x": x,
        "y": y,
        "imagePath": str(image_path),
        "metadataPath": str(metadata_path),
        "visiblePixels": visible_pixels,
        "transparentPixels": transparent_pixels,
        "resamplingDBZH": dbzh_resampling_label,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-render OPERA DBZH Web Mercator raster tiles from one source GeoTIFF.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--jobs", required=True, type=Path)
    parser.add_argument("--style", required=True, choices=sorted(DISPLAY_CONFIGS.keys()))
    parser.add_argument("--timestamp", required=True)
    parser.add_argument("--output-root", required=True, type=Path)
    args = parser.parse_args()

    try:
        if rasterio is None or from_bounds is None or reproject is None or Resampling is None:
            raise RuntimeError(
                "Python dependencies for OPERA tile reprojection are missing. "
                "Run: python -m pip install -r radar-worker\\requirements.txt. "
                f"Import error: {IMPORT_ERROR}"
            )

        jobs = read_jobs(args.jobs)
        display_config = DISPLAY_CONFIGS[args.style]
        generated: list[dict[str, Any]] = []

        with rasterio.open(args.input) as source:
            nodata = source.nodata if source.nodata is not None else -9999.0
            source_values = source.read(1, masked=False)
            source_mask = (np.isfinite(source_values) & (source_values != nodata)).astype(np.float32)
            for job in jobs:
                generated.append(render_one_tile(
                    source,
                    source_values,
                    source_mask,
                    display_config,
                    args.timestamp,
                    args.output_root,
                    args.style,
                    job,
                ))

        print(json.dumps({
            "ok": True,
            "timestamp": args.timestamp,
            "style": args.style,
            "requested": len(jobs),
            "generated": len(generated),
            "tiles": generated,
        }, ensure_ascii=False), flush=True)
        return 0
    except Exception as error:
        print(f"render_opera_tiles_batch.py failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
