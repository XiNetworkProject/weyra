#!/usr/bin/env python3
"""Geographic source selection in dBZ, before palette/alpha rendering.

Météo-France takes precedence wherever it reports a valid observation, including
dry/filtered pixels. OPERA fills only missing observations and the wider extent.
The grids must represent exactly the same observation time (checked by caller).
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.warp import Resampling, transform_bounds

NODATA = -9999.0


def compose(primary_path: Path, fallback_path: Path, output: Path, timestamp: str):
    with rasterio.Env(GDAL_CACHEMAX=32 * 1024 * 1024):
        with rasterio.open(primary_path) as primary, rasterio.open(fallback_path) as fallback:
            if not primary.crs or not fallback.crs:
                raise ValueError("Both radar sources need georeferencing.")
            px, py = abs(fallback.transform.a), abs(fallback.transform.e)
            if not px or not py or fallback.transform.b or fallback.transform.d:
                raise ValueError("The European grid must be north-up.")
            mf_bounds = transform_bounds(primary.crs, fallback.crs, *primary.bounds, densify_pts=21)
            left = fallback.bounds.left + math.floor((min(mf_bounds[0], fallback.bounds.left) - fallback.bounds.left) / px) * px
            top = fallback.bounds.top + math.ceil((max(mf_bounds[3], fallback.bounds.top) - fallback.bounds.top) / py) * py
            width = math.ceil((max(mf_bounds[2], fallback.bounds.right) - left) / px)
            height = math.ceil((top - min(mf_bounds[1], fallback.bounds.bottom)) / py)
            transform = from_origin(left, top, px, py)
            profile = dict(driver="GTiff", width=width, height=height, count=1,
                           dtype="float32", crs=fallback.crs, transform=transform,
                           nodata=NODATA, tiled=True, blockxsize=256, blockysize=256,
                           compress="deflate", predictor=3)
            vrt = dict(crs=fallback.crs, transform=transform, width=width, height=height,
                       nodata=NODATA, resampling=Resampling.nearest, warp_mem_limit=32)
            output.parent.mkdir(parents=True, exist_ok=True)
            primary_pixels = fallback_pixels = 0
            with WarpedVRT(primary, **vrt) as mf, WarpedVRT(fallback, **vrt) as opera:
                with rasterio.open(output, "w", **profile) as dest:
                    for _, window in dest.block_windows(1):
                        national = mf.read(1, window=window, masked=True)
                        european = opera.read(1, window=window, masked=True)
                        valid_mf = ~np.ma.getmaskarray(national) & np.isfinite(national.data)
                        valid_opera = ~np.ma.getmaskarray(european) & np.isfinite(european.data)
                        values = np.where(valid_mf, national.data,
                                          np.where(valid_opera, european.data, NODATA))
                        dest.write(values.astype("float32"), 1, window=window)
                        primary_pixels += int(np.count_nonzero(valid_mf))
                        fallback_pixels += int(np.count_nonzero(~valid_mf & valid_opera))
                    dest.update_tags(provider="Météo-France + OPERA", quantity="DBZH",
                                     timestamp=timestamp, composition="national-valid-else-european",
                                     resampling="nearest", primaryPixels=primary_pixels,
                                     fallbackPixels=fallback_pixels)
            bounds = transform_bounds(fallback.crs, "EPSG:4326", left, top-height*py,
                                      left+width*px, top, densify_pts=21)
            return {"timestamp": timestamp,
                    "coverage": dict(zip(("west", "south", "east", "north"), bounds)),
                    "primaryPixels": primary_pixels, "fallbackPixels": fallback_pixels}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--primary", type=Path, required=True)
    parser.add_argument("--fallback", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timestamp", required=True)
    args = parser.parse_args()
    print(json.dumps(compose(args.primary, args.fallback, args.output, args.timestamp)))
