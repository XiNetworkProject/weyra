#!/usr/bin/env python3
"""Publish optional radar products, after the live precipitation packs.

ACRR is a five-minute amount in mm (ODIM gain/offset), never a conversion of
reflectivity. Only complete time windows and pixels are published as totals.
All HTTP reads are static. Work, memory and history are bounded on the ARM VM.
"""
import argparse
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import re
import shutil
import tarfile
import tempfile
import time

import h5py
import mercantile
import numpy as np
from PIL import Image
from pyproj import Transformer
import rasterio
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.warp import Resampling, transform_bounds
from rasterio.windows import Window

NODATA = -9999.0
VERSION = "layers-v1"
PALETTES = json.loads(Path(__file__).with_name("layer-palettes.json").read_text())
AMOUNT_MEMBER = re.compile(r"(?:^|/)T_IPRN20_C_LFPW_(\d{14})\.h5$")
MAX_AMOUNT_FRAMES = 48
MAX_PACKS = 12


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def date(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def key(value):
    return re.sub(r"[^A-Za-z0-9-]", "", value)


def text(value):
    return value.decode() if isinstance(value, bytes) else str(value)


def read_json(path, default=None):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False))
    temporary.replace(path)


def profile(width, height, crs, transform):
    return dict(driver="GTiff", width=width, height=height, count=1, dtype="float32",
                crs=crs, transform=transform, nodata=NODATA, compress="deflate",
                predictor=3, tiled=True, blockxsize=256, blockysize=256)


def decode_amount(input_path, output, timestamp):
    """Strict ODIM reader: apply declared encoding once and validate geometry/time."""
    with h5py.File(input_path) as h:
        candidates = []
        def visit(_name, node):
            if isinstance(node, h5py.Group) and "what" in node and "data" in node:
                if text(node["what"].attrs.get("quantity", "")) == "ACRR":
                    candidates.append(node)
        h.visititems(visit)
        if len(candidates) != 1:
            quantities = []
            h.visititems(lambda n, o: quantities.append(text(o.attrs["quantity"]))
                         if "quantity" in o.attrs else None)
            raise ValueError("IPRN20: expected one ACRR field; quantities=" + ",".join(quantities[:12]))
        node = candidates[0]
        raw = node["data"]
        what = node["what"].attrs
        where = h["where"].attrs
        dataset_what = node.parent["what"].attrs
        start = datetime.strptime(text(dataset_what["startdate"]) + text(dataset_what["starttime"]),
                                  "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        end = datetime.strptime(text(dataset_what["enddate"]) + text(dataset_what["endtime"]),
                                "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        if end - start != timedelta(minutes=5) or date(timestamp) != end:
            raise ValueError("IPRN20: observation is not the named five-minute interval.")
        width, height = int(where["xsize"]), int(where["ysize"])
        if raw.shape != (height, width) or not (0 < width <= 4096 and 0 < height <= 4096):
            raise ValueError("IPRN20: invalid dimensions.")
        crs = text(where["projdef"])
        px, py = float(where["xscale"]), float(where["yscale"])
        if not (0 < px <= 2000 and 0 < py <= 2000):
            raise ValueError("IPRN20: invalid resolution.")
        project = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        left, top = project.transform(float(where["UL_lon"]), float(where["UL_lat"]))
        right, bottom = project.transform(float(where["LR_lon"]), float(where["LR_lat"]))
        if not all(math.isfinite(v) for v in [left, top, right, bottom]) or abs(right-left-width*px) > px or abs(top-bottom-height*py) > py:
            raise ValueError("IPRN20: corners disagree with grid geometry.")
        gain, offset = float(what["gain"]), float(what["offset"])
        nodata, undetect = float(what["nodata"]), float(what["undetect"])
        if not (math.isfinite(gain) and gain > 0 and math.isfinite(offset)):
            raise ValueError("IPRN20: invalid amount encoding.")
        qualities = []
        for parent in (node, node.parent):
            for name, q in parent.items():
                if isinstance(q, h5py.Group) and "data" in q and "what" in q and (name.startswith("quality") or text(q["what"].attrs.get("quantity", "")) == "QIND"):
                    if q["data"].shape == raw.shape:
                        qualities.append(q)
        if not qualities:
            raise ValueError("IPRN20: measurement quality is absent.")
        output.parent.mkdir(parents=True, exist_ok=True)
        valid_pixels = 0
        with rasterio.open(output, "w", **profile(width, height, crs, from_origin(left, top, px, py))) as dst:
            for _, window in dst.block_windows(1):
                rows, cols = window.toslices()
                codes = raw[rows, cols]
                values = codes.astype("float32") * gain + offset
                values[codes == undetect] = 0
                valid = (codes != nodata) & np.isfinite(values) & (values >= 0)
                for q in qualities:
                    qc = q["data"][rows, cols]
                    qa = q["what"].attrs
                    qv = qc * float(qa["gain"]) + float(qa["offset"])
                    valid &= np.isfinite(qv) & (qv > 0)
                    if "nodata" in qa:
                        valid &= qc != float(qa["nodata"])
                valid_pixels += int(np.count_nonzero(valid))
                dst.write(np.where(valid, values, NODATA).astype("float32"), 1, window=window)
            dst.update_tags(quantity="ACRR", unit="mm", timestamp=timestamp, intervalMinutes=5,
                            product="IPRN20_C_LFPW", provider="Météo-France")
        return {"timestamp": timestamp, "intervalStart": iso(start), "validPixels": valid_pixels}


def accumulate(sources, output, timestamp, minutes):
    expected = [iso(date(timestamp) - timedelta(minutes=i*5)) for i in reversed(range(minutes // 5))]
    if any(t not in sources for t in expected):
        return False
    with ExitStack() as stack:
        grids = [stack.enter_context(rasterio.open(sources[t])) for t in expected]
        first = grids[0]
        if any(g.crs != first.crs or g.transform != first.transform or g.shape != first.shape for g in grids):
            raise ValueError("Accumulation grids are not aligned.")
        output.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(output, "w", **first.profile) as dst:
            for _, window in dst.block_windows(1):
                total = np.zeros((int(window.height), int(window.width)), dtype="float32")
                complete = np.ones(total.shape, dtype=bool)
                for grid in grids:
                    values = grid.read(1, window=window, masked=True)
                    valid = ~np.ma.getmaskarray(values) & np.isfinite(values.data) & (values.data >= 0)
                    complete &= valid
                    total += np.where(valid, values.data, 0)
                dst.write(np.where(complete, total, NODATA).astype("float32"), 1, window=window)
            dst.update_tags(quantity="ACRR", unit="mm", timestamp=timestamp, durationMinutes=minutes,
                            intervalStart=iso(date(timestamp)-timedelta(minutes=minutes)),
                            completeness="all-intervals-and-pixels-required")
    return True


def colorize(values, valid, product):
    stops = np.array(PALETTES["reflectivity" if product == "reflectivity" else "accumulation"]["stops"])
    rgba = np.zeros((*values.shape, 4), dtype="uint8")
    finite = valid & np.isfinite(values) & (values >= stops[0, 0])
    for channel in range(3):
        rgba[..., channel] = np.interp(np.where(finite, values, stops[0, 0]), stops[:, 0], stops[:, channel+1]).astype("uint8")
    rgba[..., 3] = np.where(finite, 230, 0)
    return rgba


def render_tiles(primary_path, fallback_path, output, product, max_zoom):
    """Sample physical values before the palette; never blend units or timestamps."""
    with ExitStack() as stack:
        primary = stack.enter_context(rasterio.open(primary_path))
        fallback = stack.enter_context(rasterio.open(fallback_path)) if fallback_path else None
        bounds = list(transform_bounds(primary.crs, "EPSG:4326", *primary.bounds, densify_pts=21))
        if fallback:
            b = transform_bounds(fallback.crs, "EPSG:4326", *fallback.bounds, densify_pts=21)
            bounds = [min(bounds[0], b[0]), min(bounds[1], b[1]), max(bounds[2], b[2]), max(bounds[3], b[3])]
        count = 0
        earth = 20037508.342789244
        for z in range(3, max_zoom+1):
            size = 256 * 2**z
            transform = from_origin(-earth, earth, 2*earth/size, 2*earth/size)
            options = dict(crs="EPSG:3857", transform=transform, width=size, height=size,
                           nodata=NODATA, resampling=Resampling.nearest, warp_mem_limit=16)
            with ExitStack() as zoom_stack:
                pv = zoom_stack.enter_context(WarpedVRT(primary, **options))
                fv = zoom_stack.enter_context(WarpedVRT(fallback, **options)) if fallback else None
                for tile in mercantile.tiles(*bounds, zooms=z):
                    window = Window(tile.x*256, tile.y*256, 256, 256)
                    values = pv.read(1, window=window, masked=True)
                    valid = ~np.ma.getmaskarray(values) & np.isfinite(values.data)
                    data = values.data
                    if fv:
                        other = fv.read(1, window=window, masked=True)
                        ov = ~np.ma.getmaskarray(other) & np.isfinite(other.data)
                        data = np.where(valid, data, other.data)
                        valid = valid | ov
                    dest = output / str(z) / str(tile.x) / f"{tile.y}.webp"
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(colorize(data, valid, product)).save(dest, "WEBP", lossless=True, method=1)
                    count += 1
        return dict(zip(("west", "south", "east", "north"), bounds)), count


def ingest_packages(cache, root, deadline):
    package_root = cache / "meteofrance" / "packages"
    done_path = root / "packages.json"
    done = set(read_json(done_path, []))
    packages = sorted(package_root.glob("*.tar.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
    errors = []
    for package in packages:
        if package.name in done or time.monotonic() > deadline:
            continue
        try:
            with tarfile.open(package, "r:gz") as archive:
                members = [(m, AMOUNT_MEMBER.search(m.name)) for m in archive.getmembers() if m.isfile()]
                members = [(m, match) for m, match in members if match]
                if not members:
                    raise ValueError("IPRN20 HDF5 absent du paquet radar.")
                for member, match in members:
                    timestamp = iso(datetime.strptime(match[1], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc))
                    dest = root / "amounts" / key(timestamp)
                    if (dest / "metadata.json").exists():
                        continue
                    if member.size > 128*1024*1024:
                        raise ValueError("IPRN20 member exceeds size limit.")
                    with tempfile.TemporaryDirectory(prefix=".amount-", dir=root) as temporary:
                        stage = Path(temporary)
                        with archive.extractfile(member) as src, (stage / "input.h5").open("wb") as out:
                            shutil.copyfileobj(src, out)
                        metadata = decode_amount(stage / "input.h5", stage / "source-grid.tif", timestamp)
                        (stage / "input.h5").unlink()
                        atomic_json(stage / "metadata.json", metadata)
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.move(str(stage), str(dest))
            done.add(package.name)
        except (OSError, ValueError, KeyError, RuntimeError) as error:
            errors.append(str(error)[:300])
            break  # Do not retry the same unsupported upstream layout for every package.
    atomic_json(done_path, sorted(done & {p.name for p in packages}))
    return errors


def cached_sources(directory):
    sources = {}
    for p in directory.glob("*/metadata.json"):
        m = read_json(p, {})
        grid = p.parent / "source-grid.tif"
        if m.get("timestamp") and grid.exists():
            sources[m["timestamp"]] = (m, grid)
    return sources


def publish(root, product, timestamp, primary, fallback=None, minutes=None):
    provider = "Météo-France + OPERA" if fallback else "Météo-France"
    if product == "reflectivity" and not primary[0]:
        provider = "EUMETNET OPERA"
    source = primary[1]
    revision = "mf-opera" if fallback else "opera" if provider == "EUMETNET OPERA" else "mf"
    pack_key = key(timestamp) + "-" + revision
    final = root / product / pack_key
    cached = read_json(final / "manifest.json")
    if cached:
        return cached
    with tempfile.TemporaryDirectory(prefix=".tiles-", dir=root) as temporary:
        stage = Path(temporary)
        max_zoom = 7 if product == "reflectivity" else 8
        coverage, count = render_tiles(source, fallback, stage / "tiles", product, max_zoom)
        manifest = dict(timestamp=timestamp, key=pack_key, status="ready", product=product,
                        version=VERSION, provider=provider, attribution=f"Source : {provider}",
                        coverage=coverage, tileSize=256, minZoom=3, maxZoom=max_zoom,
                        tileCount=count, unit="dBZ" if product == "reflectivity" else "mm",
                        publishedAt=iso(datetime.now(timezone.utc)), durationMinutes=minutes,
                        intervalStart=iso(date(timestamp)-timedelta(minutes=minutes)) if minutes else None)
        atomic_json(stage / "manifest.json", manifest)
        final.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stage), str(final))
    return manifest


def prepare(cache, budget):
    root = cache / "layers" / VERSION
    root.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + budget
    # A killed worker must not leave large temporary products forever.
    for p in root.glob(".*-*"):
        if p.is_dir():
            shutil.rmtree(p)
    errors = ingest_packages(cache, root, time.monotonic() + min(40, budget/2))
    amounts = cached_sources(root / "amounts")
    for timestamp in sorted(amounts)[:-MAX_AMOUNT_FRAMES]:
        shutil.rmtree(amounts.pop(timestamp)[1].parent)
    national = cached_sources(cache / "meteofrance" / "frames")
    european = cached_sources(cache / "frames")
    # Publish latest products first. Historical frames backfill within the time budget.
    timestamps = sorted(set(national) | set(european), reverse=True)[:MAX_PACKS]
    amount_paths = {t: v[1] for t, v in amounts.items()}
    latest_amount = max(amounts, default=None)
    tasks = []
    if timestamps:
        tasks.append(("reflectivity", timestamps[0], None))
    if latest_amount:
        tasks.extend((f"accumulation-{m//60}h", latest_amount, m) for m in (60, 180))
    tasks.extend(("reflectivity", t, None) for t in timestamps[1:])
    for product, timestamp, minutes in tasks:
        if time.monotonic() > deadline:
            break
        try:
            if minutes:
                if read_json(root / product / (key(timestamp)+"-mf") / "manifest.json"):
                    continue
                with tempfile.TemporaryDirectory(prefix=".sum-", dir=root) as temporary:
                    grid = Path(temporary) / "total.tif"
                    if accumulate(amount_paths, grid, timestamp, minutes):
                        publish(root, product, timestamp, (True, grid), minutes=minutes)
            else:
                mf = national.get(timestamp)
                opera = european.get(timestamp)
                raw = Path(mf[0].get("sourceGridRawPath", "")) if mf else None
                if raw and raw.is_file():
                    publish(root, product, timestamp, (True, raw), opera[1] if opera else None)
                elif opera:
                    publish(root, product, timestamp, (False, opera[1]))
        except (OSError, ValueError, KeyError, RuntimeError) as error:
            errors.append(f"{product}: {str(error)[:250]}")
    layers = {}
    for product, minutes in (("reflectivity", None), ("accumulation-1h", 60), ("accumulation-3h", 180)):
        packs = [m for p in (root / product).glob("*/manifest.json") if (m := read_json(p))]
        packs.sort(key=lambda m: (m["timestamp"], m["publishedAt"]))
        newest = {m["timestamp"]: m for m in packs}
        keep = list(newest.values())[-MAX_PACKS:]
        keys = {m["key"] for m in keep}
        for m in packs:
            if m["key"] not in keys:
                shutil.rmtree(root / product / m["key"], ignore_errors=True)
        received = sum(iso(date(latest_amount)-timedelta(minutes=i*5)) in amounts
                       for i in range(minutes//5)) if minutes and latest_amount else 0
        layers[product] = dict(packs=keep, expectedSamples=minutes//5 if minutes else None,
                               receivedSamples=received, latestSourceTimestamp=latest_amount if minutes else (timestamps[0] if timestamps else None))
    result = dict(ok=True, version=VERSION, updatedAt=iso(datetime.now(timezone.utc)), layers=layers, errors=errors[:6])
    atomic_json(root / "catalog.json", result)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-root", required=True, type=Path)
    parser.add_argument("--budget-seconds", type=int, default=90)
    args = parser.parse_args()
    with rasterio.Env(GDAL_CACHEMAX=32*1024*1024, GDAL_NUM_THREADS="1"):
        result = prepare(args.cache_root, args.budget_seconds)
    print(json.dumps({"ok": True, "errors": result["errors"], "packs": {k: len(v["packs"]) for k, v in result["layers"].items()}}))
