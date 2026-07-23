"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { Community } from "@/lib/product-domain";
import type { Observation } from "@/lib/types";

const SOURCE_ID = "weyra-community-observations";
const GLOW_LAYER_ID = "weyra-community-observation-glow";
const POINT_LAYER_ID = "weyra-community-observation-points";

function observationGeoJson(observations: Observation[]) {
  return {
    type: "FeatureCollection" as const,
    features: observations.map((observation) => ({
      type: "Feature" as const,
      properties: {
        id: observation.id,
        category: observation.category,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [observation.lon, observation.lat],
      },
    })),
  };
}

export default function CommunityMapPreview({
  community,
  observations,
  onOpenAtlas,
}: {
  community: Community;
  observations: Observation[];
  onOpenAtlas: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const observationsRef = useRef(observations);
  const onOpenAtlasRef = useRef(onOpenAtlas);

  useEffect(() => {
    observationsRef.current = observations;
    onOpenAtlasRef.current = onOpenAtlas;
  }, [observations, onOpenAtlas]);

  useEffect(() => {
    let disposed = false;
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (disposed || !containerRef.current || mapRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "/map-styles/weyra-atlas-v1.json",
        center: [community.center.lon, community.center.lat],
        zoom: 8.3,
        attributionControl: { compact: true },
        interactive: true,
      });
      mapRef.current = map;
      map.on("load", () => {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: observationGeoJson(observationsRef.current),
        });
        map.addLayer({
          id: GLOW_LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 10, 11, 18],
            "circle-color": "#65d8f3",
            "circle-opacity": 0.14,
            "circle-blur": 0.7,
          },
        });
        map.addLayer({
          id: POINT_LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 6],
            "circle-color": "#65d8f3",
            "circle-stroke-color": "#dce9f7",
            "circle-stroke-width": 1,
            "circle-opacity": 0.9,
          },
        });
      });
      map.on("click", POINT_LAYER_ID, () => onOpenAtlasRef.current());
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [community.center.lat, community.center.lon]);

  useEffect(() => {
    const source = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(observationGeoJson(observations));
  }, [observations]);

  return <div className="community-map-preview" ref={containerRef} aria-label={`Aperçu Atlas de ${community.territory}`} />;
}
