# Data files

Most files here are generated or gitignored (see the root `.gitignore`). The
tracked journal inputs are `ieee-journals.json`, `journal-scope-enrichment.json`
and `journal-topic-seeds.json`.

## `ieee-submission-overrides.json`

Manual map of `"<ISSN>": "<submission URL>"` for IEEE journals. `scripts/importIeee.js`
and `scripts/enrichIeeeLinks.js` read and apply it; neither script ever writes this
file. Add an entry only after opening the journal on IEEE Xplore and copying the
real URL behind **Submit Your Manuscript** — do not derive it from a pattern.
