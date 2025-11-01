"use client";

import { useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView";
import MapSearch from "./components/MapSearch";
// We now derive candies from the /api/reports endpoint instead of static data

type LngLat = [number, number];
type ReportRow = {
  reportId: number;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  candyNames: string[] | null;
  reportedAt: string | null;
  reporter: string | null;
};

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function haversineKm(a: LngLat, b: LngLat) {
  const R = 6371; // km
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function Home() {
  const [center, setCenter] = useState<LngLat | undefined>(undefined);
  const [userCenter, setUserCenter] = useState<LngLat | undefined>(undefined);
  const [centerMode, setCenterMode] = useState<"current" | "address">(
    "current"
  );
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [desiredTypes, setDesiredTypes] = useState<Set<string>>(new Set());
  const [undesiredTypes, setUndesiredTypes] = useState<Set<string>>(new Set());

  // Get user's current location for default radius center if no explicit selection
  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCenter([pos.coords.longitude, pos.coords.latitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  // Fetch reports from API
  useEffect(() => {
    let canceled = false;
    const fetchReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/reports", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ReportRow[] = await res.json();
        if (!canceled) setReports(data);
      } catch (e: any) {
        if (!canceled) setError(e?.message ?? "Failed to load reports");
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    fetchReports();
    return () => {
      canceled = true;
    };
  }, []);

  const filterCenter: LngLat | undefined =
    centerMode === "address" ? center : userCenter;

  const candies = useMemo(() => {
    const rows = reports ?? [];
    const all = rows
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => {
        const names = r.candyNames ?? [];
        const first = names[0]?.toString() ?? "candy";
        return {
          id: String(r.reportId),
          coord: [r.longitude as number, r.latitude as number] as LngLat,
          title: names.length ? names.join(", ") : "Candy",
          address: r.address ?? undefined,
          candyType: first.toLowerCase().replace(/\s+/g, "-"),
          candyNames: names,
          reportedAt: r.reportedAt ?? undefined,
          reporter: r.reporter ?? undefined,
        };
      });
    if (!filterCenter) return all; // no center yet: show all
    return all.filter((c) => haversineKm(filterCenter, c.coord) <= radiusKm);
  }, [reports, filterCenter, radiusKm]);

  // Compute available candy types from reports
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    (reports ?? []).forEach((r) => {
      (r.candyNames ?? []).forEach((n) => set.add(n));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  // Compute an ordered list of waypoints (center + stops) based on preferences
  const routeWaypoints = useMemo(() => {
    if (!filterCenter) return undefined as LngLat[] | undefined;
    // If no preferences set, don't propose a route
    if (desiredTypes.size === 0 && undesiredTypes.size === 0) return undefined;
    const rows = (reports ?? []).filter(
      (r) => r.latitude != null && r.longitude != null
    );
    // Filter by radius first
    const inRadius = rows.filter(
      (r) =>
        haversineKm(filterCenter, [
          r.longitude as number,
          r.latitude as number,
        ]) <= radiusKm
    );
    // Score each by desired - undesired counts
    type Scored = {
      coord: LngLat;
      score: number;
      id: string;
      names: string[];
    };
    const norm = (s: string) => s.trim().toLowerCase();
    const ds = desiredTypes;
    const uds = undesiredTypes;
    const scored: Scored[] = inRadius.map((r) => {
      const names = (r.candyNames ?? []).map((x) => x.toString());
      const desiredCount = names.filter((n) => ds.has(norm(n))).length;
      const undesiredCount = names.filter((n) => uds.has(norm(n))).length;
      const score = desiredCount - undesiredCount;
      return {
        coord: [r.longitude as number, r.latitude as number],
        score,
        id: String(r.reportId),
        names,
      };
    });
    // Keep only those with positive score
    const candidates = scored.filter((s) => s.score > 0);
    if (candidates.length < 1) return undefined;
    // Greedy nearest-neighbor with score tie-breaking
    const remaining = [...candidates];
    const waypoints: LngLat[] = [filterCenter];
    let current = filterCenter;
    const takeNext = () => {
      let bestIdx = 0;
      let bestDist = Infinity;
      let bestScore = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(current, remaining[i].coord);
        const s = remaining[i].score;
        // Prefer higher score; break ties by distance
        if (s > bestScore || (s === bestScore && d < bestDist)) {
          bestScore = s;
          bestDist = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      waypoints.push(next.coord);
      current = next.coord;
    };
    const maxStops = Math.min(25, remaining.length); // keep within Mapbox Directions waypoint limits
    for (let i = 0; i < maxStops; i++) takeNext();
    return waypoints;
  }, [reports, filterCenter, radiusKm, desiredTypes, undesiredTypes]);

  // Fetch a walking route polyline using Mapbox Directions between consecutive waypoints
  const [routePath, setRoutePath] = useState<LngLat[] | undefined>(undefined);
  useEffect(() => {
    let aborted = false;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!routeWaypoints || routeWaypoints.length < 2 || !token) {
      setRoutePath(undefined);
      return;
    }

    const fetchSegment = async (
      from: LngLat,
      to: LngLat
    ): Promise<LngLat[] | null> => {
      const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?geometries=geojson&overview=full&access_token=${encodeURIComponent(
        token as string
      )}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const line = data?.routes?.[0]?.geometry?.coordinates as
        | [number, number][]
        | undefined;
      return line ?? null;
    };

    (async () => {
      try {
        const merged: LngLat[] = [];
        for (let i = 0; i < routeWaypoints.length - 1; i++) {
          if (aborted) return;
          const seg = await fetchSegment(
            routeWaypoints[i],
            routeWaypoints[i + 1]
          );
          if (seg && seg.length) {
            if (merged.length) {
              // avoid duplicating the joint point
              merged.push(...(seg.slice(1) as LngLat[]));
            } else {
              merged.push(...(seg as LngLat[]));
            }
          } else {
            // fallback: straight line for this segment
            const fallback = [
              routeWaypoints[i],
              routeWaypoints[i + 1],
            ] as LngLat[];
            if (merged.length) merged.push(fallback[1]);
            else merged.push(...fallback);
          }
        }
        if (!aborted) setRoutePath(merged.length ? merged : undefined);
      } catch (e) {
        if (!aborted) setRoutePath(undefined);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [routeWaypoints]);
  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <aside className="w-80 shrink-0 border-r border-zinc-200 bg-white p-4 space-y-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <div className="mb-2 text-sm font-medium">Center by</div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="center-mode"
              className="accent-pink-600"
              checked={centerMode === "current"}
              onChange={() => setCenterMode("current")}
            />
            My current location
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="center-mode"
              className="accent-pink-600"
              checked={centerMode === "address"}
              onChange={() => setCenterMode("address")}
            />
            Enter an address
          </label>
        </div>

        {centerMode === "address" ? (
          <div>
            <div className="mb-2 text-sm font-medium">Search</div>
            <MapSearch onSelect={(ll) => setCenter(ll)} />
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-sm font-medium">Candy preferences</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-1 font-medium">Desired</div>
              <div className="space-y-1 max-h-40 overflow-auto pr-1">
                {availableTypes.map((t) => {
                  const key = t.trim().toLowerCase();
                  const checked = desiredTypes.has(key);
                  return (
                    <label key={`d-${key}`} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-pink-600"
                        checked={checked}
                        onChange={(e) => {
                          setDesiredTypes((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) {
                              next.add(key);
                              // Ensure not in undesired
                              setUndesiredTypes((u) => {
                                const nu = new Set(u);
                                nu.delete(key);
                                return nu;
                              });
                            } else {
                              next.delete(key);
                            }
                            return next;
                          });
                        }}
                      />
                      <span>{t}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium">Undesired</div>
              <div className="space-y-1 max-h-40 overflow-auto pr-1">
                {availableTypes.map((t) => {
                  const key = t.trim().toLowerCase();
                  const checked = undesiredTypes.has(key);
                  return (
                    <label key={`u-${key}`} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-pink-600"
                        checked={checked}
                        onChange={(e) => {
                          setUndesiredTypes((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) {
                              next.add(key);
                              // Ensure not in desired
                              setDesiredTypes((d) => {
                                const nd = new Set(d);
                                nd.delete(key);
                                return nd;
                              });
                            } else {
                              next.delete(key);
                            }
                            return next;
                          });
                        }}
                      />
                      <span>{t}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Radius</div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={25}
              step={1}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full"
            />
            <div className="w-10 text-right text-sm tabular-nums">
              {radiusKm} km
            </div>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Center ({centerMode}):{" "}
            {filterCenter
              ? `${filterCenter[1].toFixed(4)}, ${filterCenter[0].toFixed(4)}`
              : centerMode === "current"
              ? "locating..."
              : "select an address"}
          </div>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950 dark:text-red-300">
            Failed to load reports: {error}
          </div>
        )}
      </aside>

      <main className="flex h-screen flex-1">
        <MapView
          center={filterCenter}
          candies={candies}
          routePath={routePath}
          routeStops={routeWaypoints}
        />
      </main>
    </div>
  );
}
