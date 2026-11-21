import PageHeader from "@/components/PageHeader";
import { Presentation } from "lucide-react";
import ConferenceMilestones from "@/components/ConferenceMilestones";
import DeadlineStatusBadge from "@/components/DeadlineStatusBadge";
import { compareByDeadline, itemTimestamp } from "@/lib/itemDates";
import { useState, useEffect, useMemo } from "react";
import {
  Search,
  MapPin,
  Calendar,
  ExternalLink,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import {
  searchHarvestedDataWithMeta,
  type HarvestItem,
} from "@/services/apiClient";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { trackSearchInteraction } from "@/lib/personalization";
import { useSearchParams } from "react-router-dom";

const getCountryFromLocation = (location?: string | null) => {
  if (!location) return "Unknown";
  const normalized = String(location).trim();
  if (!normalized) return "Unknown";
  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
};

const Conferences = () => {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [locationFilter, setLocationFilter] = useState("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [sortBy, setSortBy] = useState("upcoming");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data: searchResult,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["conferences", debouncedQuery, publisherFilter],
    queryFn: () =>
      searchHarvestedDataWithMeta({
        kind: "conference",
        query: debouncedQuery,
        includePast: false,
        publisher: publisherFilter === "all" ? undefined : publisherFilter,
        limit: 500,
      }),
    staleTime: 1000 * 60 * 10,
    placeholderData: (previousData) => previousData,
  });

  const conferences = useMemo(() => searchResult?.data ?? [], [searchResult]);
  const publisherFacets = useMemo(
    () => searchResult?.meta?.facets?.publishers ?? [],
    [searchResult],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedQuery, locationFilter, publisherFilter, sortBy]);

  const publisherOptions = useMemo(
    () =>
      publisherFacets.filter(
        (facet) => facet.count >= 2 || facet.value === publisherFilter,
      ),
    [publisherFacets, publisherFilter],
  );

  useEffect(() => {
    const query = debouncedQuery.trim();
    if (query.length >= 3) {
      trackSearchInteraction(query, "conference");
    }
  }, [debouncedQuery]);

  const locationOptions = useMemo(() => {
    const countryCount = conferences.reduce<Record<string, number>>(
      (accumulator, item) => {
        const country = getCountryFromLocation(item.location);
        if (!country || country === "Unknown") return accumulator;
        accumulator[country] = (accumulator[country] || 0) + 1;
        return accumulator;
      },
      {},
    );

    const rankedCountries = Object.entries(countryCount).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );

    const majorCountries = rankedCountries.filter(([, count]) => count >= 2);
    const finalCountries =
      majorCountries.length > 0 ? majorCountries : rankedCountries;

    return finalCountries.slice(0, 12).map(([country]) => country);
  }, [conferences]);

  const locationSelectOptions = useMemo(
    () =>
      locationFilter !== "all" && !locationOptions.includes(locationFilter)
        ? [locationFilter, ...locationOptions]
        : locationOptions,
    [locationFilter, locationOptions],
  );

  const processedConferences = useMemo(() => {
    const filtered = conferences.filter((item) => {
      if (locationFilter !== "all") {
        return getCountryFromLocation(item.location) === locationFilter;
      }
      return true;
    });

    const parseDate = (value?: string | null) => {
      if (!value) return 0;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    return [...filtered].sort((a, b) => {
      if (sortBy === "title-asc") {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === "title-desc") {
        return b.title.localeCompare(a.title);
      }
      if (sortBy === "deadline-soonest") return compareByDeadline(a, b);
      if (sortBy === "upcoming") {
        const startOf = (item: HarvestItem) =>
          item.startsAt ? Date.parse(item.startsAt) : Number.POSITIVE_INFINITY;
        return startOf(a) - startOf(b);
      }
      if (sortBy === "oldest") return itemTimestamp(a) - itemTimestamp(b);
      return itemTimestamp(b) - itemTimestamp(a);
    });
  }, [conferences, locationFilter, sortBy]);

  const totalPages = Math.max(
    1,
    Math.ceil(processedConferences.length / itemsPerPage),
  );
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentConferences = processedConferences.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />

      <div className="flex-1">
        <div className="container mx-auto max-w-[1380px] px-5 py-8 md:px-6 md:py-10">
          <PageHeader
            icon={Presentation}
            eyebrow="Call for papers"
            title="Conferences"
            description="Upcoming tech research venues sorted by event date, with submission status pulled from each call for papers."
          />
          <section className="overflow-hidden rounded-[28px] bg-card/60">
            <div className="p-6 md:p-8">
              <div className="rounded-2xl border border-border bg-background p-4 md:p-5">
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      placeholder="Try CVPR, NeurIPS, ICML, IEEE, computer vision, systems..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="h-14 rounded-xl pl-12 text-[15px] md:text-base"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-12 rounded-xl" aria-label="Sort conferences">
                        <SelectValue placeholder="Sort conferences" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upcoming">Event date: Soonest</SelectItem>
                        <SelectItem value="deadline-soonest">Deadline: Soonest</SelectItem>
                        <SelectItem value="newest">
                          Date: Newest first
                        </SelectItem>
                        <SelectItem value="oldest">
                          Date: Oldest first
                        </SelectItem>
                        <SelectItem value="title-asc">Title: A to Z</SelectItem>
                        <SelectItem value="title-desc">
                          Title: Z to A
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={publisherFilter}
                      onValueChange={setPublisherFilter}
                    >
                      <SelectTrigger
                        className="h-12 rounded-xl"
                        aria-label="Publisher or society"
                      >
                        <SelectValue placeholder="All publishers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All publishers</SelectItem>
                        {publisherOptions.map((facet) => (
                          <SelectItem key={facet.value} value={facet.value}>
                            {facet.label} ({facet.count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={locationFilter}
                      onValueChange={setLocationFilter}
                    >
                      <SelectTrigger className="h-12 rounded-xl" aria-label="Location">
                        <SelectValue placeholder="All locations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All locations</SelectItem>
                        {locationSelectOptions.map((location) => (
                          <SelectItem key={location} value={location}>
                            {location}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-8 mb-5 flex items-center justify-between gap-4 border-b border-border pb-4">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              {isLoading
                ? "Finding conferences..."
                : processedConferences.length === 0
                  ? "Showing 0 of 0 results"
                  : `Showing ${startIndex + 1}–${Math.min(
                      startIndex + currentConferences.length,
                      processedConferences.length,
                    )} of ${processedConferences.length} results`}
              {isFetching && !isLoading && (
                <span className="ml-3 text-sm font-normal text-muted-foreground">
                  Updating...
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-5">
              {[1, 2, 3, 4].map((index) => (
                <Card key={index} className="overflow-hidden rounded-2xl">
                  <CardContent className="p-6">
                    <Skeleton className="h-8 w-3/4 mb-4" />
                    <Skeleton className="h-5 w-1/2 mb-3" />
                    <Skeleton className="h-5 w-1/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500">
                Error loading conferences. Please try again later.
              </p>
            </div>
          ) : processedConferences.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-dashed">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No conferences found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search terms.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-5">
                {currentConferences.map((conf: HarvestItem) => (
                  <Card
                    key={conf.id}
                    className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm"
                  >
                    <CardContent className="p-6 md:p-7">
                      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
                        <div className="min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="text-[1.45rem] leading-tight font-semibold tracking-tight text-foreground">
                                {conf.title}
                              </h3>
                              <div className="flex flex-wrap items-center gap-2 mt-3">
                                <Badge variant="secondary" className="text-xs">
                                  {conf.subtype
                                    ? conf.subtype.toUpperCase()
                                    : "CONFERENCE"}
                                </Badge>
                                <DeadlineStatusBadge item={conf} />
                                {conf.publishers?.map((publisher) => (
                                  <Badge
                                    key={publisher}
                                    variant="outline"
                                    className="border-primary/40 bg-primary/5 text-xs text-primary"
                                  >
                                    {publisher}
                                  </Badge>
                                ))}
                                {conf.location && (
                                  <Badge variant="outline" className="text-xs">
                                    {getCountryFromLocation(conf.location)}
                                  </Badge>
                                )}
                                {conf.sourceName && (
                                  <span className="text-sm text-muted-foreground">
                                    {conf.sourceName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
                            <div className="rounded-xl border border-border/70 px-4 py-4">
                              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                Event date
                              </div>
                              <div className="mt-2 text-sm font-medium text-foreground flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {conf.eventDate || "TBA"}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border/70 px-4 py-4">
                              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                Location
                              </div>
                              <div className="mt-2 text-sm font-medium text-foreground flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                {conf.location || "TBA"}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border/70 px-4 py-4">
                              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                Submission deadline
                              </div>
                              <div className="mt-2 text-sm font-medium text-foreground flex items-center gap-2">
                                <Timer className="h-4 w-4 text-muted-foreground" />
                                {conf.deadlineAt
                                  ? new Date(conf.deadlineAt).toLocaleDateString(undefined, {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })
                                  : "See call for papers"}
                              </div>
                            </div>
                          </div>

                          {conf.summary && (
                            <p className="mt-5 text-[15px] leading-7 text-muted-foreground">
                              {conf.summary}
                            </p>
                          )}
                        </div>

                        <div className="rounded-2xl bg-muted/90 border border-border p-6 flex flex-col justify-between">
                          {conf.milestones && Object.keys(conf.milestones).length > 0 ? (
                            <div>
                              <p className="eyebrow mb-4">CFP timeline</p>
                              <ConferenceMilestones item={conf} />
                            </div>
                          ) : (
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 rounded-xl bg-card p-2 border border-border">
                                <CheckCircle2 className="h-5 w-5 text-foreground/85" />
                              </div>
                              <p className="text-sm md:text-[15px] leading-7 text-foreground/85">
                                Review the venue page for deadlines, calls for
                                papers, and submission instructions before
                                planning your next conference submission.
                              </p>
                            </div>
                          )}

                          {conf.url && (
                            <div className="mt-6">
                              <Button
                                size="lg"
                                className="w-full rounded-xl"
                                onClick={() => window.open(conf.officialUrl || conf.url, "_blank")}
                              >
                                {conf.officialUrl ? "Official website" : "Visit conference website"}
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              {conf.officialUrl && (
                                <a
                                  href={conf.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-3 block text-center text-xs text-muted-foreground hover:text-foreground"
                                >
                                  View on {conf.sourceName?.split(" ")[0] || "source"}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-12">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
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
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
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

export default Conferences;
