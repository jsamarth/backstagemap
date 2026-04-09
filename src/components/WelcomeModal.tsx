import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "backstagemap_welcomed";

export function WelcomeModal() {
  const isFirstTime = !localStorage.getItem(STORAGE_KEY);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!isFirstTime) {
      const timer = setTimeout(() => setOpen(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isFirstTime]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  if (isFirstTime) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleDismiss(); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader className="items-center">
            <img src="/logo-no-bg.png" alt="BackstageMap logo" className="h-12 w-12 mb-2" />
            <DialogTitle className="font-display text-xl">Backstage Map</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              You wanted to catch a local show tonight, but ended up lost in a maze of outdated venue calendars. Sound familiar?
              <br /><br />
              This is the fix. One map, every underground and local gig happening across NYC tonight: small venues, local acts, hidden gems. Filter by vibe, price, or time of night and find your show in seconds.
              <br /><br />
              Tap any pin to explore. Bookmark the ones you don't want to miss.
              <br /><br />
              <span className="text-xs text-muted-foreground/70 italic">
                Events may not always be 100% accurate, so always double-check with the venue's website.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Button onClick={handleDismiss} className="w-full mt-2">Got it</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) setOpen(false); }}>
      <DialogContent className="max-w-xs text-center">
        <DialogHeader className="items-center">
          <img src="/logo-no-bg.png" alt="BackstageMap logo" className="h-12 w-12 mb-2" />
          <DialogTitle className="font-display text-xl">Backstage Map</DialogTitle>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
