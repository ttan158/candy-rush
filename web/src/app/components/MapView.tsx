"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import CandyMarker from "./CandyMarker";
import ClusterMarker from "./ClusterMarker";

type LngLat = [number, number];
const DEFAULT_CENTER: LngLat = [174.768838, -36.846611];
const DEFAULT_ZOOM: number = 15;

interface MapViewProps {
  center?: LngLat;
  zoom?: number;
  candies?: Array<{
    id: string;
    coord: LngLat;
    title?: string;
    address?: string;
    candyType?: string;
  }>;
}

export default function MapView({ center, zoom, candies }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const latestCenterRef = useRef<LngLat | undefined>(undefined);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let canceled = false;

    (async () => {
      const mod = await import("mapbox-gl");
      const mapboxgl = (mod as any).default ?? mod;
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

      if (!mapboxgl.accessToken) {
        console.warn("Missing NEXT_PUBLIC_MAPBOX_TOKEN");
        return;
      }
      if (!containerRef.current || canceled) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/ttan158/cmhffz5m5003501ri9issaa7b",
        center: center ?? DEFAULT_CENTER,
        zoom: zoom ?? DEFAULT_ZOOM,
        showPointOfInterestLabels: false,
        showPlaceLabels: false,
        showLandmarkIcons: false,
        showLandmarkIconsLabels: false,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      // Add a user-location indicator control and trigger once on load
      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      });
      map.addControl(geolocate, "top-right");
      map.once("load", () => {
        try {
          geolocate.trigger();
        } catch {}
        // Hide POI labels (e.g., supermarkets, food places) for a more minimal view
        const hidePOILayers = () => {
          try {
            const style = map.getStyle?.();
            const layers = style?.layers ?? [];
            for (const layer of layers) {
              const id = (layer as any)?.id ?? "";
              const sourceLayer = (layer as any)["source-layer"] ?? "";
              const type = (layer as any)?.type;
              const looksLikePOI =
                (typeof id === "string" && id.toLowerCase().includes("poi")) ||
                (typeof sourceLayer === "string" &&
                  sourceLayer.toLowerCase().includes("poi"));
              if (type === "symbol" && looksLikePOI) {
                try {
                  map.setLayoutProperty(id, "visibility", "none");
                } catch {}
              }
            }
          } catch {}
        };
        hidePOILayers();
        // Re-apply if style reloads (rare, but safe)
        map.on("styledata", hidePOILayers);
        setMapReady(true);
      });
      mapRef.current = map;
      mapboxRef.current = mapboxgl;

      // If we already have a center selected before map loads, apply it now
      if (latestCenterRef.current) {
        const c = latestCenterRef.current;
        map.flyTo({ center: c, zoom: zoom ?? map.getZoom(), essential: true });
        if (!markerRef.current) {
          markerRef.current = new mapboxgl.Marker({ color: "#5500FF" })
            .setLngLat(c)
            .addTo(map);
        } else {
          markerRef.current.setLngLat(c);
        }
      } else if (
        !center &&
        typeof window !== "undefined" &&
        "geolocation" in navigator
      ) {
        // Otherwise, try to center on the user's current location
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (canceled || !mapRef.current) return;
            const userCenter: LngLat = [
              pos.coords.longitude,
              pos.coords.latitude,
            ];
            map.flyTo({
              center: userCenter,
              zoom: typeof zoom === "number" ? zoom : 15,
              essential: true,
            });
          },
          () => {
            // If permission denied or error, silently keep default center
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
        );
      }
    })();

    return () => {
      canceled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (markerRef.current) {
        try {
          markerRef.current.remove();
        } catch {}
        markerRef.current = null;
      }
      mapboxRef.current = null;
    };
  }, []);

  // Fly when center/zoom props change
  useEffect(() => {
    latestCenterRef.current = center;
    const map = mapRef.current;
    if (!map) return;
    if (center) {
      map.flyTo({ center, zoom: zoom ?? map.getZoom(), essential: true });
    } else if (typeof zoom === "number") {
      map.zoomTo(zoom);
    }
  }, [center, zoom]);

  // Create or update a marker whenever center changes
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;

    if (center) {
      if (!markerRef.current) {
        markerRef.current = new mapboxgl.Marker({ color: "#5500FF" })
          .setLngLat(center)
          .addTo(map);
      } else {
        markerRef.current.setLngLat(center);
      }
    } else if (markerRef.current) {
      try {
        markerRef.current.remove();
      } catch {}
      markerRef.current = null;
    }
  }, [center]);

  // Render reusable candy markers when map is ready
  const map = mapRef.current;
  const mapboxgl = mapboxRef.current;

  // Group candies by identical coordinates
  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      { coord: LngLat; items: NonNullable<typeof candies>[number][] }
    >();
    (candies ?? []).forEach((c) => {
      const key = `${c.coord[0].toFixed(6)},${c.coord[1].toFixed(6)}`;
      if (!groups.has(key)) groups.set(key, { coord: c.coord, items: [c] });
      else groups.get(key)!.items.push(c);
    });
    return Array.from(groups.values());
  }, [candies]);

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {mapReady &&
        map &&
        mapboxgl &&
        grouped.map((g) => {
          if (g.items.length === 1) {
            const c = g.items[0]!;
            return (
              <CandyMarker
                key={c.id}
                map={map}
                mapboxgl={mapboxgl}
                coord={c.coord}
                title={c.title}
                address={c.address}
                candyType={c.candyType}
                size={64}
              />
            );
          }
          const details = g.items
            .slice(0, 6)
            .map(
              (it) =>
                `<div style="font-size:12px;line-height:1.2;margin:2px 0;">${
                  it.title ?? "Candy"
                }</div>`
            )
            .join("");
          const remaining = g.items.length - 6;
          const detailsHtml =
            details +
            (remaining > 0
              ? `<div style=\"opacity:.7;font-size:12px;\">+${remaining} more</div>`
              : "");
          return (
            <ClusterMarker
              key={`${g.coord[0]}-${g.coord[1]}`}
              map={map}
              mapboxgl={mapboxgl}
              coord={g.coord}
              count={g.items.length}
              title="Candies"
              detailsHtml={detailsHtml}
              size={40}
            />
          );
        })}
    </>
  );
}
