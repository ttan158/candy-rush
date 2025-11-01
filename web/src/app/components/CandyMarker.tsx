"use client";

import { useEffect, useRef } from "react";

type LngLat = [number, number];

export interface CandyMarkerProps {
  map: any; // mapboxgl.Map
  mapboxgl: any;
  coord: LngLat; // [lng, lat]
  title?: string;
  address?: string;
  candyNames?: string[];
  reportedAt?: string; // ISO string
  reporter?: string;
  iconUrl?: string; // overrides candyType; when omitted, derived from candyType
  candyType?: string; // resolves to "/<type>.png", falls back to "/candy.png"
  size?: number; // px, default 64
  popup?: boolean; // default true
}

export default function CandyMarker({
  map,
  mapboxgl,
  coord,
  title,
  address,
  candyNames,
  reportedAt,
  reporter,
  iconUrl,
  candyType,
  size = 64,
  popup = true,
}: CandyMarkerProps) {
  const markerRef = useRef<any>(null);
  const resolvedUrlRef = useRef<string>("/candy.png");

  const pickCandidate = () => {
    if (iconUrl) return iconUrl;
    if (candyType) {
      const safe = `/${String(candyType)
        .toLowerCase()
        .replace(/\s+/g, "-")}.png`;
      return safe;
    }
    return "/candy.png";
  };

  // Create marker on mount and remove on unmount
  useEffect(() => {
    if (!map || !mapboxgl) return;

    // Custom element for the icon
    const el = document.createElement("div");
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    const candidate = pickCandidate();
    el.style.backgroundImage = `url(${candidate})`;
    el.style.backgroundSize = "contain";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.cursor = "pointer";

    const marker = new mapboxgl.Marker({ element: el }).setLngLat(coord);

    const fmtTime = (iso?: string) => {
      if (!iso) return "";
      try {
        const d = new Date(iso);
        return d.toLocaleString();
      } catch {
        return iso;
      }
    };

    if (popup) {
      const p = new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<div style="color:#111;">
           <div style="font-weight:600;margin-bottom:6px;">${
             candyNames && candyNames.length
               ? candyNames.join(", ")
               : title ?? "Candy"
           }</div>
           ${
             address
               ? `<div style="font-size:12px;opacity:.8;margin-bottom:4px;">${address}</div>`
               : ""
           }
           <div style="font-size:12px;opacity:.8;">
             ${reporter ? `Reported by: <strong>${reporter}</strong>` : ""}
             ${
               reportedAt
                 ? `${reporter ? " · " : ""}Time: ${fmtTime(reportedAt)}`
                 : ""
             }
           </div>
         </div>`
      );
      marker.setPopup(p);
    }

    // Resolve candidate with runtime fallback to /candy.png
    const img = new Image();
    img.onload = () => {
      resolvedUrlRef.current = candidate;
      el.style.backgroundImage = `url(${resolvedUrlRef.current})`;
    };
    img.onerror = () => {
      resolvedUrlRef.current = "/candy.png";
      el.style.backgroundImage = `url(${resolvedUrlRef.current})`;
    };
    img.src = candidate;

    marker.addTo(map);
    markerRef.current = marker;

    return () => {
      try {
        marker.remove();
      } catch {}
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mapboxgl]);

  // Update position when coordinates change
  useEffect(() => {
    if (!markerRef.current) return;
    markerRef.current.setLngLat(coord);
  }, [coord]);

  // Update popup content when title/address changes
  useEffect(() => {
    if (!markerRef.current || !popup) return;
    try {
      const fmtTime = (iso?: string) => {
        if (!iso) return "";
        try {
          const d = new Date(iso);
          return d.toLocaleString();
        } catch {
          return iso;
        }
      };
      markerRef.current.getPopup()?.setHTML(
        `<div style="color:#111;">
           <div style="font-weight:600;margin-bottom:6px;">${
             candyNames && candyNames.length
               ? candyNames.join(", ")
               : title ?? "Candy"
           }</div>
           ${
             address
               ? `<div style="font-size:12px;opacity:.8;margin-bottom:4px;">${address}</div>`
               : ""
           }
           <div style="font-size:12px;opacity:.8;">
             ${reporter ? `Reported by: <strong>${reporter}</strong>` : ""}
             ${
               reportedAt
                 ? `${reporter ? " · " : ""}Time: ${fmtTime(reportedAt)}`
                 : ""
             }
           </div>
         </div>`
      );
    } catch {}
  }, [title, address, popup, candyNames, reportedAt, reporter]);

  // Update icon or size dynamically
  useEffect(() => {
    if (!markerRef.current) return;
    const el = markerRef.current.getElement?.();
    if (!el) return;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    const candidate = pickCandidate();
    const img = new Image();
    img.onload = () => {
      resolvedUrlRef.current = candidate;
      el.style.backgroundImage = `url(${resolvedUrlRef.current})`;
    };
    img.onerror = () => {
      resolvedUrlRef.current = "/candy.png";
      el.style.backgroundImage = `url(${resolvedUrlRef.current})`;
    };
    img.src = candidate;
  }, [iconUrl, candyType, size]);

  return null;
}
