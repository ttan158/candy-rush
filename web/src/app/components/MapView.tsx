"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import CandyMarker from "./CandyMarker";
import ClusterMarker from "./ClusterMarker";
import StopMarker from "./StopMarker";

type LngLat = [number, number];
const DEFAULT_CENTER: LngLat = [174.768838, -36.846611];
const DEFAULT_ZOOM: number = 15;

interface MapViewProps {
  center?: LngLat;
  zoom?: number;
  showCenterMarker?: boolean; // show blue center marker only when true
  candies?: Array<{
    id: string;
    coord: LngLat;
    title?: string;
    address?: string;
    candyType?: string;
    candyNames?: string[];
    reportedAt?: string;
    reporter?: string;
  }>;
  routePath?: LngLat[];
  routeStops?: LngLat[]; // ordered waypoints (center + stops)
}

export default function MapView({
  center,
  zoom,
  showCenterMarker,
  candies,
  routePath,
  routeStops,
}: MapViewProps) {
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
        if (showCenterMarker) {
          if (!markerRef.current) {
            markerRef.current = new mapboxgl.Marker({ color: "#5500FF" })
              .setLngLat(c)
              .addTo(map);
          } else {
            markerRef.current.setLngLat(c);
          }
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

  // Create or update a marker whenever center/showCenterMarker changes
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;

    if (center && showCenterMarker) {
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
  }, [center, showCenterMarker]);

  // Render reusable candy markers when map is ready
  const map = mapRef.current;
  const mapboxgl = mapboxRef.current;

  // Group candies by exact coordinates; fallback to grouping by normalized address
  // This ensures multiple reports at the same house cluster reliably, even if the
  // backend emits multiple rows for the same location.
  const grouped = useMemo(() => {
    type Item = NonNullable<typeof candies>[number];
    const byKey = new Map<string, { coord: LngLat; items: Item[] }>();
    const norm = (s?: string) => (s ?? "").trim().toLowerCase();

    (candies ?? []).forEach((c) => {
      const coordKey = `${c.coord[0]},${c.coord[1]}`; // exact match
      const addressKey = c.address ? `addr:${norm(c.address)}` : undefined;

      // Prefer existing address group, then exact coord group, else create new by address or coord
      let key: string | undefined = undefined;
      if (addressKey && byKey.has(addressKey)) key = addressKey;
      else if (byKey.has(coordKey)) key = coordKey;
      else key = addressKey ?? coordKey;

      const group = byKey.get(key);
      if (!group) byKey.set(key, { coord: c.coord, items: [c] });
      else group.items.push(c);
    });

    return Array.from(byKey.values());
  }, [candies]);

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {/* Render route path as a line layer when available */}
      {mapReady &&
        map &&
        routePath &&
        routePath.length >= 2 &&
        (() => {
          try {
            const sourceId = "route-path";
            const layerId = "route-path-line";
            const hasSource = !!map.getSource?.(sourceId);
            if (!hasSource) {
              map.addSource(sourceId, {
                type: "geojson",
                data: {
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: routePath },
                  properties: {},
                },
              });
            } else {
              const src: any = map.getSource(sourceId);
              src?.setData({
                type: "Feature",
                geometry: { type: "LineString", coordinates: routePath },
                properties: {},
              });
            }
            const hasLayer = !!map.getLayer?.(layerId);
            if (!hasLayer) {
              map.addLayer({
                id: layerId,
                type: "line",
                source: sourceId,
                layout: { "line-join": "round", "line-cap": "round" },
                paint: {
                  "line-color": "#0ea5e9",
                  "line-width": 4,
                  "line-opacity": 0.85,
                },
              });
            }
          } catch {}
          return null;
        })()}
      {mapReady && map && mapboxgl && routeStops && routeStops.length > 1 && (
        // Render numeric badges for each stop (excluding the initial center at index 0)
        <>
          {routeStops.slice(1).map((coord, idx) => (
            <StopMarker
              key={`stop-${idx + 1}-${coord[0]}-${coord[1]}`}
              map={map}
              mapboxgl={mapboxgl}
              coord={coord}
              index={idx + 1}
              size={28}
            />
          ))}
        </>
      )}
      {mapReady &&
        map &&
        mapboxgl &&
        grouped.map((g) => {
          // Determine unique candy types across all reports at this location
          const typeSet = new Set<string>();
          g.items.forEach((it) => {
            (it.candyNames ?? []).forEach((nm) => {
              const key = String(nm).trim();
              if (key) typeSet.add(key);
            });
          });
          const uniqueTypes = Array.from(typeSet);

          if (uniqueTypes.length === 1) {
            // Single type at this location -> show a single CandyMarker with that type
            const onlyType = uniqueTypes[0]!;
            const first = g.items[0]!;
            const slug = onlyType.toLowerCase().replace(/\s+/g, "-");
            return (
              <CandyMarker
                key={`single-${g.coord[0]}-${g.coord[1]}-${slug}`}
                map={map}
                mapboxgl={mapboxgl}
                coord={g.coord}
                title={onlyType}
                address={first.address}
                candyType={slug}
                candyNames={[onlyType]}
                reportedAt={first.reportedAt}
                reporter={first.reporter}
                size={64}
              />
            );
          }

          if (uniqueTypes.length === 0 && g.items.length === 1) {
            // Fallback: no type info but only one report -> show its marker
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
                candyNames={c.candyNames}
                reportedAt={c.reportedAt}
                reporter={c.reporter}
                size={64}
              />
            );
          }

          // Multiple different types at this location -> cluster marker
          // For each type, show latest report time
          const fmtTime = (iso?: string) => {
            if (!iso) return "";
            try {
              const d = new Date(iso);
              return d.toLocaleString();
            } catch {
              return iso as string;
            }
          };

          type TypeMeta = { latestISO?: string; count: number };
          const typeMeta = new Map<string, TypeMeta>();
          g.items.forEach((it) => {
            const iso = it.reportedAt;
            (it.candyNames ?? []).forEach((nm) => {
              const key = String(nm).trim();
              if (!key) return;
              const m = typeMeta.get(key) ?? { latestISO: undefined, count: 0 };
              m.count += 1;
              if (!m.latestISO) m.latestISO = iso;
              else if (
                iso &&
                new Date(iso).getTime() > new Date(m.latestISO).getTime()
              )
                m.latestISO = iso;
              typeMeta.set(key, m);
            });
          });

          // Sort by latest time desc, fallback to name
          const sortedTypes = Array.from(typeMeta.entries()).sort((a, b) => {
            const ta = a[1].latestISO ? new Date(a[1].latestISO).getTime() : 0;
            const tb = b[1].latestISO ? new Date(b[1].latestISO).getTime() : 0;
            if (tb !== ta) return tb - ta;
            return a[0].localeCompare(b[0]);
          });

          const toShow = sortedTypes.slice(0, 8);
          const detailsHtml =
            toShow
              .map(([t, meta]) => {
                const when = meta.latestISO ? fmtTime(meta.latestISO) : "";
                return (
                  `<div style=\"font-size:12px;line-height:1.3;margin:4px 0;\">` +
                  `<div style=\"font-weight:600;\">${t}</div>` +
                  `${
                    when
                      ? `<div style=\"font-size:11px;opacity:.75;\">${when}</div>`
                      : ""
                  }` +
                  `</div>`
                );
              })
              .join("") +
            (sortedTypes.length > toShow.length
              ? `<div style=\"opacity:.7;font-size:12px;\">+${
                  sortedTypes.length - toShow.length
                } more</div>`
              : "");

          return (
            <ClusterMarker
              key={`cluster-${g.coord[0]}-${g.coord[1]}-${uniqueTypes
                .map((t) => t.toLowerCase())
                .sort()
                .join("_")}`}
              map={map}
              mapboxgl={mapboxgl}
              coord={g.coord}
              count={uniqueTypes.length}
              title="Candy types"
              detailsHtml={detailsHtml}
              size={40}
            />
          );
        })}
    </>
  );
}
