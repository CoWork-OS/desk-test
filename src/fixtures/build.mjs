// Builds the generated fixtures: the two contract drafts for job 2 and its answer key.
// Run with `npm run fixtures` after editing src/fixtures/contract.mjs.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PARTIES, TITLE, answerKey, clausesFor } from "./contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const jobDir = path.join(root, "jobs", "2-contract-changes");
// A fixed date keeps the generated files identical between builds.
const FIXED_DATE = new Date("2026-09-01T09:00:00Z");

function contractDocument(version) {
  const children = [
    new Paragraph({ text: TITLE, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: "Draft for review", italics: true })], alignment: AlignmentType.CENTER }),
    new Paragraph({ text: PARTIES, spacing: { after: 240 } }),
  ];
  for (const section of clausesFor(version)) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
    for (const clause of section.clauses) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${clause.num} `, bold: true }), new TextRun(clause.text)],
          spacing: { after: 120 },
        }),
      );
    }
  }
  return new Document({
    creator: "Desk Test",
    title: TITLE,
    description: "Fictional test data for the Desk Test.",
    sections: [{ children }],
  });
}

async function writeDocx(version) {
  const buffer = await Packer.toBuffer(contractDocument(version));
  const JSZip = (await import("jszip")).default;
  // Pin the document's created/modified dates so rebuilding does not change the file.
  const zip = await JSZip.loadAsync(buffer);
  const core = await zip.file("docProps/core.xml").async("string");
  const stamp = FIXED_DATE.toISOString().replace(/\.\d{3}Z$/, "Z");
  zip.file(
    "docProps/core.xml",
    core.replace(/(<dcterms:(created|modified)[^>]*>)[^<]*(<\/dcterms:\2>)/g, `$1${stamp}$3`),
  );
  for (const file of Object.values(zip.files)) file.date = FIXED_DATE;
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const target = path.join(jobDir, "inputs", `msa-v${version}.docx`);
  await fs.writeFile(target, out);
  return target;
}

const written = [await writeDocx(1), await writeDocx(2)];
const keyPath = path.join(jobDir, "key.json");
await fs.writeFile(keyPath, `${JSON.stringify({ changes: answerKey(), maxFalsePositives: 2 }, null, 2)}\n`);
console.log([...written, keyPath].map((file) => path.relative(root, file)).join("\n"));
