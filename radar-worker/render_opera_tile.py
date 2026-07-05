#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

try:
    import mercantile
    import rasterio
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, reproject
except Exception as import_error:
    mercantile = None
    rasterio = None
    from_bounds = None
    Resampling = None
    reproject = None
    IMPORT_ERROR = import_error
else:
    IMPORT_ERROR = None


TILE_SIZE = 256
GUTTER_PIXELS = 2
TARGET_CRS = "EPSG:3857"
TILE_RENDER_VERSION = "v3c"
STRONG_ECHO_DBZH = 35.0

WEYRA_DBZH_DISPLAY_V1 = {
    "displayVersion": "v1",
    "thresholdDbzh": -10.0,
    "alphaRampDbzh": [-10.0, 0.0],
    "stops": [
        [-10.0, 32, 73, 176, 48],
        [0.0, 42, 118, 224, 110],
        [8.0, 46, 159, 255, 160],
        [16.0, 37, 213, 212, 195],
        [24.0, 132, 219, 53, 220],
        [32.0, 255, 219, 61, 235],
        [40.0, 251, 139, 66, 245],
        [48.0, 230, 70, 121, 250],
        [58.0, 189, 60, 233, 255],
        [70.0, 143, 66, 236, 255],
    ],
}

WEYRA_DBZH_DISPLAY_V2 = {
    "displayVersion": "v2",
    "thresholdDbzh": 4.0,
    "alphaRampDbzh": [4.0, 10.0],
    "stops": [
        [4.0, 31, 91, 158, 0],
        [6.0, 30, 112, 190, 24],
        [8.0, 29, 137, 220, 44],
        [10.0, 32, 158, 224, 58],
        [16.0, 37, 196, 218, 78],
        [25.0, 54, 192, 127, 104],
        [34.0, 159, 211, 70, 132],
        [42.0, 245, 178, 59, 156],
        [50.0, 226, 82, 78, 178],
        [58.0, 205, 70, 158, 188],
        [70.0, 174, 72, 214, 194],
    ],
}

WEYRA_DBZH_DISPLAY_V3 = {
    "displayVersion": "v3",
    "thresholdDbzh": 5.5,
    "alphaRampDbzh": [5.5, 11.0],
    "stops": [
        [5.5, 28, 83, 156, 0],
        [7.0, 28, 97, 174, 18],
        [9.0, 29, 116, 190, 32],
        [11.0, 30, 135, 204, 48],
        [14.0, 31, 154, 211, 62],
        [18.0, 34, 180, 203, 78],
        [23.0, 39, 200, 180, 98],
        [27.0, 62, 192, 126, 116],
        [32.0, 116, 202, 75, 138],
        [35.0, 212, 203, 72, 160],
        [39.0, 240, 165, 58, 178],
        [42.0, 234, 117, 55, 192],
        [46.0, 221, 82, 72, 208],
        [50.0, 207, 62, 103, 220],
        [58.0, 188, 63, 160, 226],
        [70.0, 156, 70, 210, 230],
    ],
}

WEYRA_DBZH_DISPLAY_V3B = {
    **WEYRA_DBZH_DISPLAY_V3,
    "displayVersion": "v3b",
}

WEYRA_DBZH_DISPLAY_V3C = {
    **WEYRA_DBZH_DISPLAY_V3,
    "displayVersion": "v3c",
    "stops": [
        [5.5, 18, 91, 255, 0],
        [7.0, 20, 121, 255, 18],
        [9.0, 18, 164, 255, 32],
        [11.0, 25, 199, 255, 48],
        [14.0, 49, 230, 255, 62],
        [18.0, 35, 246, 212, 78],
        [23.0, 30, 231, 183, 98],
        [27.0, 37, 245, 140, 116],
        [32.0, 108, 255, 78, 138],
        [35.0, 244, 249, 74, 160],
        [39.0, 255, 212, 61, 178],
        [42.0, 255, 159, 46, 192],
        [46.0, 255, 91, 48, 208],
        [50.0, 255, 47, 68, 220],
        [58.0, 231, 67, 255, 226],
        [70.0, 155, 92, 255, 230],
    ],
}

DISPLAY_CONFIGS = {
    "v1": WEYRA_DBZH_DISPLAY_V1,
    "v2": WEYRA_DBZH_DISPLAY_V2,
    "v3": WEYRA_DBZH_DISPLAY_V3,
    "v3b": WEYRA_DBZH_DISPLAY_V3B,
    "v3c": WEYRA_DBZH_DISPLAY_V3C,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def tile_bounds(z: int, x: int, y: int) -> tuple[dict[str, float], dict[str, float]]:
    if mercantile is None:
        raise RuntimeError("mercantile is unavailable.")

    xy = mercantile.xy_bounds(mercantile.Tile(x=x, y=y, z=z))
    ll = mercantile.bounds(x, y, z)
    return (
        {"left": xy.left, "bottom": xy.bottom, "right": xy.right, "top": xy.top},
        {"west": ll.west, "south": ll.south, "east": ll.east, "north": ll.north},
    )


def colorize(dbz: np.ndarray, valid: np.ndarray, display_config: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    stops = np.array(display_config["stops"], dtype=np.float32)
    threshold = float(display_config["thresholdDbzh"])
    rgba = np.zeros((*dbz.shape, 4), dtype=np.uint8)
    clipped = np.clip(dbz, stops[0, 0], stops[-1, 0])

    for channel in range(4):
        channel_values = np.interp(clipped, stops[:, 0], stops[:, channel + 1])
        rgba[..., channel] = np.clip(channel_values, 0, 255).astype(np.uint8)

    visible = valid & np.isfinite(dbz) & (dbz >= threshold)
    rgba[..., 3] = np.where(visible, rgba[..., 3], 0).astype(np.uint8)
    return rgba, visible


def resampling_for_zoom(z: int, display_version: str) -> tuple[Any, str, str]:
    if Resampling is None:
        raise RuntimeError("rasterio Resampling is unavailable.")
    if z <= 6:
        if display_version in {"v3", "v3b", "v3c"}:
            return Resampling.average, "average-valid-dbzh-strong-max>=35", (
                "At broad zooms, valid DBZH pixels are averaged, with real maxima >=35 dBZ preserved so intense cores do not disappear in the average."
            )
        return Resampling.average, "average-valid-dbzh", (
            "At broad zooms, valid DBZH pixels are averaged during reprojection to reduce noisy striping without mixing nodata."
        )
    return Resampling.bilinear, "bilinear-dbzh", (
        "At zooms 7 and above, DBZH values use bilinear reprojection to avoid blocky close-zoom artifacts while preserving real gradients."
    )


def expanded_bounds(bounds_3857: dict[str, float], output_size: int, gutter_pixels: int) -> dict[str, float]:
    pixel_width = (bounds_3857["right"] - bounds_3857["left"]) / TILE_SIZE
    pixel_height = (bounds_3857["top"] - bounds_3857["bottom"]) / TILE_SIZE
    return {
        "left": bounds_3857["left"] - pixel_width * gutter_pixels,
        "bottom": bounds_3857["bottom"] - pixel_height * gutter_pixels,
        "right": bounds_3857["right"] + pixel_width * gutter_pixels,
        "top": bounds_3857["top"] + pixel_height * gutter_pixels,
    }


def write_metadata(path: Path | None, payload: dict[str, Any]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def save_tile(output_path: Path, rgba: np.ndarray) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(output_path, "WEBP", lossless=True, method=6)


def transparent_tile(
    timestamp: str | None,
    z: int,
    x: int,
    y: int,
    output_path: Path,
    metadata_path: Path | None,
    display_config: dict[str, Any],
) -> None:
    tile_bounds_3857, tile_bounds_4326 = tile_bounds(z, x, y)
    rgba = np.zeros((TILE_SIZE, TILE_SIZE, 4), dtype=np.uint8)
    save_tile(output_path, rgba)
    write_metadata(metadata_path, {
        "ok": True,
        "timestamp": timestamp,
        "z": z,
        "x": x,
        "y": y,
        "tileBounds3857": tile_bounds_3857,
        "tileBounds4326": tile_bounds_4326,
        "sourceCrs": None,
        "targetCrs": TARGET_CRS,
        "resampling": "transparent-outside-source",
        "displayVersion": display_config["displayVersion"],
        "displayConfig": {
            "thresholdDbzh": display_config["thresholdDbzh"],
            "alphaRampDbzh": display_config["alphaRampDbzh"],
        },
        "resamplingDBZH": "none",
        "resamplingAlpha": "none",
        "thresholdDbzh": display_config["thresholdDbzh"],
        "gutterPixels": GUTTER_PIXELS,
        "strongEchoPreservationUsed": False,
        "sourceGridWidth": None,
        "sourceGridHeight": None,
        "sourceGridPixelSize": None,
        "sourceValidPixels": 0,
        "validPixels": 0,
        "transparentPixels": TILE_SIZE * TILE_SIZE,
        "generatedAt": utc_now(),
    })


def render_tile(
    timestamp: str | None,
    input_path: Path,
    output_path: Path,
    z: int,
    x: int,
    y: int,
    metadata_path: Path | None,
    display_config: dict[str, Any],
) -> None:
    if rasterio is None or from_bounds is None or reproject is None or Resampling is None or mercantile is None:
        raise RuntimeError(
            "Python dependencies for OPERA tile reprojection are missing. "
            "Run: python -m pip install -r radar-worker\\requirements.txt. "
            f"Import error: {IMPORT_ERROR}"
        )

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
    alpha_resampling_label = "nearest-alpha"

    with rasterio.open(input_path) as source:
        nodata = source.nodata if source.nodata is not None else -9999.0
        destination = np.full((render_size, render_size), nodata, dtype=np.float32)
        destination_strong = np.full((render_size, render_size), nodata, dtype=np.float32)
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

        if display_config["displayVersion"] in {"v3", "v3b", "v3c"} and z <= 6:
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

        source_values = source.read(1, masked=False)
        source_mask = (np.isfinite(source_values) & (source_values != nodata)).astype(np.uint8)
        destination_mask = np.zeros((render_size, render_size), dtype=np.uint8)

        reproject(
            source=source_mask,
            destination=destination_mask,
            src_transform=source.transform,
            src_crs=source.crs,
            src_nodata=0,
            dst_transform=dst_transform,
            dst_crs=TARGET_CRS,
            dst_nodata=0,
            resampling=Resampling.nearest,
            init_dest_nodata=True,
        )

        inner = np.s_[GUTTER_PIXELS:GUTTER_PIXELS + TILE_SIZE, GUTTER_PIXELS:GUTTER_PIXELS + TILE_SIZE]
        destination_inner = destination[inner]
        if display_config["displayVersion"] in {"v3", "v3b", "v3c"} and z <= 6:
            strong_inner = destination_strong[inner]
            strong_mask = (
                np.isfinite(strong_inner)
                & (strong_inner != nodata)
                & (strong_inner >= STRONG_ECHO_DBZH)
            )
            if np.any(strong_mask):
                destination_inner = np.where(strong_mask, strong_inner, destination_inner)
                strong_echo_preservation_used = True
        mask_inner = destination_mask[inner]
        valid = (mask_inner > 0) & np.isfinite(destination_inner) & (destination_inner != nodata)
        rgba, visible = colorize(destination_inner, valid, display_config)
        save_tile(output_path, rgba)

        source_valid_pixels = int(np.count_nonzero(valid))
        visible_pixels = int(np.count_nonzero(visible))
        transparent_pixels = int((TILE_SIZE * TILE_SIZE) - visible_pixels)
        write_metadata(metadata_path, {
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
            "resamplingReason": f"{resampling_reason} Alpha is reprojected separately with nearest-neighbour to avoid nodata halos.",
            "displayVersion": display_config["displayVersion"],
            "displayConfig": {
                "thresholdDbzh": display_config["thresholdDbzh"],
                "alphaRampDbzh": display_config["alphaRampDbzh"],
                "stops": display_config["stops"],
            },
            "thresholdDbzh": display_config["thresholdDbzh"],
            "gutterPixels": GUTTER_PIXELS,
            "strongEchoPreservationUsed": strong_echo_preservation_used,
            "renderedPixelsWithGutter": render_size,
            "sourceGridWidth": int(source.width),
            "sourceGridHeight": int(source.height),
            "sourceGridPixelSize": {
                "x": abs(float(source.transform.a)),
                "y": abs(float(source.transform.e)),
            },
            "sourceValidPixels": source_valid_pixels,
            "validPixels": visible_pixels,
            "transparentPixels": transparent_pixels,
            "generatedAt": utc_now(),
        })


def main() -> int:
    parser = argparse.ArgumentParser(description="Render one OPERA DBZH Web Mercator raster tile from a local source GeoTIFF.")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--z", required=True, type=int)
    parser.add_argument("--x", required=True, type=int)
    parser.add_argument("--y", required=True, type=int)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--timestamp")
    parser.add_argument("--transparent", action="store_true")
    parser.add_argument("--display-version", choices=sorted(DISPLAY_CONFIGS.keys()), default=TILE_RENDER_VERSION)
    args = parser.parse_args()

    try:
        display_config = DISPLAY_CONFIGS[args.display_version]
        if args.transparent:
            transparent_tile(args.timestamp, args.z, args.x, args.y, args.output, args.metadata, display_config)
        else:
            if args.input is None:
                raise RuntimeError("--input is required unless --transparent is used.")
            render_tile(args.timestamp, args.input, args.output, args.z, args.x, args.y, args.metadata, display_config)
        return 0
    except Exception as error:
        print(f"render_opera_tile.py failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
