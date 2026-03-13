import { MapPin } from "lucide-react";

export function LogoMark() {
  return (
    <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-card/80 backdrop-blur-md rounded-full px-4 py-2 border border-border">
      <img src="logo-no-bg.png" alt="Backstage Map" className="w-8 h-8" />
      <span className="font-display font-bold text-sm tracking-tight">Backstage Map</span>
    </div>
  );
}
