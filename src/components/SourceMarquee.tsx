const SOURCES = [
  "arXiv",
  "WikiCFP",
  "jobs.ac.uk",
  "OpenAI",
  "Anthropic",
  "Cohere",
  "NSF",
  "UKRI",
  "IEEE Spectrum",
  "Hugging Face",
  "Science Careers",
  "ANRF",
  "Databricks",
  "AcademicJobsOnline",
];

/** Infinite marquee of the sources the harvester reads, styled like the partner-logo strip. */
const SourceMarquee = () => (
  <div className="marquee overflow-hidden py-2">
    <div className="marquee-track gap-14 pr-14">
      {[...SOURCES, ...SOURCES].map((source, index) => (
        <span
          key={`${source}-${index}`}
          className="whitespace-nowrap font-display text-2xl font-semibold tracking-tight text-primary/55 md:text-3xl"
          aria-hidden={index >= SOURCES.length}
        >
          {source}
        </span>
      ))}
    </div>
  </div>
);

export default SourceMarquee;
