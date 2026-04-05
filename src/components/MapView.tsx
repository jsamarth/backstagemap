import { useMemo, useRef, useState, useEffect } from "react";
import ReactMap, { Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EventWithVenue, EventTypeKey } from "@/types";
import { EVENT_TYPE_HEX } from "@/types";
import { useToast } from "@/hooks/use-toast";

interface MapViewProps {
  events: EventWithVenue[];
  selectedVenueId: string | null;
  onSelectVenue: (events: EventWithVenue[]) => void;
  flyToVenue?: { lng: number; lat: number } | null;
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

export function MapView({ events, selectedVenueId, onSelectVenue, flyToVenue }: MapViewProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const { toast } = useToast();
  const mapRef = useRef<MapRef>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) return;
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (result.state === "granted") {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            setUserLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          () => {},
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!flyToVenue || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [flyToVenue.lng, flyToVenue.lat],
      zoom: 15,
      duration: 1200,
    });
  }, [flyToVenue]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    if (userLocation) {
      mapRef.current?.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 14,
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserLocation(loc);
        mapRef.current?.flyTo({ center: [loc.longitude, loc.latitude], zoom: 14 });
      },
      () => {
        toast({
          title: "Location access denied",
          description: "Enable location access in your browser settings.",
          variant: "destructive",
        });
      },
    );
  };

  const venueGroups = useMemo(() => {
    const map = new Map<string, EventWithVenue[]>();
    for (const event of events) {
      const key = event.venue_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    for (const [key, group] of map) {
      map.set(
        key,
        group
          .sort((a, b) => {
            const d = a.date.localeCompare(b.date);
            return d !== 0 ? d : (a.time_start ?? "").localeCompare(b.time_start ?? "");
          })
          .slice(0, 5),
      );
    }
    return map;
  }, [events]);

  return (
    <div className="relative w-full h-full">
    <ReactMap
      ref={mapRef}
      initialViewState={NYC_CENTER}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      mapStyle={MAP_STYLE}
      attributionControl={false}
      minZoom={9}
    >
      {Array.from(venueGroups.entries()).map(([venueId, venueEvents]) => {
        const first = venueEvents[0];
        const color = EVENT_TYPE_HEX[first.event_type as EventTypeKey] || "#A855F7";
        const isSelected = venueId === selectedVenueId;
        return (
          <Marker
            key={venueId}
            latitude={first.venues.latitude}
            longitude={first.venues.longitude}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectVenue(venueEvents);
            }}
          >
            <div
              className={`cursor-pointer transition-transform duration-150 ${isSelected ? "scale-150" : "hover:scale-125"}`}
              title={first.venues.name}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full border-2 border-background shadow-lg ${isSelected ? "animate-pulse-pin" : ""}`}
                style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }}
              />
            </div>
          </Marker>
        );
      })}
      {userLocation && (
        <Marker latitude={userLocation.latitude} longitude={userLocation.longitude} anchor="center">
          <div data-testid="user-location-marker" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div
              className="animate-pulse-ring absolute rounded-full"
              style={{ width: 40, height: 40, background: "rgba(66,133,244,0.2)" }}
            />
            <div
              className="absolute rounded-full"
              style={{ width: 26, height: 26, background: "rgba(66,133,244,0.15)" }}
            />
            <div
              className="relative rounded-full"
              style={{
                width: 14,
                height: 14,
                background: "#4285F4",
                border: "2.5px solid white",
                boxShadow: "0 0 8px rgba(66,133,244,0.8)",
                zIndex: 1,
              }}
            />
          </div>
        </Marker>
      )}
    </ReactMap>
    {navigator.geolocation && (
      <button
        onClick={handleLocateMe}
        aria-label="Center on my location"
        className="absolute bottom-10 right-2.5 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
        style={{
          background: "rgba(15,23,42,0.9)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          color: userLocation ? "#4285F4" : "white",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>
    )}
    <div className="absolute bottom-2 left-2">
      <button
        onClick={() => setAboutOpen((o) => !o)}
        className="w-5 h-5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 text-white/50 hover:text-white/80 hover:border-white/30 transition-colors flex items-center justify-center text-[10px] font-semibold"
        aria-label="About"
      >
        i
      </button>
      {aboutOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAboutOpen(false)} />
          <div className="absolute bottom-7 left-0 z-50 w-56 rounded-lg bg-card/95 backdrop-blur-md border border-border p-3 shadow-lg text-xs text-muted-foreground font-body space-y-1.5">
            <p className="font-semibold text-foreground text-sm">BackstageMap</p>
            <p>Discover live music in NYC.</p>
            <div className="border-t border-border pt-1.5 space-y-1">
              <p>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">OpenStreetMap</a> contributors</p>
              <p>Tiles © <a href="https://carto.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">CARTO</a></p>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
