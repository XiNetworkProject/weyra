#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter

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
TILE_RENDER_VERSION = "v5"
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

WEYRA_DBZH_DISPLAY_V4A = {
    **WEYRA_DBZH_DISPLAY_V3,
    "displayVersion": "v4a",
    "thresholdDbzh": 10.0,
    "alphaRampDbzh": [10.0, 16.0],
    "stops": [
        [10.0, 8, 107, 220, 0],
        [13.0, 0, 143, 232, 30],
        [16.0, 0, 176, 235, 64],
        [20.0, 0, 205, 229, 92],
        [24.0, 0, 217, 203, 116],
        [28.0, 0, 216, 166, 142],
        [32.0, 30, 209, 124, 166],
        [35.0, 101, 210, 85, 188],
        [38.0, 183, 216, 67, 206],
        [42.0, 244, 219, 59, 220],
        [46.0, 255, 159, 49, 231],
        [50.0, 255, 73, 63, 240],
        [55.0, 240, 46, 146, 246],
        [60.0, 213, 59, 209, 250],
        [70.0, 158, 62, 236, 252],
    ],
}

WEYRA_DBZH_DISPLAY_V5 = {
    **WEYRA_DBZH_DISPLAY_V3,
    "displayVersion": "v5",
    # Palette « néon nuit » : la pluie devient lumineuse sur le fond bleu très profond.
    # Bleu saturé -> cyan -> vert -> jaune -> orange -> rose -> magenta pour les noyaux.
    "thresholdDbzh": 8.0,
    "alphaRampDbzh": [8.0, 14.0],
    "stops": [
        [8.0, 12, 80, 200, 0],
        [11.0, 10, 110, 225, 36],
        [14.0, 8, 145, 240, 64],
        [18.0, 15, 185, 235, 92],
        [22.0, 25, 220, 210, 120],
        [26.0, 35, 230, 165, 148],
        [30.0, 80, 235, 110, 172],
        [33.0, 150, 240, 75, 192],
        [36.0, 215, 240, 60, 208],
        [39.0, 250, 220, 50, 218],
        [43.0, 255, 175, 45, 226],
        [47.0, 255, 120, 45, 234],
        [50.0, 252, 70, 80, 240],
        [54.0, 240, 50, 150, 245],
        [58.0, 225, 55, 210, 250],
        [63.0, 205, 70, 240, 252],
        [70.0, 170, 90, 250, 255],
    ],
}

DISPLAY_CONFIGS = {
    "v1": WEYRA_DBZH_DISPLAY_V1,
    "v2": WEYRA_DBZH_DISPLAY_V2,
    "v3": WEYRA_DBZH_DISPLAY_V3,
    "v3b": WEYRA_DBZH_DISPLAY_V3B,
    "v3c": WEYRA_DBZH_DISPLAY_V3C,
    "v4a": WEYRA_DBZH_DISPLAY_V4A,
    "v5": WEYRA_DBZH_DISPLAY_V5,
    "v5-mf": WEYRA_DBZH_DISPLAY_V5,
    "v5-mf-opera": WEYRA_DBZH_DISPLAY_V5,
}

# Versions that use the smooth, coverage-feathered, strong-echo-preserving pipeline.
SMOOTH_DISPLAY_VERSIONS = {"v4a", "v5"}


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


def colorize(
    dbz: np.ndarray,
    valid: np.ndarray,
    display_config: dict[str, Any],
    coverage: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    stops = np.array(display_config["stops"], dtype=np.float32)
    threshold = float(display_config["thresholdDbzh"])
    rgba = np.zeros((*dbz.shape, 4), dtype=np.uint8)
    clipped = np.clip(dbz, stops[0, 0], stops[-1, 0])

    for channel in range(4):
        channel_values = np.interp(clipped, stops[:, 0], stops[:, channel + 1])
        rgba[..., channel] = np.clip(channel_values, 0, 255).astype(np.uint8)

    visible = valid & np.isfinite(dbz) & (dbz >= threshold)
    alpha = rgba[..., 3].astype(np.float32)
    if coverage is not None:
        # Coverage is a display-only edge mask. DBZH is still reprojected independently with
        # nodata awareness; this merely feathers the outer pixel of a real echo instead of
        # exposing the source grid as hard 1 km squares.
        edge_weight = np.power(np.clip(coverage, 0.0, 1.0), 0.7)
        alpha *= edge_weight
    rgba[..., 3] = np.where(visible, np.rint(alpha), 0).astype(np.uint8)
    rgba[~visible] = 0
    return rgba, visible


def display_smoothing_radius(z: int, display_version: str) -> float:
    if display_version not in SMOOTH_DISPLAY_VERSIONS:
        return 0.0
    if display_version == "v5":
        # Neon look: slightly wider feather so echoes glow instead of looking pixel-sharp.
        return 0.45 if z <= 6 else 0.7
    return 0.35 if z <= 6 else 0.55


def smooth_rgba(rgba: np.ndarray, radius: float) -> np.ndarray:
    if radius <= 0:
        return rgba

    alpha = rgba[..., 3].astype(np.float32) / 255.0
    premultiplied = np.rint(rgba[..., :3].astype(np.float32) * alpha[..., None]).astype(np.uint8)
    blurred_alpha = np.asarray(
        Image.fromarray(rgba[..., 3], "L").filter(ImageFilter.GaussianBlur(radius=radius)),
        dtype=np.uint8,
    )
    blurred_premultiplied = np.stack([
        np.asarray(
            Image.fromarray(premultiplied[..., channel], "L").filter(ImageFilter.GaussianBlur(radius=radius)),
            dtype=np.uint8,
        )
        for channel in range(3)
    ], axis=-1)

    output = np.zeros_like(rgba)
    output[..., 3] = blurred_alpha
    nonzero = blurred_alpha >= 3
    alpha_float = blurred_alpha.astype(np.float32) / 255.0
    output[..., :3][nonzero] = np.clip(
        blurred_premultiplied[nonzero].astype(np.float32) / alpha_float[nonzero, None],
        0,
        255,
    ).astype(np.uint8)
    output[~nonzero] = 0
    return output


def resampling_for_zoom(z: int, display_version: str) -> tuple[Any, str, str]:
    if Resampling is None:
        raise RuntimeError("rasterio Resampling is unavailable.")
    if z <= 6:
        if display_version in {"v3", "v3b", "v3c", "v4a", "v5"}:
            return Resampling.average, "average-valid-dbzh-strong-max>=35", (
                "At broad zooms, valid DBZH pixels are averaged, with real maxima >=35 dBZ preserved so intense cores do not disappear in the average."
            )
        return Resampling.average, "average-valid-dbzh", (
            "At broad zooms, valid DBZH pixels are averaged during reprojection to reduce noisy striping without mixing nodata."
        )
    return Resampling.bilinear, "bilinear-dbzh", (
        "At zooms 7 and above, DBZH values use bilinear reprojection to avoid blocky close-zoom artifacts while preserving real gradients."
    )


def alpha_resampling_for_zoom(z: int, display_version: str) -> tuple[Any, str]:
    if Resampling is None:
        raise RuntimeError("rasterio Resampling is unavailable.")
    if display_version not in SMOOTH_DISPLAY_VERSIONS:
        return Resampling.nearest, "nearest-alpha"
    if z <= 6:
        return Resampling.average, "average-coverage-alpha"
    return Resampling.bilinear, "bilinear-coverage-alpha"


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
    alpha_resampling, alpha_resampling_label = alpha_resampling_for_zoom(z, display_config["displayVersion"])

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

        source_values = source.read(1, masked=False)
        source_mask = (np.isfinite(source_values) & (source_values != nodata)).astype(np.float32)
        destination_mask = np.zeros((render_size, render_size), dtype=np.float32)

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
        coverage = destination_mask if display_config["displayVersion"] in SMOOTH_DISPLAY_VERSIONS else None
        rgba_full, visible_full = colorize(destination, valid_full, display_config, coverage)
        smoothing_radius = display_smoothing_radius(z, display_config["displayVersion"])
        rgba_full = smooth_rgba(rgba_full, smoothing_radius)
        rgba = rgba_full[inner]
        visible = rgba[..., 3] > 0
        valid = valid_full[inner]
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
