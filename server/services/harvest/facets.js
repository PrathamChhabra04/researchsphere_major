// Publisher/society facets for harvested conference records.
//
// Conference listings are aggregated from WikiCFP topic feeds and Call4Paper,
// so a venue's society (IEEE, ACM, ...) has to be inferred from its text rather
// than from the crawl source. These facets let the UI filter "actually IEEE"
// results instead of relying on fuzzy keyword matching alone.

const CONFERENCE_PUBLISHERS = [
  { id: "ieee", label: "IEEE", pattern: /\bIEEE\b/i },
  { id: "acm", label: "ACM", pattern: /\bACM\b/i },
  { id: "spie", label: "SPIE", pattern: /\bSPIE\b/i },
  { id: "springer", label: "Springer", pattern: /\bSpringer\b/i },
  { id: "elsevier", label: "Elsevier", pattern: /\bElsevier\b/i },
  { id: "cvf", label: "CVF", pattern: /\bCVF\b/i },
  { id: "aaai", label: "AAAI", pattern: /\bAAAI\b/i },
  { id: "ifip", label: "IFIP", pattern: /\bIFIP\b/i },
  { id: "iet", label: "IET", pattern: /\bIET\b/i },
  { id: "usenix", label: "USENIX", pattern: /\bUSENIX\b/i },
  { id: "mdpi", label: "MDPI", pattern: /\bMDPI\b/i },
  { id: "world-scientific", label: "World Scientific", pattern: /\bWorld\s+Scientific\b/i },
  { id: "iop", label: "IOP", pattern: /\bIOP\b/i },
  { id: "wiley", label: "Wiley", pattern: /\bWiley\b/i },
];

const publisherById = new Map(
  CONFERENCE_PUBLISHERS.map((publisher) => [publisher.id, publisher]),
);

const publisherHaystack = (item) =>
  `${item?.title || ""} ${item?.summary || ""} ${item?.organization || ""}`;

export const getConferencePublisherIds = (item) => {
  if (!item || (item.kind && item.kind !== "conference")) return [];
  const haystack = publisherHaystack(item);
  return CONFERENCE_PUBLISHERS.filter(({ pattern }) =>
    pattern.test(haystack),
  ).map(({ id }) => id);
};

export const getConferencePublisherLabels = (item) =>
  getConferencePublisherIds(item).map(
    (id) => publisherById.get(id)?.label || id,
  );

const rankFacet = (a, b) => b.count - a.count || a.label.localeCompare(b.label);

export const buildHarvestFacets = (items = []) => {
  const publishers = new Map();

  for (const item of items) {
    for (const id of getConferencePublisherIds(item)) {
      const facet = publishers.get(id) || {
        value: id,
        label: publisherById.get(id)?.label || id,
        count: 0,
      };
      facet.count += 1;
      publishers.set(id, facet);
    }
  }

  return {
    publishers: [...publishers.values()].sort(rankFacet),
  };
};
