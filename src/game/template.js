import fs from "node:fs";
import path from "node:path";
import { currentMode, lessons, modeConfig } from './state.js';
import { defaultSettings } from './config.js';
import { style } from '../ui/styles.js';
import { extractMacroBody, findMatchingBrace, stripComments } from '../evm/parser.js';
import { tokenize } from '../evm/simulator.js';
import { compactHex } from '../utils.js';

export function huffBodyForLevel(level, solved = false) {
  const source = solved ? level.solution : "";
  const body = extractMacroBody(source, "MAIN") || (solved ? source : "");
  if (!body.trim()) {
    return [
      "    // Write your level solution here.",
      "    // Example style: 0x2a 0x00 mstore 0x20 0x00 return"
    ].join("\n");
  }
  if (solved && /(\[[A-Za-z_][A-Za-z0-9_]*\]|__[A-Z_]+|[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\))/.test(body)) {
    return body
      .split("\n")
      .map((line) => line.trim() ? `    ${line.trim()}` : "")
      .join("\n");
  }
  return rawOpcodesToHuff(solved ? source : body)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.endsWith(":") ? `${token}` : `    ${token}`)
    .join("\n");
}

export function extraHuffDefinitions(level, solved = false) {
  if (!solved) return [];
  const source = level.solution || "";
  const definitions = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#define\s+(constant|function|event|error)\b/i.test(line));

  const clean = stripComments(source);
  const pattern = /#define\s+macro\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)[^{]*\{/gi;
  let match;
  while ((match = pattern.exec(clean)) !== null) {
    if (["MAIN", "CONSTRUCTOR"].includes(match[1].toUpperCase())) continue;
    const openBrace = clean.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(clean, openBrace);
    if (closeBrace === -1) throw new Error(`Unclosed macro ${match[1]}`);
    definitions.push(clean.slice(match.index, closeBrace + 1).trim());
    pattern.lastIndex = closeBrace + 1;
  }

  return definitions.length ? ["", ...definitions] : [];
}

export function rawOpcodesToHuff(source) {
  const tokens = tokenize(source);
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const op = token.toUpperCase();
    if (op === "PUSH0") {
      out.push("0x00");
    } else if (/^PUSH([1-9]|[12][0-9]|3[0-2])$/.test(op) || op === "PUSH") {
      const value = tokens[i + 1];
      if (value) {
        out.push(value.startsWith("@") ? value.slice(1) : value.toLowerCase());
        i += 1;
      }
    } else if (token.endsWith(":")) {
      out.push(token);
    } else {
      out.push(token.toLowerCase().replace(/^@/, ""));
    }
  }
  return out.join(" ");
}

export function scaffoldNotes(settings = defaultSettings) {
  if (!settings.boilerplate) return [];
  return [
    "    // Optional Solidity-style memory convention:",
    "    // 0x80 0x40 mstore    // free memory pointer = 0x80",
    "    //",
    "    // Your level body goes below."
  ];
}

export function buildHuffTemplate(level, settings = defaultSettings, solved = false) {
  const header = [
    `// Huff Dojo ${modeConfig().label} level ${level.id}: ${level.title}`,
    `// ${level.prompt}`
  ];
  const lessonBlock = settings.lessons && lessons[level.id]
    ? [
        "",
        ...lessons[level.id].map((line) => line ? `// ${line}` : "//")
      ]
    : [];
  const constructor = settings.boilerplate
    ? [
        "",
        "// Pre-written deployment wrapper.",
        "// Leave this alone while learning MAIN; hnc's default constructor returns MAIN as runtime bytecode.",
        "#define macro CONSTRUCTOR() = takes(0) returns(0) {",
        "}"
      ]
    : [];
  return [
    ...header,
    ...lessonBlock,
    ...extraHuffDefinitions(level, solved),
    ...constructor,
    "",
    "#define macro MAIN() = takes(0) returns(0) {",
    ...(!solved ? scaffoldNotes(settings) : []),
    huffBodyForLevel(level, solved),
    "}",
    ""
  ].join("\n");
}

export function writeTemplate(level, filePath, settings, solved = false, overwrite = false) {
  const resolved = path.resolve(filePath);
  if (fs.existsSync(resolved) && !overwrite) {
    throw new Error(`${resolved} already exists. Use :template! to overwrite it.`);
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, buildHuffTemplate(level, settings, solved), "utf8");
  return resolved;
}

export function replaceMainBody(source, body) {
  const clean = source;
  const macroPattern = /#define\s+macro\s+MAIN\s*\(/i;
  const match = macroPattern.exec(clean);
  if (!match) {
    throw new Error("Could not find #define macro MAIN() in the Huff file.");
  }
  const firstBrace = clean.indexOf("{", match.index);
  if (firstBrace === -1) {
    throw new Error("Could not find opening brace for MAIN.");
  }
  const lastBrace = findMatchingBrace(clean, firstBrace);
  if (lastBrace === -1) {
    throw new Error("Could not find closing brace for MAIN.");
  }
  const indentedBody = body
    .split("\n")
    .map((line) => line.trim() ? `    ${line.trim()}` : "")
    .join("\n");
  return `${clean.slice(0, firstBrace + 1)}\n${indentedBody}\n${clean.slice(lastBrace)}`;
}

export function writeMainBody(level, filePath, settings, body) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    writeTemplate(level, resolved, settings, false, false);
  }
  const source = fs.readFileSync(resolved, "utf8");
  fs.writeFileSync(resolved, replaceMainBody(source, body), "utf8");
  return resolved;
}

export function readHuffSource(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  return { resolved, source: fs.readFileSync(resolved, "utf8") };
}
