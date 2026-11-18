# Data sources

All sources are declared in `SOURCE_REGISTRY` in
[`server/services/harvest/sources.js`](../server/services/harvest/sources.js)
(180 at the time of writing). Run `cd server && npm run harvest:sources` to see which
are healthy, failing or currently empty.

## What is harvested

| Area | Sources |
|---|---|
| Conferences | WikiCFP RSS (50 tech categories: AI, cloud, Web3, 6G, IoT, security, quantum, XR, fintech, semiconductors, …) with deadlines from each event page, Call4Paper |
| Preprints and articles | arXiv RSS (17 categories incl. distributed/cloud, networking, HCI, robotics, hardware, emerging tech, quantum), IEEE Spectrum, Hugging Face, OpenAI, Google AI, TensorFlow, KDnuggets and other blogs |
| PhD, postdoc and research jobs | jobs.ac.uk (26 topic searches incl. cloud, IoT, quantum, HPC, networks), Science Careers feeds, AcademicJobsOnline |
| Industry AI labs | Greenhouse API (Anthropic, xAI, Together AI, Scale AI, Databricks, Stability AI) and Ashby API (OpenAI, Cohere, Perplexity, Cerebras, ElevenLabs, Anyscale); research-track roles only |
| Funding and project calls | NSF, UKRI, Indian agencies (ANRF, ICSSR, MeitY, CSIR, ISRO, DRDO, AICTE, DST) |
| Scholarships and fellowships | Opportunity Desk, Scholars4Dev, Mladiinfo, Opportunities Corners |
| Book chapters | INFORMS Connect, IntechOpen, KY Publications, IGI Global |
| Evergreen programmes | Curated `static-opportunity` entries (IIT/IISc/NIT admissions, ETH SSRF, CERN openlab, Microsoft Research internships, …) |

Removed because they block automated access or no longer exist: FindAPhD,
FindAPostdoc, AcademicPositions, conferenceindex.org, AllConferenceAlert, research.com,
NoticeBard, ResearchTweet, PapersWithCode.

## Special issues (manual)

ScienceDirect's [calls for special issues](https://www.sciencedirect.com/browse/calls-for-papers?subject=computer-science)
listing is not part of the harvest scheduler and is not scraped automatically:
the site blocks automated requests (HTTP 400/403 or a bot challenge). The manual
collector writes `server/data/special-issues.json`:

```bash
node scripts/scrapeSpecialIssues.js
```

If the live request is blocked, save the listing from a browser and parse the
capture instead (JSON or HTML):

```bash
node scripts/scrapeSpecialIssues.js --input server/data/raw/special-issues.html
```

When the capture has no per-item secondary-subject labels, the script fills
them from the journal corpus (`server/data/journal-finder-probe`) so the
secondary-subject filter still works.

The script never attempts to bypass the protection. Full save instructions and
the accepted JSON/HTML fields are in
[`server/data/raw/README.md`](../server/data/raw/README.md).

## Adding a source

Add an entry to `SOURCE_REGISTRY`. The `type` selects the harvester:

| `type` | Use for | Extra fields |
|---|---|---|
| `rss` | Any RSS 2.0 feed (malformed XML is retried leniently) | none |
| `arxiv-rss` | `https://rss.arxiv.org/rss/<category>` | none (capped at 80 items) |
| `job-board` | Greenhouse or Ashby company boards | `board: "greenhouse" \| "ashby"`, `organization` |
| `html` | Scraped pages; needs a matching branch in `runSourceHarvester` | `pages` (jobs.ac.uk pagination) |
| `static-opportunity` | Evergreen pages without listings | `staticTitle`, `staticSummary`, `staticOrganization`, `staticTags` |

```js
{
  id: "sciencecareers-robotics-feed",        // unique; also stored on every item
  name: "Science Careers (Robotics Jobs Feed)",
  kind: "opportunity",                       // conference | journal | opportunity
  subtype: "research",                       // fallback category; titles take priority
  type: "rss",
  url: "https://jobs.sciencecareers.org/jobsrss/?keywords=robotics",
},
```

Then check it with `npm run harvest:refresh` and confirm it reports a non-zero count.
For opportunity and conference feeds, only items that pass the tech-relevance filter
are kept. When a source is removed from the registry, its stored items are deleted on
the next harvest.

## WikiCFP deadlines

WikiCFP feeds carry only event dates. After each harvest, `wikicfpDetails.js` fetches
the event page of every live WikiCFP conference that has no cached copy (or one older
than 14 days), extracts the abstract, submission, notification and camera-ready dates
plus the official website, and stores them in the `detail_cache` table. Requests honour
WikiCFP's robots.txt crawl delay of 5 s, so the first pass over ~450 events takes about
40 minutes in the background; later passes only fetch new events. Progress is shown under
`wikicfpDetails` in `GET /api/harvest/status`.
