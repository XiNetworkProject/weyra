"""Generate weyra-atlas-v3.json from v2 — deep-night 'radar-first' recolor.

The radar is the hero: the base map gets darker and quieter, water reads as a
deep luminous blue, coastlines get a soft glow, cities stay crisp white.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "map-styles" / "weyra-atlas-v2.json"
DST = ROOT / "public" / "map-styles" / "weyra-atlas-v3.json"

# layer_id -> {paint prop: new value}
OVERRIDES = {
    "background": {"background-color": "#02070f"},
    # Land: darker, cooler, recedes behind the radar
    "landcover": {"fill-color": "#060f1d"},
    "weyra_landcover_grass": {"fill-color": "#050e18"},
    "park_national_park": {"fill-color": "#06182a"},
    "park_nature_reserve": {"fill-color": "#06182a"},
    "landuse_residential": {"fill-color": "#071423"},
    "landuse": {"fill-color": "#081726"},
    # Water: slightly lifted deep blue so sea/land separation survives under radar
    "water": {"fill-color": "#061b30"},
    "water_shadow": {"fill-color": "#0a2947"},
    "weyra_water_depth_glow": {"fill-color": "#0d3a5e"},
    "weyra_coast_glow": {"line-color": "#2f8fc2", "line-opacity": 0.5},
    "waterway": {"line-color": "#1c5b82", "line-opacity": 0.5},
    # Roads: cooler ramp, a touch dimmer — orientation cues only
    "road_path": {"line-color": "#08233a"},
    "road_service_fill": {"line-color": "#092540"},
    "road_minor_fill": {"line-color": "#0b2d48"},
    "road_sec_fill_noramp": {"line-color": "#11415f"},
    "road_pri_fill_ramp": {"line-color": "#185474"},
    "road_pri_fill_noramp": {"line-color": "#185474"},
    "road_trunk_fill_ramp": {"line-color": "#1f6a90"},
    "road_trunk_fill_noramp": {"line-color": "#1f6a90"},
    "road_mot_fill_ramp": {"line-color": "#2a7faa"},
    "road_mot_fill_noramp": {"line-color": "#2a7faa"},
    "tunnel_path": {"line-color": "#071f33"},
    "tunnel_service_fill": {"line-color": "#092540"},
    "tunnel_minor_fill": {"line-color": "#0b2d48"},
    "tunnel_sec_fill": {"line-color": "#11415f"},
    "tunnel_pri_fill": {"line-color": "#185474"},
    "tunnel_trunk_fill": {"line-color": "#1f6a90"},
    "tunnel_mot_fill": {"line-color": "#2a7faa"},
    "bridge_path": {"line-color": "#092a44"},
    "bridge_service_fill": {"line-color": "#092540"},
    "bridge_minor_fill": {"line-color": "#0b2d48"},
    "bridge_sec_fill": {"line-color": "#11415f"},
    "bridge_pri_fill": {"line-color": "#185474"},
    "bridge_trunk_fill": {"line-color": "#1f6a90"},
    "bridge_mot_fill": {"line-color": "#2a7faa"},
    "rail": {"line-color": "#143243"},
    "rail_dash": {"line-color": "#234a60"},
    "tunnel_rail": {"line-color": "#0e2636"},
    "tunnel_rail_dash": {"line-color": "#1f4155"},
    # Buildings: almost invisible until close zoom
    "building": {"fill-color": "#0a1a2c"},
    "building-top": {"fill-color": "#0c2236", "fill-outline-color": "#02070f"},
    # Borders: subtle luminous country edge
    "boundary_country_outline": {"line-color": "#010409", "line-opacity": 0.6},
    "boundary_country_inner": {"line-color": "#8aa9c4"},
    "boundary_state": {"line-color": "#33536e"},
    "boundary_county": {"line-color": "#16293a"},
    # Labels: crisp, cool white hierarchy
    "waterway_label": {"text-color": "#5f8dab", "text-halo-color": "#020910"},
    "watername_ocean": {"text-color": "#5f8dab", "text-halo-color": "#020910"},
    "watername_sea": {"text-color": "#5f8dab", "text-halo-color": "#020910"},
    "watername_lake": {"text-color": "#5f8dab", "text-halo-color": "#020910"},
    "watername_lake_line": {"text-color": "#5f8dab", "text-halo-color": "#020910"},
    "place_hamlet": {"text-color": "#8ca3b8", "icon-color": "#8ca3b8", "text-halo-color": "#040a13"},
    "place_suburbs": {"text-color": "#7e96ab", "icon-color": "#8ea4b8", "text-halo-color": "#01060d"},
    "place_villages": {"text-color": "#90a8bd", "icon-color": "#9aafc2", "text-halo-color": "#01060d"},
    "place_town": {"text-color": "#c6d8e8", "icon-color": "#ccdae8", "text-halo-color": "#01060d"},
    "place_country_2": {"text-color": "#4d6376", "text-halo-color": "#020a12"},
    "place_country_1": {"text-color": "#5c7689", "text-halo-color": "#020a12"},
    "place_state": {"text-color": "#567080", "text-halo-color": "#030b14"},
    "place_city_r6": {"text-color": "#d3e2f0", "icon-color": "#d7e4f0", "text-halo-color": "#01060d"},
    "place_city_r5": {"text-color": "#e6f0fa", "icon-color": "#e4edf6", "text-halo-color": "#01060d"},
    "place_city_dot_r7": {"text-color": "#e0f0fc", "icon-color": "#e0f0fc", "text-halo-color": "#020a12"},
    "place_city_dot_r4": {"text-color": "#ecf6ff", "icon-color": "#ecf6ff", "text-halo-color": "#020a12"},
    "place_city_dot_r2": {"text-color": "#f2faff", "icon-color": "#f2faff", "text-halo-color": "#020a12"},
    "place_city_dot_z7": {"text-color": "#e8f4ff", "icon-color": "#e8f4ff", "text-halo-color": "#020a12"},
    "place_capital_dot_z7": {"text-color": "#ffffff", "icon-color": "#ffffff", "text-halo-color": "#020a12"},
    # Road labels stay whisper-quiet
    "roadname_minor": {"text-color": "#3d5568", "text-halo-color": "#02070f"},
    "roadname_sec": {"text-color": "#4c667a", "text-halo-color": "#02070f"},
    "roadname_pri": {"text-color": "#6f8fa6", "text-halo-color": "#02070f"},
    "roadname_major": {"text-color": "#7fa3bc", "text-halo-color": "#02070f"},
    "weyra_road_ref": {"text-color": "#9cc6dd", "text-halo-color": "#02070f"},
    # Aeroway hints
    "aeroway-runway": {"line-color": "#143248"},
    "aeroway-taxiway": {"line-color": "#12293b"},
}

style = json.loads(SRC.read_text(encoding="utf-8"))
style["name"] = "Weyra Atlas V3 — Nuit Radar"

applied, missing = 0, []
layers_by_id = {layer["id"]: layer for layer in style["layers"]}
for layer_id, paint in OVERRIDES.items():
    layer = layers_by_id.get(layer_id)
    if layer is None:
        missing.append(layer_id)
        continue
    layer.setdefault("paint", {}).update(paint)
    applied += 1

DST.write_text(json.dumps(style, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"v3 written: {DST}")
print(f"layers overridden: {applied}, missing: {missing or 'none'}")
print(f"size: {DST.stat().st_size} bytes, layers: {len(style['layers'])}")
