import { Users } from "lucide-react";
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
    description: "Conference and CFP listings across 50 CS topic feeds.",
  },
  {
    name: "arXiv",
    description: "Preprints from 17 categories, including ML, NLP and quantum.",
  },
  {
    name: "Call4Paper",
    description: "Computer-science events and journal calls with deadlines.",
  },
  {
    name: "Jobs.ac.uk",
    description: "PhD, postdoc, internship and research-staff roles.",
  },
  {
    name: "Science Careers",
    description: "Job feeds for postdocs, PhDs and research fellowships.",
  },
  {
    name: "AcademicJobsOnline",
    description: "Computer-science faculty and research postings.",
  },
  {
    name: "Funding bodies & agencies",
    description: "NSF, UKRI, DST, ANRF and other funding calls.",
  },
  {
    name: "University programmes",
    description: "Admissions and internships at IITs, IISc, NITs and more.",
  },
  {
    name: "Book chapter publishers",
    description: "Chapter calls from INFORMS, IntechOpen, KY and IGI Global.",
  },
  {
    name: "Industry research labs",
    description: "Research roles at OpenAI, Anthropic, Cohere and other labs.",
  },
  {
    name: "Opportunity boards",
    description:
      "Scholarships and fellowships from Opportunity Desk, Scholars4Dev and more.",
  },
  {
    name: "Springer & Elsevier",
    description: "Journal records and submission details for the journal finder.",
  },
];

const TEAM_MEMBERS = [
  { name: "Ayush Gupta", initials: "AG", rollNumber: "23124022" },
  { name: "Bhuvan Kumar", initials: "BK", rollNumber: "23124048" },
  { name: "Pratham Chhabra", initials: "PC", rollNumber: "23124077" },
];

const About = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />

      <div className="flex-1">
        <div className="container mx-auto max-w-[1380px] px-5 pt-8 pb-8 md:px-6 md:pt-10 md:pb-0">
          <header className="pb-16 md:pb-24">
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
              <div className="mt-4 grid gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div>
                  <h2
                    id="purpose-heading"
                    className="font-display text-3xl font-medium leading-[1.1] tracking-[-0.02em] text-foreground md:text-4xl"
                  >
                    Research discovery should feel direct, structured, and
                    reliable.
                  </h2>
                  <p className="mt-5 text-base leading-7 text-muted-foreground lg:text-lg lg:leading-8">
                    Finding the right venue or opportunity often means checking
                    many disconnected portals every week. ResearchSphere unifies
                    those flows with consistent search, clean filters, and
                    source-linked records across computer science domains.
                  </p>
                </div>

                <ul className="space-y-6">
                  {PURPOSE_POINTS.map(({ title, detail }) => (
                    <li key={title} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                      />
                      <div>
                        <p className="text-lg font-medium text-foreground">
                          {title}
                        </p>
                        <p className="mt-1 text-base leading-7 text-muted-foreground">
                          {detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section aria-labelledby="sources-heading">
              <p className="eyebrow">Data sources</p>
              <h2
                id="sources-heading"
                className="mt-4 max-w-2xl font-display text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground md:text-[2rem]"
              >
                Where the platform data comes from
              </h2>

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
                    className="h-full rounded-lg border border-border bg-card p-5"
                  >
                    <p className="text-base font-semibold text-foreground">
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

              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <article className="flex h-full flex-col items-start rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/25">
                  <img
                    src="/mohit-sir.jpg"
                    alt="Dr. Mohit Kumar"
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-full object-cover object-top ring-1 ring-border"
                  />
                  <div className="mt-4">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Mentor
                    </p>
                    <p className="mt-1 text-base font-medium text-foreground">
                      Dr. Mohit Kumar
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Assistant Professor, Department of Information Technology
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      NIT Jalandhar
                    </p>
                  </div>
                </article>

                {TEAM_MEMBERS.map(({ name, initials, rollNumber }) => (
                  <article
                    key={name}
                    className="flex h-full flex-col items-start rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/25"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tracking-wide text-foreground ring-1 ring-border"
                    >
                      {initials}
                    </span>
                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Student
                      </p>
                      <p className="mt-1 text-base font-medium text-foreground">
                        {name}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        BTech IT, 4th Year
                      </p>
                      <p className="text-sm leading-6 tabular-nums text-muted-foreground">
                        Roll No. {rollNumber}
                      </p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-8 max-w-3xl">
                <p className="text-base leading-7 text-muted-foreground">
                  We are grateful for Dr. Mohit Kumar's guidance and support
                  throughout the development of ResearchSphere, helping
                  transform an idea into a platform that serves the research
                  community.
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
