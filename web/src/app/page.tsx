"use client";

import { useState } from "react";
import MapView from "./components/MapView";
import MapSearch from "./components/MapSearch";
import { CANDY_LOCATIONS } from "./candy-locations";

export default function Home() {
  const [center, setCenter] = useState<[number, number] | undefined>(undefined);
  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <aside className="w-80 shrink-0 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 text-sm font-medium">Search</div>
        <MapSearch onSelect={(ll) => setCenter(ll)} />
      </aside>

      <main className="flex h-screen flex-1">
        <MapView center={center} candies={CANDY_LOCATIONS} />
      </main>
    </div>
  );
}
