import { Badge } from "@/components/ui/badge";
import type { HarvestItem } from "@/services/apiClient";

const STATUS_STYLES: Record<string, string> = {
  "closing-soon": "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  open: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  upcoming: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "submissions-closed": "border-border bg-muted/60 text-muted-foreground",
  expired: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const describe = (item: HarvestItem) => {
  const days = item.daysUntilDeadline;
  switch (item.status) {
    case "closing-soon":
      if (days === 0) return "Closes today";
      if (days === 1) return "Closes tomorrow";
      return `Closes in ${days} days`;
    case "open":
      return "Open";
    case "upcoming":
      return "Upcoming";
    case "submissions-closed":
      return "Submissions closed";
    case "expired":
      return "Closed";
    default:
      return null;
  }
};

/** Live status chip computed by the API from the parsed deadline / event dates. */
const DeadlineStatusBadge = ({ item }: { item: HarvestItem }) => {
  const label = describe(item);
  if (!label || !item.status) return null;

  return (
    <Badge
      variant="secondary"
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[item.status] ?? ""}`}
    >
      {label}
    </Badge>
  );
};

export default DeadlineStatusBadge;
