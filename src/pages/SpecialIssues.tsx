import PageHeader from "@/components/PageHeader";
import {
  Bookmark,
  BookOpenText,
  ExternalLink,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import {
  getSpecialIssues,
  type SpecialIssueItem,
  type SpecialIssueSort,
} from "@/services/apiClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SAVED_SPECIAL_ISSUES_STORAGE_KEY = "researchsphere:saved-special-issues";
const ALL_SECONDARY_SUBJECTS = "all";
const ITEMS_PER_PAGE = 10;

const POPULAR_SEARCHES = [
  "Artificial Intelligence",
  "Machine Learning",
  "Computer Vision",
  "Natural Language Processing",
  "Cybersecurity",
  "Data Mining",
  "Cloud Computing",
  "Human-Computer Interaction",
];

const SORT_OPTIONS = [
  { value: "deadline", label: "Deadline" },
  { value: "impactFactor", label: "Impact Factor" },
  { value: "citeScore", label: "CiteScore" },
];

const readSavedSpecialIssues = () => {
  try {
    const raw = window.localStorage.getItem(SAVED_SPECIAL_ISSUES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

const writeSavedSpecialIssues = (ids: string[]) => {
  try {
    window.localStorage.setItem(
      SAVED_SPECIAL_ISSUES_STORAGE_KEY,
      JSON.stringify(ids),
    );
  } catch {
    // Storage can be unavailable (private mode); saving stays session-only.
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not listed";

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      )
    : new Date(value);

  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return "not yet scraped";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatMetric = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const deadlineNote = (item: SpecialIssueItem) => {
  if (item.daysUntilDeadline == null) return null;
  if (item.daysUntilDeadline < 0) return "Deadline passed";
  if (item.daysUntilDeadline === 0) return "Closes today";
  if (item.daysUntilDeadline === 1) return "Closes tomorrow";
  return `Closes in ${item.daysUntilDeadline} days`;
};

const SpecialIssues = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [secondarySubject, setSecondarySubject] = useState(
    ALL_SECONDARY_SUBJECTS,
  );
  const [sortBy, setSortBy] = useState<SpecialIssueSort>("deadline");
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [savedIssues, setSavedIssues] = useState<string[]>(
    readSavedSpecialIssues,
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedQuery, secondarySubject, sortBy, sortAsc]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["special-issues", debouncedQuery, secondarySubject, sortBy],
    queryFn: () =>
      getSpecialIssues({
        query: debouncedQuery,
        secondarySubject:
          secondarySubject === ALL_SECONDARY_SUBJECTS ? "" : secondarySubject,
        deadline: "",
        minImpactFactor: null,
        minCiteScore: null,
        sort: sortBy,
      }),
    staleTime: 1000 * 60 * 5,
    placeholderData: (previousData) => previousData,
  });

  const issues = useMemo(() => {
    const raw = data?.data ?? [];
    return sortAsc ? [...raw].reverse() : raw;
  }, [data?.data, sortAsc]);
  const meta = data?.meta;
  const secondaryOptions = meta?.secondarySubjectAreas ?? [];

  const totalPages = Math.max(1, Math.ceil(issues.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentIssues = issues.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const hasActiveFilters =
    debouncedQuery.trim().length > 0 ||
    secondarySubject !== ALL_SECONDARY_SUBJECTS;

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSecondarySubject(ALL_SECONDARY_SUBJECTS);
    setSortBy("deadline");
    setSortAsc(false);
    setCurrentPage(1);
  };

  const toggleSavedIssue = (id: string) => {
    setSavedIssues((current) => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      writeSavedSpecialIssues(next);
      return next;
    });
  };

  const resultsLabel = useMemo(() => {
    if (isLoading) return "Finding special issues...";
    if (issues.length === 0) return "Showing 0 of 0 results";
    return `Showing ${startIndex + 1}-${Math.min(
      startIndex + currentIssues.length,
      issues.length,
    )} of ${issues.length} results`;
  }, [currentIssues.length, isLoading, issues.length, startIndex]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />

      <div className="flex-1">
        <div className="container mx-auto max-w-[1380px] px-5 py-8 md:px-6 md:py-10">
          <PageHeader
            icon={Sparkles}
            eyebrow="Call for special issues"
            title="special issues"
            description="Browse open guest-edited volumes across ScienceDirect journals — each listing includes submission deadlines, impact factor, CiteScore, and guest editor details."
          />

          {/* Search panel styled like the journals page */}
          <section className="space-y-3">
            <div className="overflow-hidden rounded-[28px] bg-card/60">
              <div className="p-6 md:p-8">
                <div className="rounded-2xl border border-border bg-background p-4 md:p-5">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-foreground">
                        Search by keywords, guest editors & journal titles
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        placeholder="Try federated learning, edge computing, cybersecurity..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="h-14 rounded-xl pl-12 text-[15px] md:text-base shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        aria-label="Search special issues"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr_auto] gap-3">
                      <Select
                        value={sortBy}
                        onValueChange={(value) =>
                          setSortBy(value as SpecialIssueSort)
                        }
                      >
                        <SelectTrigger
                          className="h-12 rounded-xl min-w-[200px]"
                          aria-label="Sort by"
                        >
                          <SelectValue placeholder="Sort by deadline" />
                        </SelectTrigger>
                        <SelectContent>
                          {SORT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={secondarySubject}
                        onValueChange={setSecondarySubject}
                      >
                        <SelectTrigger
                          className="h-12 rounded-xl min-w-[220px]"
                          aria-label="Secondary subject area"
                        >
                          <SelectValue placeholder="All secondary subject areas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL_SECONDARY_SUBJECTS}>
                            All secondary subject areas
                          </SelectItem>
                          {secondaryOptions.map((subject) => (
                            <SelectItem key={subject} value={subject}>
                              {subject}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        className="h-12 rounded-xl px-7 bg-[#3B6FB6] hover:bg-[#335F9C] text-white dark:bg-[#7FA6DB] dark:hover:bg-[#9DBBE6] dark:text-[#0B1320] font-semibold text-sm sm:text-base shadow-sm"
                      >
                        <Sparkles className="h-4 w-4" />
                        Find special issues
                      </Button>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground mb-3">
                        Popular searches
                      </p>
                      <div className="flex gap-2.5 overflow-x-auto whitespace-nowrap pb-1 pr-1 custom-scrollbar">
                        {POPULAR_SEARCHES.map((topic) => (
                          <Badge
                            key={topic}
                            variant="outline"
                            className="cursor-pointer rounded-full px-3.5 py-2 text-xs shrink-0"
                            onClick={() => {
                              setSearchQuery(topic);
                              setDebouncedQuery(topic);
                              setCurrentPage(1);
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
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="shrink-0 whitespace-nowrap text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}
          </section>

          <div className="mt-10 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {resultsLabel}
              {isFetching && !isLoading && (
                <span className="ml-3 text-sm font-normal text-muted-foreground">
                  Updating...
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              Last updated{" "}
              <span className="font-medium text-foreground">
                {formatUpdatedAt(meta?.scrapedAt)}
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <Card
                  key={item}
                  className="rounded-[24px] border border-border shadow-sm"
                >
                  <CardContent className="p-6 md:p-7">
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="space-y-4">
                        <Skeleton className="h-5 w-1/4" />
                        <Skeleton className="h-9 w-4/5" />
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-14 w-40" />
                      </div>
                      <div className="space-y-3 border-l border-border pl-6">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-8 w-40" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-11 w-full rounded-xl" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-3xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center text-destructive">
              Failed to load special issues. Please try again.
            </div>
          ) : currentIssues.length === 0 ? (
            <div className="rounded-3xl border border-border bg-card px-6 py-12 text-center">
              <h2 className="text-xl font-semibold text-foreground">
                {meta?.total === 0
                  ? "No special issues available yet"
                  : "No special issues match your filters"}
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {meta?.total === 0
                  ? "The ScienceDirect dataset is refreshed manually, so it may not have been collected yet. Check back soon."
                  : "Try a broader keyword or loosen one of the filters."}
              </p>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearFilters}
                  className="mt-5 rounded-full"
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {currentIssues.map((issue) => {
                const isSaved = savedIssues.includes(issue.id);
                const impactFactor = formatMetric(issue.impactFactor);
                const citeScore = formatMetric(issue.citeScore);
                const note = deadlineNote(issue);
                const isClosingSoon = issue.status === "closing-soon";
                const secondaryAreas = issue.secondarySubjectAreas ?? [];

                return (
                  <Card
                    key={issue.id}
                    className="rounded-[24px] border border-border shadow-sm transition-colors hover:border-primary/50"
                  >
                    <CardContent className="p-6 md:p-7">
                      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="min-w-0 space-y-4">
                          {secondaryAreas.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              {secondaryAreas.slice(0, 3).map((subject) => (
                                <Badge
                                  key={subject}
                                  variant="outline"
                                  className="rounded-full border-border/70 px-2.5 py-0.5 text-[11px] font-normal text-muted-foreground"
                                >
                                  {subject}
                                </Badge>
                              ))}
                              {secondaryAreas.length > 3 && (
                                <span className="text-[11px] text-muted-foreground">
                                  +{secondaryAreas.length - 3} more
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-start gap-4">
                            <h2 className="min-w-0 flex-1 text-[1.4rem] font-semibold leading-[1.4] tracking-normal text-foreground">
                              <a
                                href={issue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline-offset-4 transition-colors hover:text-primary hover:underline"
                              >
                                {issue.title}
                              </a>
                            </h2>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-pressed={isSaved}
                              aria-label={
                                isSaved
                                  ? `Remove ${issue.title} from saved special issues`
                                  : `Save ${issue.title}`
                              }
                              title={
                                isSaved
                                  ? "Saved to your list"
                                  : "Save special issue"
                              }
                              onClick={() => toggleSavedIssue(issue.id)}
                              className="-mr-2 -mt-1 h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5"
                            >
                              <Bookmark
                                className={cn(
                                  isSaved && "fill-primary text-primary",
                                )}
                              />
                            </Button>
                          </div>

                          <div className="space-y-2 text-[15px] leading-6 text-muted-foreground">
                            <div className="flex items-start gap-2">
                              <Users className="mt-1 h-4 w-4 shrink-0" />
                              <span>
                                <span className="font-medium text-foreground">
                                  Guest editors:
                                </span>{" "}
                                {issue.guestEditors.length > 0
                                  ? issue.guestEditors.join(", ")
                                  : "Not listed"}
                              </span>
                            </div>

                            <div className="flex items-start gap-2">
                              <BookOpenText className="mt-1 h-4 w-4 shrink-0" />
                              <span>
                                <span className="font-medium text-foreground">
                                  Journal:
                                </span>{" "}
                                {issue.journalName ? (
                                  issue.journalUrl ? (
                                    <a
                                      href={issue.journalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                                    >
                                      {issue.journalName}
                                    </a>
                                  ) : (
                                    issue.journalName
                                  )
                                ) : (
                                  "Not listed"
                                )}
                              </span>
                            </div>
                          </div>

                          {(impactFactor || citeScore) && (
                            <div className="flex items-stretch gap-6 pt-1">
                              {impactFactor && (
                                <div>
                                  <div className="text-[13px] text-muted-foreground">
                                    Impact factor
                                  </div>
                                  <div className="mt-1 text-lg font-semibold text-foreground">
                                    {impactFactor}
                                  </div>
                                </div>
                              )}

                              {impactFactor && citeScore && (
                                <div className="w-px bg-border" />
                              )}

                              {citeScore && (
                                <div>
                                  <div className="text-[13px] text-muted-foreground">
                                    CiteScore
                                  </div>
                                  <div className="mt-1 text-lg font-semibold text-foreground">
                                    {citeScore}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-4 border-l border-border pl-6">
                          <div>
                            <div className="text-sm text-muted-foreground">
                              Submission deadline
                            </div>
                            <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                              {formatDate(issue.submissionDeadline)}
                            </div>

                            {note && (
                              <div
                                className={cn(
                                  "mt-2 flex flex-wrap items-center gap-2 text-sm",
                                  isClosingSoon
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground",
                                )}
                              >
                                <span
                                  className={
                                    isClosingSoon ? "font-medium" : undefined
                                  }
                                >
                                  {note}
                                </span>
                                {isClosingSoon && (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                                  >
                                    Closing soon
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>

                          <Button
                            asChild
                            className="h-11 w-full rounded-xl bg-[#3B6FB6] hover:bg-[#335F9C] text-white dark:bg-[#7FA6DB] dark:hover:bg-[#9DBBE6] dark:text-[#0B1320]"
                          >
                            <a
                              href={issue.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View special issue
                              <ExternalLink className="ml-2 h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((previous) => Math.max(1, previous - 1))
                    }
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>

                  <div className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((previous) =>
                        Math.min(totalPages, previous + 1),
                      )
                    }
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default SpecialIssues;
