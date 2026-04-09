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
              Discover underground and local live music happening tonight across NYC - think small venues, local acts, and hidden gems, not big concerts.
              <br />
              Tap any pin to explore shows near you, and bookmark the ones you don't want to miss.
              <br /><br />
              <span className="text-xs text-muted-foreground/70 italic">
                We do our best to keep events accurate, but they may not always be 100% accurate - always double-check with the venue's website.
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
