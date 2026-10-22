import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Search,
  ArrowRight,
  ArrowDown,
  ArrowUpRight,
  Bookmark,
  Bell,
  BrainCircuit,
  Cpu,
  Presentation,
  Timer,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SourceMarquee from "@/components/SourceMarquee";
import DeadlineStatusBadge from "@/components/DeadlineStatusBadge";
import { SphereIcon } from "@/components/BrandMark";
import { SECTIONS } from "@/lib/sections";
// import AssistantWidget from "@/components/AssistantWidget";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getHarvestStatus,
  matchJournals,
  searchHarvestedData,
  type HarvestItem,
  type JournalMatchItem,
} from "@/services/apiClient";
import {
  getPersonalizedItems,
  getInteractions,
  getReminders,
  getReminderStatusInfo,
  trackItemInteraction,
  trackSearchInteraction,
  removeReminderByItemId,
  removeWatchlistItem,
  getUserPreferences,
  getWatchlist,
} from "@/lib/personalization";

type QuickReminderFilter = "all" | "overdue" | "this-week" | "upcoming";

const GENERIC_NOISE_TAGS = new Set([
  "preprint",
  "article",
  "conference",
  "cfp",
  "call for papers",
  "paper",
  "research",
  "academic",
  "publication",
  "journal",
  "proceedings",
  "workshop",
  "symposium",
  "submit",
  "submission",
  "call",
  "open",
  "special",
  "issue",
  "volume",
  "international",
  "annual",
  "ieee",
  "acm",
  "springer",
  "computer science",
  "cs",
  "phd",
  "postdoc",
  "internship",
  "project-call",
  "project call",
  "fellowship",
  "scholarship",
  "jobs",
  "job",
  "call",
  "proposal",
  "proposals",
  "position",
  "positions",
  "research opportunity",
  "opportunity",
  "opportunities",
  "india",
  "global",
]);

const CURATED_RESEARCH_TOPICS = [
  "machine learning",
  "deep learning",
  "computer vision",
  "cybersecurity",
  "cloud computing",
  "natural language processing",
  "data science",
  "blockchain",
  "distributed systems",
  "quantum computing",
  "reinforcement learning",
  "human computer interaction",
];

const TOPIC_ALIASES: Record<string, string[]> = {
  "machine learning": ["machine learning", "ml"],
  "deep learning": ["deep learning"],
  "computer vision": ["computer vision", "vision"],
  cybersecurity: ["cybersecurity", "cyber security", "security"],
  "cloud computing": ["cloud", "cloud computing"],
  "natural language processing": [
    "natural language processing",
    "nlp",
    "language model",
    "large language model",
    "llm",
  ],
  "data science": ["data science", "data mining", "big data"],
  blockchain: ["blockchain"],
  "distributed systems": [
    "distributed systems",
    "distributed system",
    "systems",
  ],
  "quantum computing": ["quantum computing", "quantum"],
  "reinforcement learning": ["reinforcement learning", "rl"],
  "human computer interaction": ["human computer interaction", "hci"],
};

const INTEREST_ALIAS_OVERRIDES: Record<string, string[]> = {
  cybersecurity: ["cybersecurity", "cyber security", "security", "infosec"],
  cybersecuriyy: ["cybersecurity", "cyber security", "security", "infosec"],
  "machine learning": ["machine learning", "ml"],
  machinelearning: ["machine learning", "ml"],
  deeplearning: ["deep learning"],
};

const normalizeTopicText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractTopicMatches = (value: string): string[] => {
  const normalized = ` ${normalizeTopicText(value)} `;
  const matches: string[] = [];

  Object.entries(TOPIC_ALIASES).forEach(([topic, aliases]) => {
    if (aliases.some((alias) => normalized.includes(` ${normalizeTopicText(alias)} `))) {
      matches.push(topic);
    }
  });

  return matches;
};

const buildInterestMatchers = (interests: string[]): string[] => {
  const matchers = new Set<string>();

  interests.forEach((interest) => {
    const normalized = normalizeTopicText(interest);
    if (!normalized) return;

    const overridden = INTEREST_ALIAS_OVERRIDES[normalized] || [normalized];
    overridden.forEach((alias) => {
      const compact = normalizeTopicText(alias);
      if (compact.length >= 2) {
        matchers.add(compact);
      }
    });

    // Also add token-level terms for flexible matching of custom interests.
    normalized.split(" ").forEach((token) => {
      if (token.length >= 4) {
        matchers.add(token);
      }
    });
  });

  return [...matchers];
};

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [quickPanelType, setQuickPanelType] = useState<
    "watchlist" | "reminders"
  >("watchlist");
  const navigate = useNavigate();
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const [preferences, setPreferences] = useState(() => getUserPreferences());
  const [watchlist, setWatchlist] = useState(() => getWatchlist());
  const [reminders, setReminders] = useState(() => getReminders());
  const [interactionEvents, setInteractionEvents] = useState(() =>
    getInteractions(),
  );
  const [quickReminderFilter, setQuickReminderFilter] =
    useState<QuickReminderFilter>("all");

  useEffect(() => {
    const sync = () => {
      setPreferences(getUserPreferences());
      setWatchlist(getWatchlist());
      setReminders(getReminders());
      setInteractionEvents(getInteractions());
    };

    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    setPreferences(getUserPreferences());
    setWatchlist(getWatchlist());
    setReminders(getReminders());
    setInteractionEvents(getInteractions());
  }, [location.pathname]);

  const { data: featuredConferences = [], isLoading: conferencesLoading } =
    useQuery({
      queryKey: ["home-featured-conferences"],
      queryFn: () =>
        searchHarvestedData({
          kind: "conference",
          sort: "start",
          limit: 10,
        }),
      staleTime: 1000 * 60 * 10,
    });

  const { data: harvestStatus } = useQuery({
    queryKey: ["harvest-status"],
    queryFn: getHarvestStatus,
    staleTime: 1000 * 60 * 10,
  });
  const liveCounts: Record<string, number> = harvestStatus?.liveCounts ?? {};
  const sourceCount = harvestStatus?.sourcesConfigured ?? 140;

  const { data: soonestDeadline } = useQuery({
    queryKey: ["home-soonest-deadline"],
    queryFn: async () =>
      (
        await searchHarvestedData({
          kind: "opportunity",
          status: "closing-soon,open",
          sort: "deadline",
          limit: 1,
        })
      )[0] ?? null,
    staleTime: 1000 * 60 * 10,
  });

  const { data: featuredJournals = [], isLoading: journalsLoading } = useQuery({
    queryKey: ["home-featured-journals", "machine-learning", "keyword"],
    queryFn: async () => {
      const response = await matchJournals({
        query: "machine learning",
        mode: "keyword",
        provider: "all",
        limit: 6,
      });

      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const journalIntentQuery = useMemo(() => {
    const interest = preferences.interests
      .map((item) => item.trim())
      .find(Boolean);
    return interest || "machine learning";
  }, [preferences.interests]);

  const { data: matchedPersonalizedJournals = [] } = useQuery({
    queryKey: ["home-personalized-journals", journalIntentQuery],
    queryFn: async () => {
      const response = await matchJournals({
        query: journalIntentQuery,
        mode: "keyword",
        provider: "all",
        limit: 20,
      });

      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: featuredOpportunities = [], isLoading: opportunitiesLoading } =
    useQuery({
      queryKey: ["home-featured-opportunities", currentYear],
      queryFn: () =>
        searchHarvestedData({
          kind: "opportunity",
          fromYear: currentYear,
          limit: 6,
        }),
      staleTime: 1000 * 60 * 10,
    });

  const { data: homepageItems = [] } = useQuery({
    queryKey: ["home-items", currentYear],
    queryFn: () =>
      searchHarvestedData({
        fromYear: currentYear,
        limit: 120,
      }),
    staleTime: 1000 * 60 * 10,
  });

  const trendingTopics = useMemo(() => {
    const frequency = new Map<string, number>();

    const addTopicScore = (topic: string, score: number) => {
      frequency.set(topic, (frequency.get(topic) || 0) + score);
    };

    interactionEvents.forEach((event) => {
      const signalText = [event.query || "", event.title || "", ...(event.tags || [])]
        .join(" ")
        .trim();

      if (!signalText) return;

      extractTopicMatches(signalText).forEach((topic) => {
        addTopicScore(topic, event.type === "search" ? 5 : 2);
      });
    });

    homepageItems.forEach((item: HarvestItem) => {
      (item.tags || []).forEach((tag) => {
        const normalized = normalizeTopicText(tag);
        if (
          !normalized ||
          normalized === item.kind?.toLowerCase() ||
          normalized === (item.subtype || "").toLowerCase() ||
          GENERIC_NOISE_TAGS.has(normalized) ||
          normalized.length < 3
        ) {
          return;
        }

        const topicMatches = extractTopicMatches(normalized);
        if (topicMatches.length > 0) {
          topicMatches.forEach((topic) => addTopicScore(topic, 3));
          return;
        }

        if (
          normalized.includes("learning") ||
          normalized.includes("vision") ||
          normalized.includes("security") ||
          normalized.includes("cloud") ||
          normalized.includes("blockchain") ||
          normalized.includes("computing")
        ) {
          addTopicScore(normalized, 1);
        }
      });
    });

    CURATED_RESEARCH_TOPICS.forEach((topic) => {
      addTopicScore(topic, 0.25);
    });

    const ranked = [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
      .slice(0, 10);

    if (ranked.length < 5) {
      CURATED_RESEARCH_TOPICS.forEach((topic) => {
        if (!ranked.includes(topic) && ranked.length < 10) {
          ranked.push(topic);
        }
      });
    }

    return ranked;
  }, [homepageItems, interactionEvents]);

  const personalizedItems = useMemo(() => {
    const interestMatchers = buildInterestMatchers(preferences.interests);
    const interestScopedItems =
      interestMatchers.length > 0
        ? homepageItems.filter((item) => {
            const haystack = normalizeTopicText(
              [item.title, item.summary || "", ...(item.tags || [])].join(" "),
            );
            return interestMatchers.some((matcher) => haystack.includes(matcher));
          })
        : homepageItems;

    const candidateItems =
      interestScopedItems.length >= 3 ? interestScopedItems : homepageItems;

    const matchedJournalItems: HarvestItem[] = matchedPersonalizedJournals.map(
      (journal, index) => {
        const provider = (journal.provider || "").trim();
        const providerLabel = provider
          ? provider.charAt(0).toUpperCase() + provider.slice(1)
          : "Journal";

        return {
          id: `home-personalized-journal-${journal.issn || journal.title}-${index}`,
          kind: "journal",
          subtype: "journal",
          title: journal.title,
          summary: journal.scopeSnippet || journal.scope || null,
          organization: providerLabel,
          sourceName: providerLabel,
          url:
            journal.submissionLink ||
            journal.guideForAuthors ||
            journal.sourceUrl ||
            "/journals",
          tags: journal.subjectAreas || journal.topicSeeds || [],
          score: journal.score,
        };
      },
    );

    const combinedItems = [
      ...candidateItems.filter((item) => item.kind !== "journal"),
      ...matchedJournalItems,
    ];

    const selected: HarvestItem[] = [];
    const seen = new Set<string>();

    const pushUnique = (item?: HarvestItem) => {
      if (!item || seen.has(item.id)) return;
      selected.push(item);
      seen.add(item.id);
    };

    const topJournal = getPersonalizedItems(
      matchedJournalItems,
      preferences,
      1,
    )[0];
    const topConference = getPersonalizedItems(
      combinedItems.filter((item) => item.kind === "conference"),
      preferences,
      1,
    )[0];

    // Ensure baseline mix before filling remaining slots.
    pushUnique(topJournal);
    pushUnique(topConference);

    getPersonalizedItems(combinedItems, preferences, 12).forEach(pushUnique);

    if (selected.length < 4) {
      combinedItems.forEach(pushUnique);
    }

    return selected.slice(0, 4);
  }, [homepageItems, preferences, matchedPersonalizedJournals]);

  const reminderRows = useMemo(() => {
    return reminders.map((item) => {
      const status = getReminderStatusInfo(item);
      const dueText =
        status.daysUntil === null
          ? "Date unavailable"
          : status.daysUntil < 0
            ? `${Math.abs(status.daysUntil)} day${Math.abs(status.daysUntil) === 1 ? "" : "s"} overdue`
            : status.daysUntil === 0
              ? "Due today"
              : `Due in ${status.daysUntil} day${status.daysUntil === 1 ? "" : "s"}`;

      return { item, status, dueText };
    });
  }, [reminders]);

  const reminderCounts = useMemo(
    () => ({
      overdue: reminderRows.filter(({ status }) => status.state === "overdue")
        .length,
      thisWeek: reminderRows.filter(
        ({ status }) =>
          status.daysUntil !== null &&
          status.daysUntil >= 0 &&
          status.daysUntil <= 7,
      ).length,
    }),
    [reminderRows],
  );

  const filteredReminderRows = useMemo(() => {
    return reminderRows.filter(({ status }) => {
      if (quickReminderFilter === "all") return true;
      if (quickReminderFilter === "overdue") return status.state === "overdue";
      if (quickReminderFilter === "upcoming") {
        return status.state === "upcoming" || status.state === "today";
      }
      if (quickReminderFilter === "this-week") {
        return (
          status.daysUntil !== null &&
          status.daysUntil >= 0 &&
          status.daysUntil <= 7
        );
      }
      return true;
    });
  }, [quickReminderFilter, reminderRows]);

  const handleSearch = () => {
    const normalized = searchQuery.trim();
    if (normalized) {
      trackSearchInteraction(normalized);
      navigate(`/general-finder?q=${encodeURIComponent(normalized)}`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getJournalLink = (journal: JournalMatchItem) =>
    journal.submissionLink || journal.guideForAuthors || journal.sourceUrl || "/journals";

  const getJournalSource = (journal: JournalMatchItem) => {
    if (!journal.provider) return "Journal";
    return journal.provider.charAt(0).toUpperCase() + journal.provider.slice(1);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <div className="flex-1">
        {/* Hero */}
        <section className="hero-glow relative overflow-hidden">
          <div className="container relative mx-auto flex min-h-[calc(100svh-72px)] flex-col px-4 pb-8 pt-10 md:pt-14">
            <div className="relative flex flex-1 items-center justify-center">
              {/* Floating live tiles (desktop) */}
              <Link
                to="/conferences"
                style={{ "--tilt": "-4deg" } as CSSProperties}
                className="float-slow tile-lime absolute left-0 top-[4%] hidden w-44 rounded-2xl p-4 shadow-2xl xl:block xl:left-[2%] 2xl:left-[5%]"
              >
                <Presentation className="h-5 w-5" />
                <p className="mt-6 font-display text-4xl font-semibold tracking-tight">
                  {liveCounts.conference ?? "—"}
                </p>
                <p className="text-xs font-medium opacity-75">upcoming conferences</p>
              </Link>

              <Link
                to="/journals"
                style={{ "--tilt": "3deg" } as CSSProperties}
                className="float-slower tile-circuit absolute right-0 top-0 hidden w-48 rounded-2xl p-4 text-white shadow-2xl xl:block xl:right-[2%] 2xl:right-[6%]"
              >
                <Cpu className="h-5 w-5 text-lime" />
                <p className="mt-6 font-display text-4xl font-semibold tracking-tight">
                  {liveCounts.journal ?? "—"}
                </p>
                <p className="text-xs opacity-75">papers &amp; articles indexed</p>
              </Link>

              {soonestDeadline && (
                <a
                  href={soonestDeadline.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ "--tilt": "2deg" } as CSSProperties}
                  className="float-slower absolute bottom-[6%] left-[3%] hidden w-64 rounded-2xl border border-border bg-card/90 p-4 shadow-2xl backdrop-blur xl:block xl:left-[3%] 2xl:left-[9%]"
                >
                  <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-primary">
                    <Timer className="h-3.5 w-3.5" /> Closing next
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{soonestDeadline.title}</p>
                  <div className="mt-3">
                    <DeadlineStatusBadge item={soonestDeadline} />
                  </div>
                </a>
              )}

              <Link
                to="/research-jobs"
                style={{ "--tilt": "-3deg" } as CSSProperties}
                className="float-slow tile-fiber absolute bottom-0 right-[4%] hidden h-48 w-40 overflow-hidden rounded-2xl p-4 text-white shadow-2xl xl:block xl:right-[4%] 2xl:right-[14%]"
              >
                <BrainCircuit className="h-5 w-5" />
                <p className="mt-14 font-display text-4xl font-semibold tracking-tight">
                  {liveCounts.research ?? "—"}
                </p>
                <p className="text-xs opacity-80">research &amp; AI-lab roles</p>
              </Link>

              <div className="relative z-10 text-center">
                <p className="eyebrow mb-6 inline-flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Live from {sourceCount}+ sources
                </p>
                <h1 className="display-xl text-[2.7rem] sm:text-6xl md:text-7xl lg:text-[6.6rem]">
                  Every open call
                  <br />
                  in the{" "}
                  <Link to="/general-finder" className="lime-chip mx-1 text-[0.82em] transition-transform hover:scale-[1.03]">
                    CS &amp; AI
                  </Link>{" "}
                  research
                  <br />
                  world, live
                </h1>
                <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  Conferences, journals, funding calls, PhDs, postdocs, internships and AI-lab
                  research roles — harvested automatically, with deadlines you can act on.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link to="/phd-programs" className="pill-lime">
                    Find opportunities <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link to="/journals" className="pill">
                    Match a journal
                  </Link>
                </div>
              </div>
            </div>

            {/* Bottom bar: search + scroll cue */}
            <div className="relative z-10 mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <label className="flex w-full max-w-md items-center gap-3 border-b border-border pb-2 focus-within:border-primary">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Type to search — NeurIPS, LLM postdoc, funded PhD…"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button type="button" onClick={handleSearch} className="whitespace-nowrap text-xs font-medium text-primary">
                  Enter ↵
                </button>
              </label>
              <a href="#explore" className="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
                <ArrowDown className="h-4 w-4 animate-bounce" /> Keep scrolling
              </a>
            </div>
          </div>
        </section>

        {/* Explore: one card per section with live counts */}
        <section id="explore" className="container mx-auto scroll-mt-24 px-4 py-20 md:py-28">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex flex-col justify-between gap-10 lg:pr-8">
              <p className="eyebrow">What we track</p>
              <div className="space-y-6">
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Harvested, not hand-typed.</span>{" "}
                  Every few hours we read feeds, job boards and lab APIs, parse their deadlines,
                  and quietly retire listings once they close.
                </p>
                <Link to="/general-finder" className="pill">
                  Search everything
                </Link>
              </div>
            </div>
            <h2 className="display-lg text-4xl sm:text-5xl lg:col-span-2 lg:text-[3.6rem]">
              We track{" "}
              <span className="inline-flex h-[0.9em] w-[0.9em] items-center justify-center rounded-full bg-accent align-[-0.08em] text-white [-webkit-text-fill-color:white]">
                <SphereIcon className="h-[0.6em] w-[0.6em]" />
              </span>{" "}
              every corner of CS research
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SECTIONS.map((section, index) => {
              const Icon = section.icon;
              const count = liveCounts[section.countKey];
              const numberAtTop = index % 2 === 1;
              return (
                <Link key={section.path} to={section.path} className="service-card group flex min-h-[260px] flex-col">
                  <span
                    className={`ghost-number right-3 ${numberAtTop ? "-top-4" : "-bottom-6"}`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="relative flex items-center gap-4">
                    <span className="icon-orb">
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                    </span>
                    <h3 className="text-xl font-normal tracking-tight text-foreground">{section.title}</h3>
                    <ArrowUpRight className="ml-auto h-5 w-5 text-primary opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </div>
                  <p className={`relative text-sm leading-relaxed text-muted-foreground ${numberAtTop ? "mt-auto" : "mt-5"}`}>
                    {section.description}
                  </p>
                  {typeof count === "number" && (
                    <span className={`tag-chip relative w-fit ${numberAtTop ? "mt-4" : "mt-auto"}`}>
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-primary" /> {count} live
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Upcoming conferences carousel */}
        <section className="py-10 md:py-16">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
              <div>
                <p className="eyebrow mb-4">On the calendar</p>
                <h2 className="display-xl text-5xl sm:text-6xl lg:text-[5.2rem]">
                  Upcoming
                  <br />
                  conferences{" "}
                  <span className="serif-accent text-[0.55em] text-muted-foreground [-webkit-text-fill-color:currentColor]">
                    {currentYear}–{String(currentYear + 1).slice(2)}
                  </span>
                </h2>
              </div>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between lg:flex-col xl:flex-row">
                <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                  Sorted by event date, with submission status from each call for papers. Expired
                  events disappear on their own.
                </p>
                <Link to="/conferences" className="pill shrink-0">
                  All conferences
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-12 flex snap-x gap-4 overflow-x-auto px-4 pb-4 custom-scrollbar md:px-[max(1rem,calc((100vw-1400px)/2+2rem))]">
            {conferencesLoading
              ? [...Array(4)].map((_, i) => (
                  <div key={i} className="h-[360px] w-[300px] shrink-0 rounded-2xl bg-card shimmer" />
                ))
              : featuredConferences.map((item: HarvestItem, index: number) => {
                  const tile = ["tile-fiber text-white", "bg-card", "tile-circuit text-white", "bg-card"][index % 4];
                  const startDate = item.startsAt
                    ? new Date(item.startsAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
                    : item.eventDate;
                  // WikiCFP: "ACRONYM 2026 : Full name"; Call4Paper: "Full name (ACRONYM 2026)"
                  const [prefix, ...rest] = item.title.split(" : ");
                  const parenthesised = item.title.match(/\(([A-Z][\w-]*(?: \d{4})?)\)\s*$/);
                  const acronym = rest.length ? prefix : parenthesised?.[1] ?? "Conference";
                  const fullName = rest.length
                    ? rest.join(" : ")
                    : item.title.replace(/\s*\([^)]*\)\s*$/, "");
                  return (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${tile} group relative flex h-[360px] w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl p-6 transition-transform hover:-translate-y-1`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-display text-3xl font-semibold tracking-tight">{acronym}</p>
                        <ArrowUpRight className="h-5 w-5 opacity-60 transition-opacity group-hover:opacity-100" />
                      </div>
                      <p className="mt-4 line-clamp-4 text-sm leading-relaxed opacity-80">{fullName}</p>
                      <div className="mt-auto flex flex-wrap items-center gap-2">
                        <DeadlineStatusBadge item={item} />
                        {startDate && <span className="tag-chip">{startDate}</span>}
                        {item.location && <span className="tag-chip max-w-full truncate">{item.location}</span>}
                      </div>
                    </a>
                  );
                })}
          </div>

          <div className="container mx-auto mt-14 px-4">
            <p className="mb-5 text-xs uppercase tracking-[0.2em] text-muted-foreground">Harvested from</p>
            <SourceMarquee />
          </div>
        </section>

        {/* Trending topics */}
        <section className="container mx-auto px-4 py-10">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow mb-3">Trending now</p>
              <h2 className="display-lg text-4xl md:text-5xl">Research areas</h2>
            </div>
            <span className="text-sm text-muted-foreground">Based on recent activity</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(trendingTopics.length > 0
              ? trendingTopics
              : [
                  "machine learning",
                  "large language models",
                  "blockchain",
                  "data science",
                  "computer vision",
                  "cybersecurity",
                  "generative ai",
                  "cloud computing",
                  "deep learning",
                  "quantum computing",
                ]
            ).map((topic, i) => (
              <button
                key={topic}
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                onClick={() =>
                  navigate(`/general-finder?q=${encodeURIComponent(topic)}`)
                }
              >
                <span className="text-[10px] font-mono text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="capitalize">{topic}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="eyebrow mb-3">Personalised</p>
              <h2 className="display-lg text-4xl md:text-5xl">For you</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Personalized using your interests and preferred location.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuickPanelType("watchlist");
                  setQuickPanelOpen(true);
                }}
              >
                <Badge
                  variant="outline"
                  className="text-xs cursor-pointer hover:border-primary"
                >
                  <Bookmark className="h-3 w-3 mr-1" />
                  {watchlist.length} watchlist
                </Badge>
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuickPanelType("reminders");
                  setQuickReminderFilter("all");
                  setQuickPanelOpen(true);
                }}
              >
                <Badge
                  variant="outline"
                  className="text-xs cursor-pointer hover:border-primary"
                >
                  <Bell className="h-3 w-3 mr-1" />
                  {reminders.length} reminders
                </Badge>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {personalizedItems.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
                onClick={() => trackItemInteraction(item, "open")}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {item.kind}
                  </Badge>
                  {item.subtype && (
                    <span className="text-xs text-muted-foreground">
                      {item.subtype}
                    </span>
                  )}
                </div>
                <h3 className="font-medium text-sm text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {item.location ||
                    item.organization ||
                    item.sourceName ||
                    "Research update"}
                </p>
              </a>
            ))}
          </div>
        </section>

        {/* Journals + Opportunities side by side */}
        <section className="container mx-auto px-4 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-[28px] bg-card p-5 md:p-7">
              <div className="flex items-center justify-between mb-4">
                <h2 className="display-lg text-2xl md:text-3xl">
                  Latest Journals
                </h2>
                <Link to="/journals">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs h-8"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
              <div className="bg-background border border-border rounded-xl divide-y divide-border overflow-hidden">
                {journalsLoading
                  ? [...Array(5)].map((_, i) => (
                      <div key={i} className="px-4 py-3.5">
                        <div className="h-4 shimmer rounded w-3/4 mb-1.5" />
                        <div className="h-3 shimmer rounded w-1/3" />
                      </div>
                    ))
                  : featuredJournals.map((item: JournalMatchItem, index: number) => (
                      <a
                        key={`${item.title}-${index}`}
                        href={getJournalLink(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {getJournalSource(item)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[11px] flex-shrink-0">
                          journal
                        </Badge>
                      </a>
                    ))}
              </div>
            </div>

            <div className="rounded-[28px] bg-card p-5 md:p-7">
              <div className="flex items-center justify-between mb-4">
                <h2 className="display-lg text-2xl md:text-3xl">
                  Latest Opportunities
                </h2>
                <Link to="/project-calls">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs h-8"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
              <div className="bg-background border border-border rounded-xl divide-y divide-border overflow-hidden">
                {opportunitiesLoading
                  ? [...Array(5)].map((_, i) => (
                      <div key={i} className="px-4 py-3.5">
                        <div className="h-4 shimmer rounded w-3/4 mb-1.5" />
                        <div className="h-3 shimmer rounded w-1/3" />
                      </div>
                    ))
                  : featuredOpportunities.map((item: HarvestItem) => (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.organization ||
                              item.sourceName ||
                              "Research Opportunity"}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[11px] flex-shrink-0">
                          {item.subtype || "opportunity"}
                        </Badge>
                      </a>
                    ))}
              </div>
            </div>
          </div>
        </section>

        {/* Statement CTA */}
        <section className="container mx-auto px-4 pt-16">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <h2 className="display-xl text-5xl sm:text-6xl lg:text-[5.5rem]">
              One search.
              <br />
              <span className="lime-chip text-[0.8em]">Every</span> source.
            </h2>
            <div className="flex flex-wrap gap-3 md:pb-3">
              <Link to="/general-finder" className="pill-lime">
                Search everything <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/research-jobs" className="pill">
                Browse research jobs
              </Link>
            </div>
          </div>
        </section>
      </div>

      <Footer />
      {/* <AssistantWidget /> */}

      <Sheet open={quickPanelOpen} onOpenChange={setQuickPanelOpen}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>
              {quickPanelType === "watchlist" ? "Watchlist" : "Reminders"}
            </SheetTitle>
            <SheetDescription>
              Quick view and remove actions. Use User Hub for full management.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {quickPanelType === "watchlist" ? (
              watchlist.length ? (
                watchlist.map((item) => (
                  <div
                    key={item.id}
                    className="border border-border rounded-md p-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium line-clamp-2 hover:text-primary"
                      >
                        {item.title}
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          setWatchlist(removeWatchlistItem(item.id))
                        }
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-muted-foreground mt-1 capitalize">
                      {item.kind}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No watchlist items yet.
                </p>
              )
            ) : reminders.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={
                      quickReminderFilter === "all" ? "default" : "outline"
                    }
                    onClick={() => setQuickReminderFilter("all")}
                  >
                    All ({reminders.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      quickReminderFilter === "overdue" ? "default" : "outline"
                    }
                    onClick={() => setQuickReminderFilter("overdue")}
                  >
                    Overdue ({reminderCounts.overdue})
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      quickReminderFilter === "this-week"
                        ? "default"
                        : "outline"
                    }
                    onClick={() => setQuickReminderFilter("this-week")}
                  >
                    This week ({reminderCounts.thisWeek})
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      quickReminderFilter === "upcoming" ? "default" : "outline"
                    }
                    onClick={() => setQuickReminderFilter("upcoming")}
                  >
                    Upcoming
                  </Button>
                </div>

                {filteredReminderRows.map(({ item, status, dueText }) => (
                  <div
                    key={item.id}
                    className="border border-border rounded-md p-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium line-clamp-2 hover:text-primary"
                      >
                        {item.title}
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          setReminders(removeReminderByItemId(item.itemId))
                        }
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={
                          status.state === "overdue"
                            ? "destructive"
                            : status.state === "today"
                              ? "default"
                              : "secondary"
                        }
                        className="text-[10px] capitalize"
                      >
                        {status.state === "today" ? "today" : status.state}
                      </Badge>
                      <p className="text-muted-foreground">{dueText}</p>
                      <p className="text-muted-foreground">• {item.date}</p>
                    </div>
                  </div>
                ))}

                {filteredReminderRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No reminders match this filter.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No reminders set.</p>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setQuickPanelOpen(false);
                navigate("/user-hub");
              }}
            >
              Manage all in User Hub
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Index;
