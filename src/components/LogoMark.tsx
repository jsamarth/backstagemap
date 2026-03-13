import { MapPin } from "lucide-react";

export function LogoMark() {
  return (
    <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-card/80 backdrop-blur-md rounded-full px-4 py-2 border border-border">
      <MapPin className="w-4 h-4 text-primary" />
      <span className="font-display font-bold text-sm tracking-tight">BackstageMap</span>
    </div>
  );
}
