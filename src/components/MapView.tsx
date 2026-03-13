import { useRef, useCallback, useEffect } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EventWithVenue, EventTypeKey } from "@/types";
import { EVENT_TYPE_HEX } from "@/types";

interface MapViewProps {
  events: EventWithVenue[];
  selectedEventId: string | null;
  onSelectEvent: (event: EventWithVenue) => void;
}

const NYC_CENTER = { latitude: 40.7128, longitude: -73.9700, zoom: 12.5 };

// Dark map style using free CartoCDN tiles
const MAP_STYLE = {
  version: 8 as const,
  name: "Dark",
  sources: {
    "carto-dark": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    },
  },
  layers: [
    {
      id: "carto-dark-layer",
      type: "raster" as const,
      source: "carto-dark",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export function MapView({ events, selectedEventId, onSelectEvent }: MapViewProps) {
  return (
    <Map
      initialViewState={NYC_CENTER}
      style={{ width: "100%", height: "100%" }}
      mapStyle={MAP_STYLE}
      attributionControl={true}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      {events.map((event) => {
        const color = EVENT_TYPE_HEX[event.event_type as EventTypeKey] || "#A855F7";
        const isSelected = event.id === selectedEventId;
        return (
          <Marker
            key={event.id}
            latitude={event.venues.latitude}
            longitude={event.venues.longitude}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectEvent(event);
            }}
          >
            <div
              className={`cursor-pointer transition-transform duration-150 ${isSelected ? "scale-150" : "hover:scale-125"}`}
              title={event.event_name}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full border-2 border-background shadow-lg ${isSelected ? "animate-pulse-pin" : ""}`}
                style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }}
              />
            </div>
          </Marker>
        );
      })}
    </Map>
  );
}
