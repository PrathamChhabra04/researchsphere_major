import type { HarvestItem } from "@/services/apiClient";

const STEPS: { key: keyof NonNullable<HarvestItem["milestones"]>; label: string }[] = [
  { key: "abstract", label: "Abstract" },
  { key: "submission", label: "Submission" },
  { key: "notification", label: "Notification" },
  { key: "cameraReady", label: "Camera-ready" },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Vertical CFP timeline; past milestones are dimmed, the next one is highlighted in lime. */
const ConferenceMilestones = ({ item }: { item: HarvestItem }) => {
  const milestones = item.milestones ?? {};
  const steps = STEPS.filter((step) => milestones[step.key]);
  if (!steps.length) return null;

  const now = Date.now();
  const nextKey = steps.find((step) => Date.parse(milestones[step.key] as string) + 86_400_000 >= now)?.key;

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {steps.map((step) => {
        const iso = milestones[step.key] as string;
        const isPast = Date.parse(iso) + 86_400_000 < now;
        const isNext = step.key === nextKey;
        return (
          <li key={step.key} className="relative">
            <span
              className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-muted ${
                isNext ? "bg-primary" : isPast ? "bg-muted-foreground/40" : "bg-foreground/60"
              }`}
            />
            <p className={`text-xs uppercase tracking-[0.16em] ${isNext ? "text-primary" : "text-muted-foreground"}`}>
              {step.label}
            </p>
            <p className={`text-sm font-medium ${isPast ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-foreground"}`}>
              {formatDate(iso)}
            </p>
          </li>
        );
      })}
    </ol>
  );
};

export default ConferenceMilestones;
