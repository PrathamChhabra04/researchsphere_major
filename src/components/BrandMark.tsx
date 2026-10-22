import { Link } from "react-router-dom";

/** Line-art sphere mark (meridians + orbit) drawn in currentColor, with a lime node. */
export const SphereIcon = ({ className = "h-6 w-6" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.5" />
    <ellipse cx="16" cy="16" rx="5" ry="11" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 16h22" stroke="currentColor" strokeWidth="1.5" />
    <ellipse
      cx="16"
      cy="16"
      rx="15"
      ry="5.5"
      transform="rotate(-28 16 16)"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="1.2"
    />
    <circle cx="28.4" cy="9.6" r="2.4" className="fill-lime" />
  </svg>
);

const BrandMark = ({ compact = false }: { compact?: boolean }) => (
  <Link to="/" className="group flex items-center gap-2.5 text-foreground" aria-label="ResearchSphere home">
    <SphereIcon className="h-7 w-7 transition-transform duration-500 group-hover:rotate-[24deg]" />
    {!compact && (
      <span className="font-display text-[17px] font-medium tracking-tight">
        Research<span className="text-muted-foreground">Sphere</span>
      </span>
    )}
  </Link>
);

export default BrandMark;
