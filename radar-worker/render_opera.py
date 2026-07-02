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
    from pyproj import CRS
except Exception:  # pyproj is validated by the Node wrapper; keep the render error clean.
    CRS = None


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


def parse_bbox(where_groups: list[h5py.Group | h5py.Dataset]) -> tuple[dict[str, float] | None, str | None]:
    values: dict[str, float] = {}

    for name in ["LL_lon", "LL_lat", "LR_lon", "LR_lat", "UL_lon", "UL_lat", "UR_lon", "UR_lat"]:
        value = number_or_none(first_attr(where_groups, [name, name.lower()]))
        if value is not None:
            values[name] = value

    if len(values) == 8:
        lons = [values["LL_lon"], values["LR_lon"], values["UL_lon"], values["UR_lon"]]
        lats = [values["LL_lat"], values["LR_lat"], values["UL_lat"], values["UR_lat"]]
        return {
            "west": min(lons),
            "south": min(lats),
            "east": max(lons),
            "north": max(lats),
        }, None

    missing = [name for name in ["LL_lon", "LL_lat", "LR_lon", "LR_lat", "UL_lon", "UL_lat", "UR_lon", "UR_lat"] if name not in values]
    return None, f"Corner lon/lat attributes are missing or unreadable: {', '.join(missing)}."


def colorize(dbz: np.ndarray, valid: np.ndarray) -> np.ndarray:
    stops = np.array(
        [
            [-20.0, 56, 141, 255, 22],
            [-5.0, 63, 190, 255, 52],
            [5.0, 83, 224, 255, 96],
            [15.0, 39, 214, 204, 136],
            [25.0, 80, 220, 104, 176],
            [35.0, 255, 224, 74, 212],
            [45.0, 255, 146, 55, 232],
            [55.0, 239, 63, 78, 242],
            [70.0, 195, 75, 223, 214],
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


def render(input_path: Path, output_path: Path, metadata_path: Path) -> None:
    with h5py.File(input_path, "r") as handle:
        data_path, dataset, quantity_node, quantity_attrs = find_dbzh_dataset(handle)
        data = np.asarray(dataset)
        if data.ndim > 2:
            data = data[0]

        data = data.astype(np.float32, copy=False)
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

        where_groups = find_where_groups(dataset, handle)
        projection, projection_warning = parse_projection(where_groups)
        bbox, bbox_warning = parse_bbox(where_groups)
        has_georeferencing = bool(projection and bbox)
        warnings = [warning for warning in [projection_warning, bbox_warning] if warning]
        if not has_georeferencing and not warnings:
            warnings.append("Georeferencing metadata is incomplete or unreadable.")

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
            "bbox": bbox,
            "hasGeoreferencing": has_georeferencing,
            "renderedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "warning": " ".join(warnings) if warnings else None,
            "hdf5DataPath": data_path,
        }

        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(summarize_hdf5(handle, data_path), ensure_ascii=False), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render an OPERA ODIM HDF5 DBZH composite to transparent WebP.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--metadata", required=True, type=Path)
    args = parser.parse_args()

    try:
        render(args.input, args.output, args.metadata)
        return 0
    except Exception as error:
        print(f"render_opera.py failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
