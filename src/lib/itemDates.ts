import type { HarvestItem } from "@/services/apiClient";

/** Best available timestamp for "newest/oldest" sorting. */
export const itemTimestamp = (item: HarvestItem) => {
  const value = item.postedAt || item.startsAt || item.firstSeenAt || item.eventDate || item.deadline;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** Soonest deadline first; listings without a known deadline go last. */
export const compareByDeadline = (a: HarvestItem, b: HarvestItem) => {
  const left = a.deadlineAt ? Date.parse(a.deadlineAt) : Number.POSITIVE_INFINITY;
  const right = b.deadlineAt ? Date.parse(b.deadlineAt) : Number.POSITIVE_INFINITY;
  if (left === right) return itemTimestamp(b) - itemTimestamp(a);
  return left - right;
};
