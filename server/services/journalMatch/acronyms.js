/**
 * Curated acronym expansions for keyword queries.
 *
 * Authors search with "NLP" or "IoT" far more often than with the full phrase,
 * while journal scopes are written out in words. Expanding the acronym before
 * embedding/BM25 closes that vocabulary gap. Deliberately conservative: only
 * unambiguous CS terms, and only when the token appears standalone.
 */
export const ACRONYM_EXPANSIONS = {
  ai: "artificial intelligence",
  ml: "machine learning",
  dl: "deep learning",
  nlp: "natural language processing",
  cv: "computer vision",
  iot: "internet of things",
  iiot: "industrial internet of things",
  hci: "human-computer interaction",
  rl: "reinforcement learning",
  hpc: "high performance computing",
  uav: "unmanned aerial vehicles",
  llm: "large language models",
  xai: "explainable artificial intelligence",
  gan: "generative adversarial networks",
  cnn: "convolutional neural networks",
  rnn: "recurrent neural networks",
  gnn: "graph neural networks",
  ner: "named entity recognition",
  qa: "question answering",
  vr: "virtual reality",
  ar: "augmented reality",
  "5g": "5g mobile networks",
  "6g": "6g mobile networks",
  sdn: "software defined networking",
  nfv: "network function virtualization",
  wsn: "wireless sensor networks",
  manet: "mobile ad hoc networks",
  vanet: "vehicular ad hoc networks",
};

export const ACRONYM_TOKENS = new Set(Object.keys(ACRONYM_EXPANSIONS));

const normalize = (value) =>
  String(value ?? "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

/**
 * Append the full forms of any acronyms present in `topic`.
 * "federated learning + nlp" -> "nlp natural language processing".
 */
export const expandAcronyms = (topic) => {
  const text = String(topic ?? "").trim();
  if (!text) return text;

  const tokens = new Set(normalize(text));
  const expansions = [];
  for (const [acronym, expansion] of Object.entries(ACRONYM_EXPANSIONS)) {
    if (!tokens.has(acronym)) continue;
    const expansionTokens = normalize(expansion);
    if (expansionTokens.every((token) => tokens.has(token))) continue;
    expansions.push(expansion);
  }

  return expansions.length ? `${text} ${expansions.join(" ")}` : text;
};
