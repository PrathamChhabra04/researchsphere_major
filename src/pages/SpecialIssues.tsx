import PageHeader from "@/components/PageHeader";
import {
  ArrowUpRight,
  Bookmark,
  BookOpenText,
  Calendar,
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
import { getSpecialIssues, type SpecialIssueItem } from "@/services/apiClient";
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

const SAVED_SPECIAL_ISSUES_STORAGE_KEY =
  "researchsphere:saved-special-issues";
const ALL_SECONDARY_SUBJECTS = "all";
const ITEMS_PER_PAGE = 10;

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

  // Deadline values are calendar dates (YYYY-MM-DD). Build them in local time
  // so a date-only string does not shift a day in negative UTC offsets.
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
  if (item.status !== "closing-soon" || item.daysUntilDeadline == null) {
    return null;
  }
  if (item.daysUntilDeadline <= 0) return "Closes today";
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
  }, [debouncedQuery, secondarySubject]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["special-issues", debouncedQuery, secondarySubject],
    queryFn: () =>
      getSpecialIssues({
        query: debouncedQuery,
        secondarySubject:
          secondarySubject === ALL_SECONDARY_SUBJECTS ? "" : secondarySubject,
      }),
    staleTime: 1000 * 60 * 5,
    placeholderData: (previousData) => previousData,
  });

  const issues = data?.data ?? [];
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
            title="Calls for special issues"
            accent={meta?.total ? `${meta.total} live` : undefined}
            description="Guest-edited special issues in computer science, collected from ScienceDirect journals with guest editors, metrics and submission deadlines."
          />

          <section className="overflow-hidden rounded-[28px] bg-card/60">
            <div className="p-6 md:p-8">
              <div className="rounded-2xl border border-border bg-background p-4 md:p-5">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Try federated learning, edge computing, cybersecurity..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="h-14 rounded-xl pl-12 text-[15px] md:text-base"
                      aria-label="Search special issues"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <Select
                      value={secondarySubject}
                      onValueChange={setSecondarySubject}
                    >
                      <SelectTrigger
                        className="h-12 rounded-xl"
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

                    <div className="flex h-12 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Primary subject:{" "}
                      <span className="font-medium text-foreground">
                        {meta?.subjectArea || "Computer Science"}
                      </span>
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="rounded-full text-muted-foreground hover:text-foreground"
                      >
                        Clear filters
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="mt-8 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
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
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                      <div className="space-y-4">
                        <Skeleton className="h-6 w-1/3" />
                        <Skeleton className="h-9 w-4/5" />
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-5 w-1/2" />
                      </div>
                      <Skeleton className="h-44 rounded-3xl" />
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
                  : "Try a broader keyword or choose a different secondary subject area."}
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
                const secondaryAreas = issue.secondarySubjectAreas ?? [];

                return (
                  <Card
                    key={issue.id}
                    className="rounded-[24px] border border-border shadow-sm transition-shadow duration-200 hover:shadow-md"
                  >
                    <CardContent className="p-6 md:p-7">
                      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="min-w-0 space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="rounded-full px-3 py-1 text-xs font-medium"
                            >
                              {issue.subjectArea}
                            </Badge>
                            {issue.status === "closing-soon" && (
                              <Badge
                                variant="secondary"
                                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400"
                              >
                                Closing soon
                              </Badge>
                            )}
                            {secondaryAreas.slice(0, 2).map((subject) => (
                              <Badge
                                key={subject}
                                variant="outline"
                                className="rounded-full px-3 py-1 text-xs font-medium"
                              >
                                {subject}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-start gap-3">
                            <h2 className="min-w-0 flex-1 text-[1.45rem] font-semibold leading-snug tracking-tight text-foreground">
                              <a
                                href={issue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-start gap-2 transition-colors hover:text-primary"
                              >
                                <span>{issue.title}</span>
                                <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
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

                          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
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
                            <div className="flex flex-wrap items-center gap-2">
                              {impactFactor && (
                                <span className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                                  Impact factor{" "}
                                  <span className="font-semibold text-foreground">
                                    {impactFactor}
                                  </span>
                                </span>
                              )}
                              {citeScore && (
                                <span className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                                  CiteScore{" "}
                                  <span className="font-semibold text-foreground">
                                    {citeScore}
                                  </span>
                                </span>
                              )}
                            </div>
                          )}

                          {secondaryAreas.length > 2 && (
                            <div className="flex flex-wrap gap-2">
                              {secondaryAreas.slice(2, 6).map((subject) => (
                                <span
                                  key={subject}
                                  className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
                                >
                                  {subject}
                                </span>
                              ))}
                              {secondaryAreas.length > 6 && (
                                <span className="rounded-md border border-transparent px-2.5 py-1 text-xs text-muted-foreground">
                                  +{secondaryAreas.length - 6} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col justify-between gap-5 rounded-[28px] border border-border bg-muted/50 px-5 py-5">
                          <div>
                            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                              Submission deadline
                            </div>
                            <div className="mt-2 inline-flex items-center gap-2 text-lg font-semibold text-foreground">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {formatDate(issue.submissionDeadline)}
                            </div>
                            {note && (
                              <p className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                                {note}
                              </p>
                            )}
                          </div>

                          <Button
                            asChild
                            className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
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
