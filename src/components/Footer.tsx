import { ArrowUpRight, Bell, Eye, MapPin, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { trackPageVisit, getVisitCount } from "@/lib/analytics";
import BrandMark from "@/components/BrandMark";
import { SECTIONS } from "@/lib/sections";

const Footer = () => {
  const [visits, setVisits] = useState(0);

  useEffect(() => {
    trackPageVisit();
    setVisits(getVisitCount());
  }, []);

  const columns = [
    { title: "Call for", links: SECTIONS.filter((section) => section.group === "publish") },
    { title: "Opportunities", links: SECTIONS.filter((section) => section.group === "career") },
    {
      title: "Platform",
      links: [
        // Removed: the all-in-one finder page.
        // { path: "/general-finder", title: "Search everything" },
        { path: "/user-hub", title: "User Hub" },
        { path: "/about", title: "About" },
        { path: "/research-collaboration", title: "Collaborate" },
      ],
    },
  ];

  return (
    <footer className="mt-24">
      <div className="container mx-auto max-w-[1380px] px-5 md:px-6">
        {/* Blue call-to-action band */}
        <div className="tile-lime flex flex-col gap-5 rounded-[28px] px-6 py-7 md:flex-row md:items-center md:justify-between md:px-10">
          <div>
            <p className="font-display text-2xl font-medium uppercase tracking-tight md:text-3xl">
              Never miss a deadline again
            </p>
            <p className="mt-1 text-sm opacity-75">
              Save listings to your watchlist and get reminders before they close.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="hidden items-center gap-2 text-sm opacity-75 lg:inline-flex">
              <RefreshCw className="h-4 w-4" /> Refreshed automatically every 6 hours
            </span>
            <Link
              to="/user-hub"
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.03]"
            >
              <Bell className="h-4 w-4" /> Set up alerts
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-16 border-t border-border/60">
        <div className="container mx-auto grid max-w-[1380px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-6">
          <div className="space-y-4">
            <BrandMark />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              A self-updating map of conferences, journals, funding and research careers across
              technology — from AI and cloud to Web3 and security.
            </p>
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Built for researchers, everywhere
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="eyebrow mb-4">{column.title}</h3>
              <ul className="space-y-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.path}>
                    <Link
                      to={link.path}
                      className="group inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.title}
                      <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="container mx-auto flex max-w-[1380px] flex-col gap-3 border-t border-border/60 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
          <span>© {new Date().getFullYear()} ResearchSphere. Listings belong to their original publishers.</span>
          {visits > 0 && (
            <span className="inline-flex items-center gap-2">
              <Eye className="h-3.5 w-3.5" /> {visits.toLocaleString()} page {visits === 1 ? "view" : "views"}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
