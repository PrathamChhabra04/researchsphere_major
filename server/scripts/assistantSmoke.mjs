// Smoke test for the rule-based assistant: runs standalone queries and multi-turn
// conversations (where each turn refines the previous one) against the harvest store.
// Usage: npm run smoke:assistant
import { answerAssistantQuery } from "../services/assistantService.js";

const STANDALONE = [
  "conference around mid march on machine learning in hyderabad",
  "machine learning conference in india",
  "machine learning conference in india in march",
  "ai conferences in march",
  "conferences in may",
  "blockchain papers",
];

const CONVERSATIONS = [
  ["machine learning conferences in march", "only in hyderabad", "now show phd"],
  ["machine learning conference in india", "conferences in may"],
];

const summarize = (response) => ({
  text: response.text,
  total: response.meta?.total,
  parsed: response.parsed,
  sample: (response.results || []).slice(0, 3).map((item) => ({
    title: item.title,
    location: item.location,
    startsAt: item.startsAt ?? item.eventDate,
  })),
});

for (const query of STANDALONE) {
  console.log(`\n=== ${query}`);
  console.log(JSON.stringify(summarize(await answerAssistantQuery(query)), null, 2));
}

for (const turns of CONVERSATIONS) {
  let lastParsed;
  console.log(`\n=== conversation: ${turns.join(" → ")}`);
  for (const turn of turns) {
    const response = await answerAssistantQuery(turn, lastParsed ? { lastParsed } : undefined);
    lastParsed = response.parsed;
    console.log(`--- ${turn}`);
    console.log(JSON.stringify(summarize(response), null, 2));
  }
}
