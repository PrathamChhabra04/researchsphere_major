import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  eyebrow: string;
  /** Headline; rendered uppercase with the white-to-grey sheen */
  title: ReactNode;
  /** Optional italic serif accent after the title (e.g. a year or count) */
  accent?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
}

/** Shared page header in the site's display style: lime eyebrow, giant headline, side copy. */
const PageHeader = ({ eyebrow, title, accent, description, icon: Icon, actions }: PageHeaderProps) => (
  <header className="pb-8 pt-4 md:pb-12 md:pt-8">
    <div className="flex items-center gap-3">
      {Icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <p className="eyebrow">{eyebrow}</p>
    </div>
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end">
      <h1 className="display-xl text-[2.6rem] sm:text-6xl lg:text-[5.2rem]">
        {title}
        {accent && (
          <span className="serif-accent ml-3 align-baseline text-[0.55em] text-muted-foreground [-webkit-text-fill-color:currentColor]">
            {accent}
          </span>
        )}
      </h1>
      {(description || actions) && (
        <div className="space-y-5 lg:pb-2">
          {description && (
            <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">{description}</p>
          )}
          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </div>
      )}
    </div>
  </header>
);

export default PageHeader;
