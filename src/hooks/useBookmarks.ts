import { useState, useCallback } from "react";
import type { EventWithVenue } from "@/types";

const STORAGE_KEY = "backstagemap_bookmarks";

function loadFromStorage(): EventWithVenue[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(events: EventWithVenue[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function useBookmarks() {
  const [bookmarked, setBookmarked] = useState<EventWithVenue[]>(loadFromStorage);

  const addBookmark = useCallback((event: EventWithVenue) => {
    setBookmarked((prev) => {
      if (prev.some((e) => e.id === event.id)) return prev;
      const next = [...prev, event];
      saveToStorage(next);
      return next;
    });
  }, []);

  const removeBookmark = useCallback((eventId: string) => {
    setBookmarked((prev) => {
      const next = prev.filter((e) => e.id !== eventId);
      saveToStorage(next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback(
    (eventId: string) => bookmarked.some((e) => e.id === eventId),
    [bookmarked]
  );

  // Shape expected by SavedEventsPanel: { id, events: EventWithVenue }[]
  const bookmarks = bookmarked.map((e) => ({ id: e.id, events: e }));

  return { bookmarks, isBookmarked, addBookmark, removeBookmark };
}
