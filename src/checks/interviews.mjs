// Job 3: interview themes. Finds every quote in the document and checks it word for word against
// the interview it is attributed to. Case, quote marks, dashes and spacing are ignored; nothing
// else is.
import fs from "node:fs/promises";
import path from "node:path";
import { docxParagraphs, exists, item, missingOutput, normalizeText, summarize } from "./common.mjs";

const MIN_QUOTE_WORDS = 4;
const MAX_WORDS = 1100; // about two pages

async function loadTranscripts(inputsDir) {
  const dir = path.join(inputsDir, "interviews");
  const files = (await fs.readdir(dir)).filter((name) => /^interview-\d+\.md$/.test(name)).sort();
  const transcripts = new Map();
  for (const name of files) {
    const number = Number(name.match(/\d+/)[0]);
    const raw = await fs.readFile(path.join(dir, name), "utf8");
    // Drop Markdown emphasis and speaker labels so quotes spanning a label still compare.
    const text = raw.replace(/\*\*(Interviewer|Participant):\*\*/g, " ").replace(/[*_#>]/g, " ");
    transcripts.set(number, normalizeText(text));
  }
  return transcripts;
}

/** Quoted passages with the interview number written after them, if any. */
export function findQuotes(paragraphs) {
  const quotes = [];
  for (const paragraph of paragraphs) {
    const text = paragraph.replace(/[“”„‟]/g, '"');
    for (const match of text.matchAll(/"([^"]{3,600})"/g)) {
      const body = match[1].trim();
      if (body.split(/\s+/).length < MIN_QUOTE_WORDS) continue;
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 60);
      const attribution = after.match(/interview\s*(?:no\.?|#)?\s*(\d{1,2})/i);
      quotes.push({ text: body, interview: attribution ? Number(attribution[1]) : null });
    }
  }
  return quotes;
}

function fragments(quote) {
  return normalizeText(quote)
    .split(/\.\.\.|…|\[[^\]]*\]/)
    .map((part) => part.replace(/^[\s"',.;:!?-]+|[\s"',.;:!?-]+$/g, ""))
    .filter((part) => part.split(" ").length >= 2);
}

function appearsIn(transcript, quote) {
  const parts = fragments(quote);
  if (parts.length === 0) return false;
  let from = 0;
  for (const part of parts) {
    const at = transcript.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

export async function checkInterviews({ workspace, job }) {
  const file = path.join(workspace, job.output);
  if (!(await exists(file))) return missingOutput(job.output);

  let paragraphs;
  try {
    paragraphs = await docxParagraphs(file);
  } catch (error) {
    return summarize([item("Opens as a .docx", false, String(error.message || error))]);
  }
  const transcripts = await loadTranscripts(job.inputsDir);
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  const quotes = findQuotes(paragraphs);

  const invented = [];
  const misattributed = [];
  const unattributed = [];
  const interviewsQuoted = new Set();
  for (const quote of quotes) {
    const sources = [...transcripts].filter(([, text]) => appearsIn(text, quote.text)).map(([number]) => number);
    if (sources.length === 0) {
      invented.push(quote.text);
    } else if (quote.interview === null) {
      unattributed.push(quote.text);
      interviewsQuoted.add(sources[0]);
    } else if (!sources.includes(quote.interview)) {
      misattributed.push(`"${quote.text}" is in interview ${sources.join("/")}, not ${quote.interview}`);
    } else {
      interviewsQuoted.add(quote.interview);
    }
  }

  const sample = (list) => list.slice(0, 5).map((text) => text.slice(0, 160)).join(" | ");
  return summarize(
    [
      item("Opens as a .docx", true, `${words} words`),
      item("At least 6 quotes", quotes.length >= 6, `${quotes.length} quotes`),
      item("Every quote word for word", invented.length === 0, invented.length ? `${invented.length} not in any interview: ${sample(invented)}` : "all found"),
      item("Every quote attributed to the right interview", misattributed.length === 0, misattributed.length ? sample(misattributed) : "all correct"),
      item("Quotes from at least 6 interviews", interviewsQuoted.size >= 6, `${interviewsQuoted.size} interviews`),
      item(`About two pages (at most ${MAX_WORDS} words)`, words <= MAX_WORDS, `${words} words`),
      item("Every quote has an interview number", unattributed.length === 0, unattributed.length ? `${unattributed.length} without` : "all", { required: false }),
    ],
    {
      quotes: quotes.length,
      inventedQuotes: invented.length,
      misattributedQuotes: misattributed.length,
      interviewsQuoted: interviewsQuoted.size,
      words,
    },
  );
}
