import { FILTER_TYPE_LABELS, FILTER_TYPE_COLORS } from "@/types";
import type { FilterEventTypeKey } from "@/types";

export function EventLegend() {
  return (
    <div className="absolute left-4 z-10 flex items-center gap-3 bg-card/80 backdrop-blur-md rounded-full px-4 py-2 border border-border" style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
      {(Object.entries(FILTER_TYPE_LABELS) as [FilterEventTypeKey, string][]).map(([key, label]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${FILTER_TYPE_COLORS[key]}`} />
          <span className="text-[10px] font-body text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
