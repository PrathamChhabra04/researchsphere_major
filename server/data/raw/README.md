# Manual ScienceDirect captures

Live requests to ScienceDirect's calls-for-papers listing are usually blocked
(HTTP 403 / bot challenge). The scraper deliberately does not bypass that
protection. Save the listing manually into this folder, then parse it:

```bash
node scripts/scrapeSpecialIssues.js --input server/data/raw/special-issues.json
```

## What to save

Use Chrome, Edge or Firefox:

1. Open
   <https://www.sciencedirect.com/browse/calls-for-papers?subject=computer-science>
   and wait until the special-issue cards are visible.
2. Open DevTools (F12) → **Network**, reload the page, and filter requests for
   `calls-for-papers`.
3. Find the response whose body contains the list of special issues. Right-click
   it → **Save response** (or copy the JSON into a new file).
4. Save it as `server/data/raw/special-issues.json`.

If no JSON response is visible, save the rendered page instead:

- **Ctrl+S** → save as **Webpage, HTML only**
- Save it as `server/data/raw/special-issues.html`

The parser accepts either. It also understands the page's embedded JSON state
when an HTML capture is supplied. When the capture has no per-item
secondary-subject labels, the scraper fills them from the subject areas already
stored for each journal in `server/data/journal-finder-probe/*/journals-merged.json`
(matched by journal title, then by journal URL). The accepted keys are listed
below.

## Accepted fields

The parser looks for common aliases, so the exact ScienceDirect JSON shape does
not matter. Recognised fields include:

| Output | Accepted input keys |
| --- | --- |
| `title` | `title`, `name`, `articleTitle`, `specialIssueTitle` |
| `guestEditors` | `guestEditors`, `editors`, `guestEditorNames` |
| `journalName` | `journalName`, `journalTitle`, `journal.name` |
| `journalUrl` | `journalUrl`, `journalLink`, `journal.url` |
| `impactFactor` | `impactFactor`, `journalImpactFactor` |
| `citeScore` | `citeScore`, `journalCiteScore` |
| `submissionDeadline` | `submissionDeadline`, `deadline`, `closingDate` |
| `url` | `url`, `link`, `href`, `specialIssueUrl` |
| `secondarySubjectAreas` | `secondarySubjectAreas`, `secondarySubjects`, `subjectAreas` |

Missing fields are allowed. Items without a usable title or URL are skipped.

## Output

The scraper writes `server/data/special-issues.json`:

```json
{
  "source": "sciencedirect",
  "subjectArea": "Computer Science",
  "subjectSlug": "computer-science",
  "scrapedAt": "2026-11-18T12:00:00.000Z",
  "secondarySubjectAreas": ["Artificial Intelligence", "Software"],
  "count": 12,
  "items": []
}
```

The API excludes past deadlines at read time, so the file can keep calls that
have already closed.
