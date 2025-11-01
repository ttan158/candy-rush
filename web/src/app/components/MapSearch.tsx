"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchBox } from "@mapbox/search-js-react";

type LngLat = [number, number];

export default function MapSearch({
  onSelect,
}: {
  onSelect: (center: LngLat) => void;
}) {
  const accessToken =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    "pk.eyJ1IjoidHRhbjE1OCIsImEiOiJjbWhmZnQyZ2IwNTVtMmtwbnd4d25weWh4In0.Y8BuQkJlAuS-7viwwYXF-w";

  const [proximity, setProximity] = useState<LngLat | undefined>(undefined);

  // Try to bias search results around user's current location
  useEffect(() => {
    let canceled = false;
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (canceled) return;
        setProximity([pos.coords.longitude, pos.coords.latitude]);
      },
      () => {
        // ignore errors; search will simply not be biased
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
    return () => {
      canceled = true;
    };
  }, []);

  const handleRetrieve = useCallback(
    (res: any) => {
      const coords = res?.features?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        onSelect([coords[0], coords[1]]);
      }
    },
    [onSelect]
  );

  return (
    <div className="space-y-3">
      <SearchBox
        accessToken={accessToken}
        options={{
          language: "en",
          types: "place,poi,address",
          // Bias results near the user's location if available
          proximity: proximity ? [proximity[0], proximity[1]] : undefined,
        }}
        value=""
        placeholder="Search places..."
        onRetrieve={handleRetrieve}
      />
    </div>
  );
}
