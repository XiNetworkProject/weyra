from datetime import timedelta
from pathlib import Path
import tarfile
import tempfile
import unittest

import h5py
import numpy as np
from PIL import Image
from pyproj import Transformer
import rasterio
from rasterio.transform import from_origin

from prepare_radar_layers import (NODATA, accumulate, colorize, date, decode_amount,
                                 ingest_packages, iso, key, profile, publish)


class RadarLayerTests(unittest.TestCase):
    def write_grid(self, path, values, transform=None):
        values = np.array(values, dtype="float32")
        with rasterio.open(path, "w", **profile(values.shape[1], values.shape[0], "EPSG:3857",
                                               transform or from_origin(0, 1000, 500, 500))) as dst:
            dst.write(values, 1)

    def hdf(self, path):
        with h5py.File(path, "w") as h:
            where = h.create_group("where")
            inverse = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
            ul = inverse.transform(0, 1000)
            lr = inverse.transform(3000, 0)
            where.attrs.update(projdef="EPSG:3857", xsize=6, ysize=2, xscale=500., yscale=500.,
                               UL_lon=ul[0], UL_lat=ul[1], LR_lon=lr[0], LR_lat=lr[1])
            d = h.create_group("dataset1")
            d.create_group("what").attrs.update(startdate="20260913", starttime="115500", enddate="20260913", endtime="120000")
            data = d.create_group("data1")
            data.create_group("what").attrs.update(quantity="ACRR", gain=.01, offset=0., nodata=65535, undetect=0)
            data.create_dataset("data", data=np.array([[100, 250, 0, 65535, 300, 50]]*2, dtype="uint16"))
            quality = d.create_group("quality1")
            quality.create_group("what").attrs.update(gain=.01, offset=0., nodata=255)
            quality.create_dataset("data", data=np.array([[100, 50, 100, 100, 0, 255]]*2, dtype="uint8"))

    def test_amount_encoding_missing_dry_and_bad_quality(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, out = Path(tmp)/"sample.h5", Path(tmp)/"grid.tif"
            self.hdf(src)
            decode_amount(src, out, "2026-09-13T12:00:00Z")
            with rasterio.open(out) as grid:
                np.testing.assert_array_equal(grid.read(1), [[1, 2.5, 0, NODATA, NODATA, NODATA]]*2)
                self.assertEqual(grid.tags()["unit"], "mm")
                self.assertEqual(grid.transform.a, 500)

    def test_wrong_quantity_time_and_geometry_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, out = Path(tmp)/"sample.h5", Path(tmp)/"grid.tif"
            self.hdf(src)
            with self.assertRaisesRegex(ValueError, "interval"):
                decode_amount(src, out, "2026-09-13T12:05:00Z")
            with h5py.File(src, "a") as h:
                h["dataset1/data1/what"].attrs["quantity"] = "DBZH"
            with self.assertRaisesRegex(ValueError, "ACRR"):
                decode_amount(src, out, "2026-09-13T12:00:00Z")
            self.hdf(src)
            with h5py.File(src, "a") as h:
                h["where"].attrs["xscale"] = 1000.
            with self.assertRaisesRegex(ValueError, "corners"):
                decode_amount(src, out, "2026-09-13T12:00:00Z")

    def test_hour_window_sums_each_sample_once_and_masks_incomplete_pixels(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            end = "2026-09-13T12:00:00Z"
            sources = {}
            for i in range(12):
                t = iso(date(end)-timedelta(minutes=5*i))
                p = root/f"{i}.tif"
                self.write_grid(p, [[.25, 0, NODATA if i == 4 else .5]])
                sources[t] = p
            out = root/"sum.tif"
            self.assertTrue(accumulate(sources, out, end, 60))
            with rasterio.open(out) as grid:
                np.testing.assert_array_equal(grid.read(1), [[3, 0, NODATA]])
                self.assertEqual(grid.tags()["intervalStart"], "2026-09-13T11:00:00Z")
            sources.pop(iso(date(end)-timedelta(minutes=25)))
            self.assertFalse(accumulate(sources, root/"missing.tif", end, 60))
            self.assertFalse((root/"missing.tif").exists())
            self.assertFalse(accumulate(sources, root/"three-hours.tif", end, 180))

    def test_grid_changes_are_not_silently_added(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a, b = root/"a.tif", root/"b.tif"
            self.write_grid(a, [[1]])
            self.write_grid(b, [[1]], from_origin(1000, 1000, 500, 500))
            with self.assertRaisesRegex(ValueError, "aligned"):
                accumulate({"2026-09-13T12:00:00Z": a, "2026-09-13T11:55:00Z": b}, root/"out.tif", "2026-09-13T12:00:00Z", 10)

    def test_palette_units_preserve_weak_echoes_and_low_amounts(self):
        values = np.array([[-5., 0., .1, 1., 40., NODATA]])
        valid = values != NODATA
        dbz = colorize(values, valid, "reflectivity")
        mm = colorize(values, valid, "accumulation-1h")
        self.assertGreater(dbz[0, 0, 3], 0)
        self.assertEqual(mm[0, 1, 3], 0)
        self.assertGreater(mm[0, 2, 3], 0)
        self.assertFalse(np.array_equal(mm[0, 3], dbz[0, 3]))
        self.assertEqual(mm[0, -1, 3], 0)

    def test_real_tile_publication_is_product_isolated_and_atomic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            grid = root/"source.tif"
            self.write_grid(grid, [[40]*8]*8, from_origin(100000, 6000000, 1000, 1000))
            m = publish(root, "reflectivity", "2026-09-13T12:00:00Z", (True, grid))
            files = list((root/"reflectivity"/m["key"] / "tiles").rglob("*.webp"))
            self.assertEqual(len(files), m["tileCount"])
            visible = False
            for p in files:
                with Image.open(p) as image:
                    self.assertEqual(image.size, (256, 256))
                    visible |= image.getextrema()[3][1] > 0
            self.assertTrue(visible)
            self.assertFalse((root/"accumulation-1h"/m["key"]).exists())

    def test_cached_packages_are_backfilled_once_without_path_extraction(self):
        import time
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package_root = root/"meteofrance"/"packages"
            package_root.mkdir(parents=True)
            src = root/"sample.h5"
            self.hdf(src)
            with tarfile.open(package_root/"test.tar.gz", "w:gz") as tar:
                tar.add(src, arcname="T_IPRN20_C_LFPW_20260913120000.h5")
            layer_root = root/"layers"
            layer_root.mkdir()
            self.assertEqual(ingest_packages(root, layer_root, time.monotonic()+10), [])
            grid = layer_root/"amounts"/key("2026-09-13T12:00:00Z")/"source-grid.tif"
            first = grid.stat().st_mtime_ns
            ingest_packages(root, layer_root, time.monotonic()+10)
            self.assertEqual(grid.stat().st_mtime_ns, first)


if __name__ == "__main__":
    unittest.main()
