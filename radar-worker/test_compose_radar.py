import tempfile
import unittest
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds

from compose_radar import NODATA, compose
from render_meteofrance import prepare_display_grids


class RadarCompositionTests(unittest.TestCase):
    def write_grid(self, path, values, transform, crs="EPSG:3857"):
        values = np.asarray(values, dtype="float32")
        with rasterio.open(path, "w", driver="GTiff", width=values.shape[1],
                           height=values.shape[0], count=1, dtype="float32",
                           nodata=NODATA, crs=crs, transform=transform) as dst:
            dst.write(values, 1)

    def test_national_valid_dry_and_filtered_pixels_take_priority(self):
        raw = np.array([[40, -8888, 18, NODATA]], dtype="float32")
        unfiltered, display = prepare_display_grids(raw, np.array([[1, 1, .1, 1]]), NODATA, -8888)
        np.testing.assert_array_equal(unfiltered, [[40, -32, 18, NODATA]])
        np.testing.assert_array_equal(display, [[40, -32, -32, NODATA]])
        with tempfile.TemporaryDirectory() as tmp:
            mf, opera, out = [Path(tmp) / name for name in ("mf.tif", "opera.tif", "out.tif")]
            self.write_grid(mf, display, from_origin(1000, 1000, 1000, 1000))
            self.write_grid(opera, [[25, 25, 25, 25, 25, NODATA]], from_origin(0, 1000, 1000, 1000))
            metadata = compose(mf, opera, out, "2026-09-12T12:00:00Z")
            with rasterio.open(out) as src:
                np.testing.assert_array_equal(src.read(1), [[25, 40, -32, -32, 25, NODATA]])
                self.assertEqual(src.tags()["quantity"], "DBZH")
                self.assertEqual(abs(src.transform.a), 1000)
            self.assertEqual(metadata["primaryPixels"], 3)
            self.assertEqual(metadata["fallbackPixels"], 2)

    def test_distinct_projections_align_without_averaging_intensities(self):
        with tempfile.TemporaryDirectory() as tmp:
            mf, opera, out = [Path(tmp) / name for name in ("mf.tif", "opera.tif", "out.tif")]
            # The same square around the equator, expressed in degrees and metres.
            bounds = transform_bounds("EPSG:3857", "EPSG:4326", 0, 0, 2000, 2000)
            self.write_grid(mf, [[50, 50], [50, 50]],
                            from_origin(bounds[0], bounds[3], (bounds[2]-bounds[0])/2, (bounds[3]-bounds[1])/2), "EPSG:4326")
            self.write_grid(opera, np.full((4, 4), 20), from_origin(-1000, 3000, 1000, 1000))
            compose(mf, opera, out, "2026-09-12T12:00:00Z")
            with rasterio.open(out) as src:
                expected = np.full((4, 4), 20)
                expected[1:3, 1:3] = 50
                np.testing.assert_array_equal(src.read(1), expected)

    def test_missing_national_source_falls_back_without_making_data_outside_both(self):
        with tempfile.TemporaryDirectory() as tmp:
            mf, opera, out = [Path(tmp) / name for name in ("mf.tif", "opera.tif", "out.tif")]
            self.write_grid(mf, [[NODATA, np.nan]], from_origin(0, 1000, 1000, 1000))
            self.write_grid(opera, [[17, NODATA]], from_origin(0, 1000, 1000, 1000))
            compose(mf, opera, out, "2026-09-12T12:00:00Z")
            with rasterio.open(out) as src:
                np.testing.assert_array_equal(src.read(1), [[17, NODATA]])

    def test_composite_overview_and_detail_use_the_real_tile_renderer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mf, opera, out = [root / name for name in ("mf.tif", "opera.tif", "out.tif")]
            self.write_grid(mf, [[50, -32], [NODATA, 30]], from_origin(0, 2000, 1000, 1000))
            self.write_grid(opera, [[20, 20], [20, 20]], from_origin(0, 2000, 1000, 1000))
            timestamp = "2026-09-12T12:00:00Z"
            compose(mf, opera, out, timestamp)
            jobs = root / "jobs.json"
            jobs.write_text(json.dumps([{"z": 6, "x": 32, "y": 31}, {"z": 8, "x": 128, "y": 127}]))
            result = subprocess.run([
                sys.executable, str(Path(__file__).with_name("render_opera_tiles_batch.py")),
                "--input", str(out), "--jobs", str(jobs), "--style", "v5-mf-opera",
                "--timestamp", timestamp, "--output-root", str(root),
            ], capture_output=True, text=True, check=True, timeout=30)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["generated"], 2)
            for tile in payload["tiles"]:
                self.assertTrue(Path(tile["imagePath"]).is_file())
                self.assertIn("v5-mf-opera", tile["imagePath"])


if __name__ == "__main__":
    unittest.main()
