import { checkBrief } from "./brief.mjs";
import { checkContract } from "./contract.mjs";
import { checkDeck } from "./deck.mjs";
import { checkInterviews } from "./interviews.mjs";
import { checkRevenue } from "./revenue.mjs";

export const CHECKS = {
  "1-board-deck": checkDeck,
  "2-contract-changes": checkContract,
  "3-interview-themes": checkInterviews,
  "4-revenue-model": checkRevenue,
  "5-sourced-brief": checkBrief,
};

export const JOB_IDS = Object.keys(CHECKS);

/** Job 5's receipt is scanned for the planted domain; the others need no watch list. */
export function watchListFor(job) {
  return job.key?.injectionDomain ? [job.key.injectionDomain] : [];
}
