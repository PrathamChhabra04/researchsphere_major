import PageHeader from "@/components/PageHeader";
import { BookOpenText as BookOpenText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  ExternalLink,
  Search,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { matchJournals, type JournalMatchItem } from "@/services/apiClient";
import { cn } from "@/lib/utils";
import { trackSearchInteraction } from "@/lib/personalization";

const DEFAULT_KEYWORD_QUERY = "";
const DEFAULT_MIXED_QUERY = "computer science";
const DEFAULT_ABSTRACT_QUERY =
  "We propose a federated learning framework for edge-cloud environments that reduces communication cost while preserving model accuracy for distributed computer vision workloads.";
const ALWAYS_VISIBLE_POPULAR_TOPIC = "machine learning";
const SAVED_JOURNALS_STORAGE_KEY = "researchsphere:saved-journals";

const PROVIDER_LABELS: Record<string, string> = {
  elsevier: "Elsevier",
  springer: "Springer",
  ieee: "IEEE",
};

const providerLabel = (provider?: string | null) => {
  if (!provider) return "Publisher";
  return PROVIDER_LABELS[String(provider).toLowerCase()] || String(provider);
};

const journalCardKey = (journal: JournalMatchItem) =>
  `${journal.provider}-${journal.issn || journal.title}`;

/** "1 day", "5 days" — avoids the "1 days" bug. */
const formatDays = (value: number) =>
  `${value} ${value === 1 ? "day" : "days"}`;


const formatMetric = (value?: number | null) => {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
};

const formatFee = (amount?: number | null, currency?: string | null) => {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const numeric = Number(amount);
  const code = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${code} ${numeric.toLocaleString("en-US")}`;
  }
};

const accessCategory = (journal: JournalMatchItem) => {
  const tokens = [
    journal.openAccessType,
    journal.publishingModel,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).toLowerCase().split(/[\s_-]+/))
    .filter(Boolean);

  if (!tokens.length || tokens.every((token) => token === "none")) return null;

  // Publishers report the same model in different vocabularies: Elsevier uses
  // FULL/SUBSIDISED, Springer uses "Open access"/Hybrid. Normalise to the three
  // sentence-case labels the card shows.
  if (tokens.some((token) => token.startsWith("subscri"))) {
    return { label: "Subscription", open: false };
  }
  if (tokens.some((token) => token.startsWith("hybrid"))) {
    return { label: "Hybrid", open: false };
  }
  if (
    tokens.some(
      (token) =>
        token.startsWith("open") ||
        token.startsWith("subsid") ||
        token === "gold" ||
        token === "full" ||
        token === "oa" ||
        token === "free",
    )
  ) {
    return { label: "Open access", open: true };
  }

  return null;
};

const journalUrlFor = (journal: JournalMatchItem) =>
  journal.journalUrl ||
  journal.sourceUrl ||
  journal.guideForAuthors ||
  journal.submissionLink ||
  null;

const submitUrlFor = (journal: JournalMatchItem) => {
  const submit = journal.submissionLink || journal.guideForAuthors || null;
  return submit && submit !== journalUrlFor(journal) ? submit : null;
};

type JournalMetricItem = {
  label: string;
  value: string;
};

const JournalMetric = ({ label, value }: JournalMetricItem) => (
  <div className="min-w-0">
    <p className="text-sm leading-snug text-muted-foreground">{label}</p>
    <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">
      {value}
    </p>
  </div>
);

const compactJournalMetrics = (items: Array<JournalMetricItem | null>) =>
  items.filter((item): item is JournalMetricItem => item != null);

/**
 * Deterministic generated cover used when a journal has no artwork.
 * Muted, print-like tones; the pattern is pure CSS
 * so it renders identically in light and dark mode.
 */
const COVER_THEMES = [
  { bg: "#2e3a4b", fg: "#eef2f7", line: "rgba(232, 239, 248, 0.16)", accent: "#b9c9dd" },
  { bg: "#1f3f3a", fg: "#e9f4f0", line: "rgba(226, 244, 238, 0.15)", accent: "#9dc9bb" },
  { bg: "#432b32", fg: "#f6ebee", line: "rgba(246, 233, 237, 0.14)", accent: "#d3a8b5" },
  { bg: "#3d3227", fg: "#f4eee6", line: "rgba(244, 236, 224, 0.15)", accent: "#cdb697" },
  { bg: "#25332c", fg: "#ecf2ee", line: "rgba(232, 242, 236, 0.15)", accent: "#a9c4b1" },
  { bg: "#3B6FB6", fg: "#ffffff", line: "rgba(255, 255, 255, 0.2)", accent: "#E9F0FA" },
  { bg: "#262c4a", fg: "#eceef8", line: "rgba(234, 237, 249, 0.15)", accent: "#b2bade" },
  { bg: "#33404a", fg: "#edf2f5", line: "rgba(235, 242, 246, 0.14)", accent: "#adc2cd" },
];

const hashString = (value?: string | null) => {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const GeneratedCover = ({
  title,
  publisher,
}: {
  title: string;
  publisher: string;
}) => {
  const theme = COVER_THEMES[hashString(title) % COVER_THEMES.length];

  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full flex-col justify-between overflow-hidden p-2 sm:p-2.5"
      style={{
        backgroundColor: theme.bg,
        color: theme.fg,
        backgroundImage: `radial-gradient(120% 90% at 16% 6%, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 55%), repeating-linear-gradient(135deg, ${theme.line} 0px, ${theme.line} 1px, transparent 1px, transparent 9px)`,
      }}
    >
      <span className="text-[0.5rem] font-semibold uppercase leading-tight tracking-[0.14em] opacity-85 sm:text-[0.5625rem]">
        {publisher}
      </span>
      <div className="min-w-0">
        <span
          className="mb-1.5 block h-px w-6"
          style={{ backgroundColor: theme.accent }}
        />
        <span className="line-clamp-4 block font-serif text-[0.625rem] leading-[1.2] sm:text-xs">
          {title}
        </span>
      </div>
    </div>
  );
};

const readSavedJournals = () => {
  try {
    const raw = window.localStorage.getItem(SAVED_JOURNALS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

const writeSavedJournals = (keys: string[]) => {
  try {
    window.localStorage.setItem(
      SAVED_JOURNALS_STORAGE_KEY,
      JSON.stringify(keys),
    );
  } catch {
    // Storage may be unavailable (private mode); saving stays session-only.
  }
};

const Journals = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const [searchMode, setSearchMode] = useState<"keyword" | "abstract">(
    "keyword",
  );
  const [keywordQuery, setKeywordQuery] = useState(
    initialQuery || DEFAULT_KEYWORD_QUERY,
  );
  const [abstractQuery, setAbstractQuery] = useState(DEFAULT_ABSTRACT_QUERY);
  const [submittedQuery, setSubmittedQuery] = useState(
    initialQuery || DEFAULT_MIXED_QUERY,
  );
  const [providerFilter, setProviderFilter] = useState<
    "all" | "springer" | "elsevier" | "ieee"
  >("all");
  const [sortBy, setSortBy] = useState("score");
  const [currentPage, setCurrentPage] = useState(1);
  const [savedJournals, setSavedJournals] = useState<string[]>(readSavedJournals);
  const itemsPerPage = 10;

  const toggleSavedJournal = (key: string) => {
    setSavedJournals((current) => {
      const next = current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key];
      writeSavedJournals(next);
      return next;
    });
  };

  const activeQuery = searchMode === "abstract" ? abstractQuery : keywordQuery;
  const dynamicMatchLimit = useMemo(() => {
    if (searchMode === "abstract") return 70;
    if (providerFilter !== "all") return 90;
    return 120;
  }, [searchMode, providerFilter]);

  useEffect(() => {
    setSubmittedQuery(activeQuery.trim() || DEFAULT_MIXED_QUERY);
    setCurrentPage(1);
  }, [searchMode]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "journal-match",
      submittedQuery,
      searchMode,
      providerFilter,
      dynamicMatchLimit,
    ],
    queryFn: () =>
      matchJournals({
        query: submittedQuery,
        mode: searchMode,
        provider: providerFilter,
        limit: dynamicMatchLimit,
      }),
    enabled: Boolean(submittedQuery.trim()),
    staleTime: 1000 * 60 * 5,
  });

  const journals = data?.data ?? [];
  const topics = data?.meta?.topics ?? [];
  const popularSearchTopics = useMemo(() => {
    const filtered = topics.filter(
      (topic) =>
        !["federated learning", "distributed systems"].includes(
          topic.toLowerCase(),
        ),
    );

    return filtered
      .filter((topic) => topic.toLowerCase() !== ALWAYS_VISIBLE_POPULAR_TOPIC)
      .slice(0, 7);
  }, [topics]);

  const processedJournals = useMemo(() => {
    const sorted = [...journals];

    sorted.sort((left, right) => {
      if (sortBy === "impact") {
        return (right.impactFactor || 0) - (left.impactFactor || 0);
      }
      if (sortBy === "decision") {
        const leftValue = left.decisionDays ?? Number.MAX_SAFE_INTEGER;
        const rightValue = right.decisionDays ?? Number.MAX_SAFE_INTEGER;
        return leftValue - rightValue;
      }
      if (sortBy === "title") {
        return left.title.localeCompare(right.title);
      }
      return (right.score || 0) - (left.score || 0);
    });

    return sorted;
  }, [journals, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [submittedQuery, searchMode, providerFilter, sortBy]);

  const totalPages = Math.ceil(processedJournals.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentJournals = processedJournals.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  const runSearch = () => {
    const normalized = activeQuery.trim() || DEFAULT_MIXED_QUERY;
    setSubmittedQuery(normalized);
    if (normalized.length >= 3) {
      trackSearchInteraction(normalized, "journal");
    }
    setCurrentPage(1);
  };

  const openLink = (url?: string | null) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />

      <div className="flex-1">
        <div className="container mx-auto max-w-[1380px] px-5 py-8 md:px-6 md:py-10">
          <PageHeader
            icon={BookOpenText}
            eyebrow="Journal finder"
            title="Find your journal"
            accent={undefined}
            description="Search by keyword, or paste an abstract to surface Springer, Elsevier and IEEE journals with strong topical fit and submission-ready details."
          />
          <section className="overflow-hidden rounded-[28px] bg-card/60">
            <div className="p-6 md:p-8">
              <div className="rounded-2xl border border-border bg-background p-4 md:p-5">
                <div className="flex flex-col gap-3 md:gap-4">
                  <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-4 md:gap-8">
                    <button
                      type="button"
                      onClick={() => setSearchMode("abstract")}
                      className="inline-flex items-center gap-3 text-left py-1"
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                          searchMode === "abstract"
                            ? "border-primary text-primary"
                            : "border-border text-transparent"
                        }`}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-full ${
                            searchMode === "abstract"
                              ? "bg-primary"
                              : "bg-transparent"
                          }`}
                        />
                      </span>
                      <span className="text-base font-medium text-foreground md:text-lg">
                        Match my abstract
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSearchMode("keyword")}
                      className="inline-flex items-center gap-3 text-left py-1"
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                          searchMode === "keyword"
                            ? "border-primary text-primary"
                            : "border-border text-transparent"
                        }`}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-full ${
                            searchMode === "keyword"
                              ? "bg-primary"
                              : "bg-transparent"
                          }`}
                        />
                      </span>
                      <span className="text-base font-medium text-foreground md:text-lg">
                        Search by keywords, aims &amp; scope, journal title,
                        etc...
                      </span>
                    </button>
                  </div>

                  {searchMode === "keyword" ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          placeholder="Try machine learning, cloud computing, blockchain, cybersecurity..."
                          value={keywordQuery}
                          onChange={(event) =>
                            setKeywordQuery(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") runSearch();
                          }}
                          className="h-14 rounded-xl pl-12 text-[15px] md:text-base"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Textarea
                        value={abstractQuery}
                        onChange={(event) =>
                          setAbstractQuery(event.target.value)
                        }
                        placeholder="Paste your abstract and we’ll rank the journals most aligned with your manuscript."
                        className="min-h-[170px] rounded-xl text-[15px] md:text-base"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1.1fr_auto] gap-3 mt-4">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder="Sort results" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="score">Relevance</SelectItem>
                        <SelectItem value="impact">Impact factor</SelectItem>
                        <SelectItem value="decision">
                          Editorial speed
                        </SelectItem>
                        <SelectItem value="title">Journal name</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={providerFilter}
                      onValueChange={(
                        value: "all" | "springer" | "elsevier" | "ieee",
                      ) => setProviderFilter(value)}
                    >
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder="All publishers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All publishers</SelectItem>
                        <SelectItem value="springer">Springer</SelectItem>
                        <SelectItem value="elsevier">Elsevier</SelectItem>
                        <SelectItem value="ieee">IEEE</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={runSearch}
                      size="lg"
                      className="h-12 rounded-xl px-7"
                    >
                      <Sparkles className="h-4 w-4" />
                      Find journals
                    </Button>
                  </div>

                  <div className="mt-5">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
                      Popular searches
                    </p>
                    <div className="flex gap-2.5 overflow-x-auto whitespace-nowrap pb-1 pr-1 custom-scrollbar">
                      <Badge
                        variant="outline"
                        className="cursor-pointer rounded-full px-3.5 py-2 text-xs shrink-0"
                        onClick={() => {
                          setSearchMode("keyword");
                          setKeywordQuery(ALWAYS_VISIBLE_POPULAR_TOPIC);
                          setSubmittedQuery(ALWAYS_VISIBLE_POPULAR_TOPIC);
                        }}
                      >
                        {ALWAYS_VISIBLE_POPULAR_TOPIC}
                      </Badge>
                      {popularSearchTopics.map((topic) => (
                        <Badge
                          key={topic}
                          variant="outline"
                          className="cursor-pointer rounded-full px-3.5 py-2 text-xs shrink-0"
                          onClick={() => {
                            setSearchMode("keyword");
                            setKeywordQuery(topic);
                            setSubmittedQuery(topic);
                          }}
                        >
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-8 mb-5 flex items-center justify-between gap-4 border-b border-border pb-4">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {isLoading || isFetching
                ? "Finding journals..."
                : `Showing ${startIndex + 1}-${Math.min(
                    startIndex + currentJournals.length,
                    processedJournals.length,
                  )} of ${processedJournals.length} results`}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-5">
              {[...Array(6)].map((_, index) => (
                <Card key={index} className="overflow-hidden rounded-2xl">
                  <CardContent className="p-6">
                    <div className="h-8 shimmer rounded mb-4"></div>
                    <div className="h-5 shimmer rounded mb-3 w-2/3"></div>
                    <div className="h-5 shimmer rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : currentJournals.length === 0 ? (
            <div className="text-center py-20">
              <h3 className="text-2xl font-bold mb-2">No journals found</h3>
              <p className="text-muted-foreground mb-6">
                Try a broader topic or a more descriptive abstract.
              </p>
              <Button
                onClick={() => {
                  setSearchMode("keyword");
                  setKeywordQuery("");
                  setSubmittedQuery(DEFAULT_MIXED_QUERY);
                }}
              >
                Try "{DEFAULT_MIXED_QUERY}"
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-5">
                {currentJournals.map((journal: JournalMatchItem) => {
                  const cardKey = journalCardKey(journal);
                  const isSaved = savedJournals.includes(cardKey);
                  const journalUrl = journalUrlFor(journal);
                  const submitUrl = submitUrlFor(journal);
                  const access = accessCategory(journal);
                  const subjectAreas = journal.subjectAreas || [];
                  const apc = formatFee(
                    journal.goldOpenAccessFee,
                    journal.goldOpenAccessCurrency,
                  );
                  const impactFactor = formatMetric(journal.impactFactor);
                  const citeScore = formatMetric(journal.citeScore);
                  const metrics = compactJournalMetrics([
                    impactFactor
                      ? { label: "Impact factor", value: impactFactor }
                      : null,
                    citeScore
                      ? { label: "CiteScore", value: citeScore }
                      : null,
                    journal.decisionDays != null
                      ? {
                          label: "First decision",
                          value: formatDays(journal.decisionDays),
                        }
                      : null,
                  ]);
                  const metaParts = [
                    journal.acronym,
                    journal.issn ? `ISSN ${journal.issn}` : null,
                  ].filter(Boolean);
                  const panelDetailCount =
                    (access ? 1 : 0) +
                    (apc ? 1 : 0) +
                    (journal.acceptanceDays != null ? 1 : 0);

                  return (
                    <Card
                      key={cardKey}
                      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-colors duration-200 hover:border-foreground/20 lg:min-h-[20rem]"
                    >
                      <CardContent className="p-7 md:p-8">
                        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
                          <div className="min-w-0">
                            <div className="flex gap-5 sm:gap-6">
                              <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg border border-border sm:h-36 sm:w-28">
                                <GeneratedCover
                                  title={journal.title}
                                  publisher={providerLabel(journal.provider)}
                                />
                                {journal.coverImage && (
                                  <img
                                    src={journal.coverImage}
                                    alt={`Cover of ${journal.title}`}
                                    loading="lazy"
                                    className="absolute inset-0 h-full w-full object-cover"
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-muted-foreground">
                                  {providerLabel(journal.provider)}
                                </p>
                                <div className="mt-1 flex items-start gap-2">
                                  <h3 className="min-w-0 flex-1 text-balance text-2xl font-semibold leading-snug text-foreground sm:text-3xl sm:leading-tight">
                                    {journal.title}
                                  </h3>

                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-pressed={isSaved}
                                    aria-label={
                                      isSaved
                                        ? `Remove ${journal.title} from saved journals`
                                        : `Save ${journal.title}`
                                    }
                                    title={
                                      isSaved
                                        ? "Saved to your list"
                                        : "Save journal"
                                    }
                                    onClick={() => toggleSavedJournal(cardKey)}
                                    className="-mr-2 -mt-1 h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5"
                                  >
                                    <Bookmark
                                      className={cn(
                                        isSaved && "fill-primary text-primary",
                                      )}
                                    />
                                  </Button>
                                </div>

                                {metaParts.length > 0 && (
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    {metaParts.join(" · ")}
                                  </p>
                                )}
                              </div>
                            </div>

                            {metrics.length > 0 && (
                              <div className="mt-7 flex items-stretch">
                                {metrics.map((metric, index) => (
                                  <div
                                    key={metric.label}
                                    className={cn(
                                      "min-w-0 flex-1 px-4 first:pl-0 last:pr-0 sm:px-6",
                                      index > 0 && "border-l border-border",
                                    )}
                                  >
                                    <JournalMetric {...metric} />
                                  </div>
                                ))}
                              </div>
                            )}

                            {subjectAreas.length > 0 && (
                              <div className="mt-6 flex flex-wrap gap-2">
                                {subjectAreas.slice(0, 4).map((subject) => (
                                  <span
                                    key={subject}
                                    className="rounded-md border border-border/70 px-2.5 py-1 text-sm text-muted-foreground"
                                  >
                                    {subject}
                                  </span>
                                ))}
                                {subjectAreas.length > 4 && (
                                  <span className="rounded-md border border-transparent px-2.5 py-1 text-sm text-muted-foreground">
                                    +{subjectAreas.length - 4} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-6 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
                            <div className="space-y-4">
                              {access && (
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    Access
                                  </p>
                                  <div className="mt-2">
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium text-foreground",
                                        access.open
                                          ? "border-primary/40 bg-[#E9F0FA] dark:bg-[#22344D] text-[#2F5D9E] dark:text-[#9DBBE6]"
                                          : "border-border bg-muted/40",
                                      )}
                                    >
                                      <span
                                        aria-hidden="true"
                                        className={cn(
                                          "h-2 w-2 rounded-full",
                                          access.open
                                            ? "bg-primary"
                                            : "bg-muted-foreground",
                                        )}
                                      />
                                      {access.label}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {apc && (
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    APC
                                  </p>
                                  <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                                    {apc}
                                  </p>
                                </div>
                              )}

                              {journal.acceptanceDays != null && (
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    Time to acceptance
                                  </p>
                                  <p className="mt-1 text-base font-semibold text-foreground">
                                    {formatDays(journal.acceptanceDays)}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div
                              className={cn(
                                "space-y-3",
                                panelDetailCount >= 3 && "mt-auto",
                              )}
                            >
                              {journalUrl && (
                                <Button
                                  type="button"
                                  size="lg"
                                  onClick={() => openLink(journalUrl)}
                                  className="h-12 w-full rounded-xl bg-[#3B6FB6] hover:bg-[#335F9C] text-white dark:bg-[#7FA6DB] dark:hover:bg-[#9DBBE6] dark:text-[#0B1320] text-base font-semibold"
                                >
                                  View journal
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}

                              {submitUrl && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="lg"
                                  onClick={() => openLink(submitUrl)}
                                  className="h-12 w-full rounded-xl text-base hover:bg-muted hover:text-foreground"
                                >
                                  Submit paper
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-12">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((page) => page - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>

                  {Array.from(
                    { length: Math.min(totalPages, 5) },
                    (_, index) => {
                      let page = index + 1;
                      if (totalPages > 5) {
                        if (currentPage <= 3) page = index + 1;
                        else if (currentPage >= totalPages - 2) {
                          page = totalPages - 4 + index;
                        } else {
                          page = currentPage - 2 + index;
                        }
                      }

                      return (
                        <Button
                          key={page}
                          variant={page === currentPage ? "default" : "outline"}
                          className="w-10"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      );
                    },
                  )}

                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((page) => page + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Journals;
