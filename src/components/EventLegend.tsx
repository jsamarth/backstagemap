import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from "@/types";
import type { EventTypeKey } from "@/types";

export function EventLegend() {
  return (
    <div className="absolute bottom-6 left-4 z-10 flex items-center gap-3 bg-card/80 backdrop-blur-md rounded-full px-4 py-2 border border-border">
      {(Object.entries(EVENT_TYPE_LABELS) as [EventTypeKey, string][]).map(([key, label]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${EVENT_TYPE_COLORS[key]}`} />
          <span className="text-[10px] font-body text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
