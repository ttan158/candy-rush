"use client";

import { useEffect, useRef } from "react";

type LngLat = [number, number];

export interface StopMarkerProps {
  map: any; // mapboxgl.Map
  mapboxgl: any;
  coord: LngLat;
  index: number; // 1-based step number
  size?: number; // px
}

export default function StopMarker({
  map,
  mapboxgl,
  coord,
  index,
  size = 28,
}: StopMarkerProps) {
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !mapboxgl) return;
    const el = document.createElement("div");
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = "50%";
    el.style.background = "#111827"; // zinc-900
    el.style.color = "#ffffff";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.fontWeight = "700";
    el.style.fontSize = `${Math.max(12, Math.floor(size * 0.45))}px`;
    el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";
    el.style.userSelect = "none";
    el.style.cursor = "default";
    el.style.zIndex = "3";
    el.textContent = String(index);

    const marker = new mapboxgl.Marker({ element: el }).setLngLat(coord);
    marker.addTo(map);
    markerRef.current = marker;

    return () => {
      try {
        marker.remove();
      } catch {}
      markerRef.current = null;
    };
  }, [map, mapboxgl]);

  useEffect(() => {
    markerRef.current?.setLngLat(coord);
  }, [coord]);

  useEffect(() => {
    const el = markerRef.current?.getElement?.();
    if (!el) return;
    el.textContent = String(index);
  }, [index]);

  useEffect(() => {
    const el = markerRef.current?.getElement?.();
    if (!el) return;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.fontSize = `${Math.max(12, Math.floor(size * 0.45))}px`;
  }, [size]);

  return null;
}
