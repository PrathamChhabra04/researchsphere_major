import { Mail, RefreshCw, Users } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

const PURPOSE_POINTS = [
  {
    title: "Continuously refreshed",
    detail: "Records are harvested automatically from trusted sources.",
  },
  {
    title: "Computer-science focused",
    detail:
      "Taxonomy, tags, and ranking are tuned for computing and emerging-tech topics.",
  },
  {
    title: "Source transparent",
    detail: "Every listing links back to the original provider page.",
  },
];

/**
 * Only feed families that are actually declared in SOURCE_REGISTRY live here.
 * Removed sources (FindAPhD, NoticeBard, ResearchTweet, Papers With Code) are
 * deliberately absent.
 */
const DATA_SOURCES = [
  {
    name: "WikiCFP",
    description:
      "Conference and call-for-paper listings across 50 computer-science topic feeds.",
  },
  {
    name: "arXiv",
    description:
      "Preprints from 17 categories, including ML, NLP, systems and quantum.",
  },
  {
    name: "Call4Paper",
    description:
      "Computer-science events and journal calls with submission deadlines.",
  },
  {
    name: "Jobs.ac.uk",
    description:
      "PhD, postdoc, internship and research-staff roles searched by topic.",
  },
  {
    name: "Science Careers",
    description:
      "Job feeds for computer-science roles, postdocs, PhDs and fellowships.",
  },
  {
    name: "AcademicJobsOnline",
    description: "Computer-science faculty and research postings.",
  },
  {
    name: "Funding bodies & agencies",
    description:
      "Calls and announcements from NSF, UKRI, DST, ANRF, ICSSR, MeitY, CSIR, ISRO, DRDO, NIRF and AICTE.",
  },
  {
    name: "University programmes",
    description:
      "Admissions and internships from the IITs, IISc, NITs, ETH Zurich, CERN, KAUST and ISTA.",
  },
  {
    name: "Book chapter publishers",
    description:
      "Chapter calls from INFORMS Connect, IntechOpen, KY Publications and IGI Global.",
  },
  {
    name: "Industry research labs",
    description:
      "Research-track roles from OpenAI, Anthropic, Cohere, Perplexity and other AI labs.",
  },
  {
    name: "Opportunity boards",
    description:
      "Scholarships, fellowships and internships from Opportunity Desk, Scholars4Dev, Mladiinfo and Opportunities Corners.",
  },
  {
    name: "Springer & Elsevier",
    description:
      "Journal records and submission details used by the journal finder.",
  },
];

const TEAM_MEMBERS = [
  { name: "Ayush Gupta", initials: "AG" },
  { name: "Bhuvan Kumar", initials: "BK" },
  { name: "Devansh", initials: "D" },
  { name: "Pratham Chhabra", initials: "PC" },
];

const About = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />

      <div className="flex-1">
        <div className="container mx-auto max-w-[1380px] px-5 py-8 md:px-6 md:py-10">
          <header className="pb-12 md:pb-16">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary">
                <Users className="h-4 w-4" />
              </span>
              <p className="eyebrow">About</p>
            </div>
            <h1 className="display-xl mt-5 text-[2.6rem] normal-case sm:text-6xl lg:text-[5.2rem]">
              About ResearchSphere
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              A student team at Dr. B. R. Ambedkar NIT Jalandhar, building one
              place for research opportunities.
            </p>
          </header>

          <div className="space-y-16 md:space-y-24">
            <section aria-labelledby="purpose-heading">
              <p className="eyebrow">Purpose</p>
              <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
                <div>
                  <h2
                    id="purpose-heading"
                    className="max-w-2xl font-display text-3xl font-medium leading-[1.1] tracking-[-0.02em] text-foreground md:text-4xl"
                  >
                    Research discovery should feel direct, structured, and
                    reliable.
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
                    Finding the right venue or opportunity often means checking
                    many disconnected portals every week. ResearchSphere unifies
                    those flows with consistent search, clean filters, and
                    source-linked records across computer science domains.
                  </p>
                </div>

                <ul className="space-y-5 lg:pt-1">
                  {PURPOSE_POINTS.map(({ title, detail }) => (
                    <li key={title} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                      />
                      <div>
                        <p className="text-base font-medium text-foreground">
                          {title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section aria-labelledby="sources-heading">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="eyebrow">Data sources</p>
                  <h2
                    id="sources-heading"
                    className="mt-4 max-w-2xl font-display text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground md:text-[2rem]"
                  >
                    Where the platform data comes from
                  </h2>
                </div>
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground lg:pb-1">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  Refreshed every six hours by default
                </p>
              </div>

              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                ResearchSphere aggregates from curated academic registries,
                feeds, and opportunity boards. Each result remains traceable to
                its source so users can verify details and submit through
                official channels.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {DATA_SOURCES.map(({ name, description }) => (
                  <div
                    key={name}
                    className="rounded-lg border border-border bg-card p-5"
                  >
                    <p className="text-base font-medium text-foreground">
                      {name}
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="team-heading">
              <p className="eyebrow">Team</p>
              <h2
                id="team-heading"
                className="mt-4 max-w-2xl font-display text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground md:text-[2rem]"
              >
                The people behind ResearchSphere
              </h2>

              <div className="mt-8 space-y-3">
                <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime/35 text-base font-semibold text-foreground"
                    >
                      MK
                    </span>
                    <div>
                      <p className="text-base font-medium text-foreground">
                        Dr. Mohit Kumar
                      </p>
                      <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                        Assistant Professor, Department of Information
                        Technology
                      </p>
                    </div>
                  </div>
                  <span className="w-fit rounded-full border border-border px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground">
                    Mentor
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {TEAM_MEMBERS.map(({ name, initials }) => (
                    <div
                      key={name}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 md:p-5"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
                      >
                        {initials}
                      </span>
                      <p className="text-base font-medium text-foreground">
                        {name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 max-w-3xl space-y-3">
                <p className="text-base leading-7 text-muted-foreground">
                  We are grateful for Dr. Mohit Kumar's guidance and support
                  throughout the development of ResearchSphere, helping
                  transform an idea into a platform that serves the research
                  community.
                </p>
                <p className="inline-flex items-center gap-2 text-base text-muted-foreground">
                  <Mail className="h-4 w-4 text-primary" />
                  <a
                    href="mailto:researchsphere.team@gmail.com"
                    className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    researchsphere.team@gmail.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default About;
