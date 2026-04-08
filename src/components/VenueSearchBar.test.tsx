import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { VenueSearchBar } from "@/components/VenueSearchBar";

// Minimal event fixtures — only the fields VenueSearchBar uses
const makeEvent = (venueId: string, venueName: string, neighborhood = "williamsburg") =>
  ({
    id: `evt-${venueId}`,
    venue_id: venueId,
    venues: { id: venueId, name: venueName, neighborhood },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const events = [
  makeEvent("v1", "Sunnyvale Bar & Grill", "williamsburg"),
  makeEvent("v2", "Elsewhere", "bushwick"),
  makeEvent("v3", "TV Eye", "williamsburg"),
  // duplicate venue — should only appear once in dropdown
  makeEvent("v1", "Sunnyvale Bar & Grill", "williamsburg"),
];

describe("VenueSearchBar", () => {
  it("renders a search trigger with placeholder text when nothing is selected", () => {
    render(<VenueSearchBar events={events} selectedIds={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /search venues/i })).toBeInTheDocument();
  });

  it("shows first venue name when one venue is selected", () => {
    render(<VenueSearchBar events={events} selectedIds={["v1"]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /sunnyvale bar/i })).toBeInTheDocument();
  });

  it("shows first venue name and overflow count when multiple venues selected", () => {
    render(<VenueSearchBar events={events} selectedIds={["v1", "v2"]} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /sunnyvale bar/i });
    expect(trigger).toHaveTextContent("+1 more");
  });

  it("clicking clear button calls onChange with empty array", () => {
    const onChange = vi.fn();
    render(<VenueSearchBar events={events} selectedIds={["v1"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /clear venue filter/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("opens dropdown with unique venue names on trigger click", () => {
    render(<VenueSearchBar events={events} selectedIds={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /search venues/i }));
    expect(screen.getByPlaceholderText(/search venues/i)).toBeInTheDocument();
    // v1 appears twice in events but only once in dropdown
    expect(screen.getAllByText("Sunnyvale Bar & Grill")).toHaveLength(1);
    expect(screen.getByText("Elsewhere")).toBeInTheDocument();
    expect(screen.getByText("TV Eye")).toBeInTheDocument();
  });

  it("filters dropdown list when user types in the search input", () => {
    render(<VenueSearchBar events={events} selectedIds={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /search venues/i }));
    fireEvent.change(screen.getByPlaceholderText(/search venues/i), {
      target: { value: "sun" },
    });
    expect(screen.getByText("Sunnyvale Bar & Grill")).toBeInTheDocument();
    expect(screen.queryByText("Elsewhere")).not.toBeInTheDocument();
  });

  it("calls onChange with venueId added when an unselected venue is clicked", () => {
    const onChange = vi.fn();
    render(<VenueSearchBar events={events} selectedIds={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /search venues/i }));
    fireEvent.click(screen.getByText("Elsewhere"));
    expect(onChange).toHaveBeenCalledWith(["v2"]);
  });

  it("calls onChange with venueId removed when a selected venue is clicked", () => {
    const onChange = vi.fn();
    render(<VenueSearchBar events={events} selectedIds={["v1", "v2"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /sunnyvale bar/i }));
    fireEvent.click(screen.getByText("Sunnyvale Bar & Grill"));
    expect(onChange).toHaveBeenCalledWith(["v2"]);
  });

  it("shows neighborhood label next to venue name in dropdown", () => {
    render(<VenueSearchBar events={events} selectedIds={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /search venues/i }));
    // v1 and v3 are both williamsburg; v2 is bushwick — each row shows its own neighborhood
    expect(screen.getAllByText("williamsburg")).toHaveLength(2);
    expect(screen.getByText("bushwick")).toBeInTheDocument();
  });
});
