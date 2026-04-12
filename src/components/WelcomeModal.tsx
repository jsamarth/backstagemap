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
              Want to catch a live gig or jam session tonight, but can't face another broken venue calendar or outdated events page?
              <br /><br />
              BackstageMap pulls NYC's local shows (bands, DJs, open mics, jam sessions) into one map, updated and ready to browse. Filter by neighborhood, vibe, price, or time of night. Tap any pin for details. Bookmark what you don't want to miss.
              <br /><br />
              <span className="text-xs text-muted-foreground/70 italic">
                Events may not always be 100% accurate, so always double-check with the venue before heading out.
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
