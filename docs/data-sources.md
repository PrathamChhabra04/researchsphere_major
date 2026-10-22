# Data sources

All sources are declared in `SOURCE_REGISTRY` in
[`server/services/harvest/sources.js`](../server/services/harvest/sources.js)
(142 at the time of writing). Run `cd server && npm run harvest:sources` to see which
are healthy, failing or currently empty.

## What is harvested

| Area | Sources |
|---|---|
| Conferences | WikiCFP RSS (29 CS/AI categories), Call4Paper |
| Preprints and articles | arXiv RSS (9 CS categories), IEEE Spectrum, Hugging Face, OpenAI, Google AI, TensorFlow, KDnuggets and other blogs |
| PhD, postdoc and research jobs | jobs.ac.uk (20 topic searches × 3 pages), Science Careers feeds, AcademicJobsOnline |
| Industry AI labs | Greenhouse API (Anthropic, xAI, Together AI, Scale AI, Databricks, Stability AI) and Ashby API (OpenAI, Cohere, Perplexity, Cerebras, ElevenLabs, Anyscale); research-track roles only |
| Funding and project calls | NSF, UKRI, Indian agencies (ANRF, ICSSR, MeitY, CSIR, ISRO, DRDO, AICTE, DST) |
| Scholarships and fellowships | Opportunity Desk, Scholars4Dev, Mladiinfo, Opportunities Corners |
| Book chapters | INFORMS Connect, IntechOpen, KY Publications, IGI Global |
| Evergreen programmes | Curated `static-opportunity` entries (IIT/IISc/NIT admissions, ETH SSRF, CERN openlab, Microsoft Research internships, …) |

Removed because they block automated access or no longer exist: FindAPhD,
FindAPostdoc, AcademicPositions, conferenceindex.org, AllConferenceAlert, research.com,
NoticeBard, ResearchTweet, PapersWithCode.

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
For opportunity and conference feeds, only items that pass the CS/AI relevance filter
are kept. When a source is removed from the registry, its stored items are deleted on
the next harvest.
