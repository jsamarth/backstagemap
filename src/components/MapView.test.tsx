import { render, screen, act, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { MapView } from "./MapView";

// Mock react-map-gl/maplibre — MapLibre requires WebGL which doesn't exist in jsdom
const mockFlyTo = vi.fn();
vi.mock("react-map-gl/maplibre", () => ({
  default: vi.fn(({ children, ref }: any) => {
    // Expose a fake map ref so flyTo can be tested
    if (ref) {
      ref.current = { flyTo: mockFlyTo };
    }
    return <div data-testid="map">{children}</div>;
  }),
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  NavigationControl: () => <div data-testid="nav-control" />,
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

// Minimal event fixture
const makeEvent = (overrides = {}) => ({
  id: "evt-1",
  venue_id: "venue-1",
  date: "2026-04-01",
  time_start: "20:00",
  event_type: "live_band",
  price_type: "free",
  venues: { latitude: 40.714, longitude: -74.006, name: "Test Venue" },
  ...overrides,
});

describe("MapView — user location", () => {
  beforeEach(() => {
    mockFlyTo.mockClear();
    // Default: geolocation exists but permission is "prompt"
    Object.defineProperty(navigator, "geolocation", {
      writable: true,
      value: {
        getCurrentPosition: vi.fn(),
      },
    });
    Object.defineProperty(navigator, "permissions", {
      writable: true,
      value: {
        query: vi.fn().mockResolvedValue({ state: "prompt" }),
      },
    });
  });

  it("renders location button when geolocation is available", () => {
    render(<MapView events={[makeEvent()]} selectedVenueId={null} onSelectVenue={vi.fn()} />);
    expect(screen.getByRole("button", { name: /center on my location/i })).toBeInTheDocument();
  });

  it("hides location button when geolocation is unavailable", () => {
    Object.defineProperty(navigator, "geolocation", { writable: true, value: undefined });
    render(<MapView events={[]} selectedVenueId={null} onSelectVenue={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /center on my location/i })).not.toBeInTheDocument();
  });

  it("does NOT call getCurrentPosition on mount when permission is 'prompt'", async () => {
    render(<MapView events={[]} selectedVenueId={null} onSelectVenue={vi.fn()} />);
    await act(async () => {});
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("calls getCurrentPosition on mount when permission is already 'granted'", async () => {
    (navigator.permissions.query as ReturnType<typeof vi.fn>).mockResolvedValue({ state: "granted" });
    render(<MapView events={[]} selectedVenueId={null} onSelectVenue={vi.fn()} />);
    await act(async () => {});
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("calls getCurrentPosition when button is clicked and location is unknown", async () => {
    render(<MapView events={[]} selectedVenueId={null} onSelectVenue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /center on my location/i }));
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("does not render user location marker initially", () => {
    render(<MapView events={[makeEvent()]} selectedVenueId={null} onSelectVenue={vi.fn()} />);
    // venue marker exists, but no user-location marker
    // Note: Marker mock renders {children}, so data-testid="user-location-marker" on a child div will propagate
    expect(screen.queryByTestId("user-location-marker")).not.toBeInTheDocument();
  });
});
