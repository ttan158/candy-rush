"use client";

import { useEffect, useRef } from "react";

type LngLat = [number, number];

export interface ClusterMarkerProps {
  map: any; // mapboxgl.Map
  mapboxgl: any;
  coord: LngLat; // [lng, lat]
  count: number;
  title?: string; // optional label in popup
  detailsHtml?: string; // optional extra HTML in popup
  size?: number; // diameter px, default 40
}

export default function ClusterMarker({
  map,
  mapboxgl,
  coord,
  count,
  title,
  detailsHtml,
  size = 40,
}: ClusterMarkerProps) {
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !mapboxgl) return;

    // Element with number badge styling
    const el = document.createElement("div");
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.borderRadius = "50%";
    el.style.background = "#ef4444"; // red-500
    el.style.color = "white";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.fontWeight = "700";
    el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
    el.style.userSelect = "none";
    el.style.cursor = "pointer";
    el.textContent = String(count);

    const marker = new mapboxgl.Marker({ element: el }).setLngLat(coord);

    const popupContent = `
      <div style="min-width:160px;">
        <div style="font-weight:600;margin-bottom:4px;">${
          title ?? "Candy"
        } (${count})</div>
        ${detailsHtml ?? ""}
      </div>`;
    const popup = new mapboxgl.Popup({ offset: 18 }).setHTML(popupContent);
    marker.setPopup(popup);

    marker.addTo(map);
    markerRef.current = marker;

    return () => {
      try {
        marker.remove();
      } catch {}
      markerRef.current = null;
    };
  }, [map, mapboxgl]);

  // Update position
  useEffect(() => {
    markerRef.current?.setLngLat(coord);
  }, [coord]);

  // Update count and popup when changes
  useEffect(() => {
    const el = markerRef.current?.getElement?.();
    if (el) el.textContent = String(count);
    try {
      markerRef.current
        ?.getPopup()
        ?.setHTML(
          `<div style="min-width:160px;"><div style="font-weight:600;margin-bottom:4px;">${
            title ?? "Candy"
          } (${count})</div>${detailsHtml ?? ""}</div>`
        );
    } catch {}
  }, [count, title, detailsHtml]);

  // Update size
  useEffect(() => {
    const el = markerRef.current?.getElement?.();
    if (!el) return;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
  }, [size]);

  return null;
}
