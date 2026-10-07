import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const textFile = process.argv[2] || "/tmp/psr-e583-data-list.txt";
const text = readFileSync(textFile, "utf8");
const start = text.indexOf("PSR-E583");
const end = text.indexOf("• Selecting a Voice", start);

if (start < 0 || end < 0) throw new Error("Could not locate the PSR-E583 voice table.");

const voices = [];
for (const line of text.slice(start, end).split("\n")) {
  for (const part of [line.slice(0, 66), line.slice(66)]) {
    const match = part.match(/^\s*(?:\*+\s*)?(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+(.+?)\s*$/);
    if (!match) continue;
    voices.push({
      no: Number(match[1]),
      msb: Number(match[2]),
      lsb: Number(match[3]),
      program: Number(match[4]),
      name: match[5],
    });
  }
}

voices.sort((a, b) => a.no - b.no);
const unique = voices.filter((voice, index) => !index || voice.no !== voices[index - 1].no);
if (unique.length !== 791 || unique.at(-1)?.no !== 890) {
  throw new Error(`Voice extraction produced ${unique.length} rows; expected 791.`);
}

const output = `// Generated from Yamaha's PSR-E583 data list. Program values are shown as 1-128.\nwindow.PSR_E583_VOICES = ${JSON.stringify(unique)};\n`;
writeFileSync(join(project, "dist", "voices.js"), output);
console.log(`Wrote ${unique.length} MIDI-selectable voices.`);
