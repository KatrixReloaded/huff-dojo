import { keccak256 } from './keccak.js';
import { compactHex, wordHex, hex } from '../utils.js';

function stripComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractMacroBody(source, macroName = "MAIN") {
  return collectMacroDefinitions(source).get(macroName) ?? null;
}

function collectMacroDefinitions(source) {
  const clean = stripComments(source);
  const macros = new Map();
  const pattern = /#define\s+macro\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)[^{]*\{/gi;
  let match;
  while ((match = pattern.exec(clean)) !== null) {
    const openBrace = clean.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(clean, openBrace);
    if (closeBrace === -1) throw new Error(`Unclosed macro ${match[1]}`);
    macros.set(match[1], clean.slice(openBrace + 1, closeBrace));
    pattern.lastIndex = closeBrace + 1;
  }
  return macros;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandMacroBody(name, macros, stack = []) {
  if (stack.includes(name)) {
    throw new Error(`Recursive macro invocation: ${[...stack, name].join(" -> ")}`);
  }
  const body = macros.get(name);
  if (body == null) throw new Error(`Unknown macro ${name}`);
  let expanded = body;
  for (const helperName of macros.keys()) {
    if (helperName === "MAIN" || helperName === "CONSTRUCTOR") continue;
    const invocation = new RegExp(`\\b${escapeRegExp(helperName)}\\s*\\(\\s*\\)`, "g");
    expanded = expanded.replace(invocation, () => expandMacroBody(helperName, macros, [...stack, name]));
  }
  return expanded;
}

function expandMacroInvocations(body, source) {
  const macros = collectMacroDefinitions(source);
  let expanded = body;
  for (const name of macros.keys()) {
    if (name === "MAIN" || name === "CONSTRUCTOR") continue;
    const invocation = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(\\s*\\)`, "g");
    expanded = expanded.replace(invocation, () => expandMacroBody(name, macros, ["MAIN"]));
  }
  return expanded;
}

function extractOpcodeBody(source) {
  const mainBody = extractMacroBody(source, "MAIN");
  if (mainBody !== null) return mainBody;
  const clean = stripComments(source);
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return clean.slice(firstBrace + 1, lastBrace);
  }
  return clean;
}

function collectConstants(source) {
  const constants = new Map();
  let freeStorageSlot = 0n;
  const clean = stripComments(source);
  const pattern = /#define\s+constant\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n]+)/g;
  let match;
  while ((match = pattern.exec(clean)) !== null) {
    const [, name, rawValue] = match;
    const value = rawValue.trim();
    if (/^FREE_STORAGE_POINTER\s*\(\s*\)$/i.test(value)) {
      constants.set(name, compactHex(freeStorageSlot));
      freeStorageSlot += 1n;
    } else if (/^__BYTES\s*\(\s*"([^"]*)"\s*\)$/i.test(value)) {
      const text = /^__BYTES\s*\(\s*"([^"]*)"\s*\)$/i.exec(value)[1];
      constants.set(name, `0x${Buffer.from(text, "utf8").toString("hex") || "0"}`);
    } else if (/^__LEFTPAD\s*\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)$/i.test(value)) {
      const inner = /^__LEFTPAD\s*\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)$/i.exec(value)[1];
      constants.set(name, wordHex(inner));
    } else if (/^__RIGHTPAD\s*\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)$/i.test(value)) {
      const inner = /^__RIGHTPAD\s*\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)$/i.exec(value)[1];
      constants.set(name, `0x${hex(inner).slice(2).padEnd(64, "0").slice(0, 64)}`);
    } else if (/^(0x[0-9a-fA-F]+|\d+)$/.test(value)) {
      constants.set(name, value);
    } else if (/^"([^"]*)"$/.test(value)) {
      const text = /^"([^"]*)"$/.exec(value)[1];
      constants.set(name, `0x${Buffer.from(text, "utf8").toString("hex") || "0"}`);
    }
  }
  return constants;
}

function collectAbiHashes(source, kind) {
  const hashes = new Map();
  const clean = stripComments(source);
  const pattern = new RegExp(`#define\\s+${kind}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(([^)]*)\\)`, "g");
  let match;
  while ((match = pattern.exec(clean)) !== null) {
    const [, name, args] = match;
    const canonical = `${name}(${args.replace(/\s+/g, "")})`;
    const hash = keccak256(canonical);
    hashes.set(canonical, hash);
    hashes.set(name, hash);
  }
  return hashes;
}

function resolveAbiHash(hashes, rawName, builtin) {
  const name = rawName.replace(/^"|"$/g, "");
  const hash = hashes.get(name) || (name.includes("(") ? keccak256(name.replace(/\s+/g, "")) : null);
  if (!hash) throw new Error(`Unsupported ${builtin} target: ${name}`);
  return hash;
}

function substituteBuiltins(body, source) {
  const functions = collectAbiHashes(source, "function");
  const events = collectAbiHashes(source, "event");
  const errors = collectAbiHashes(source, "error");
  return body
    .replace(/__FUNC_SIG\s*\(\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*\)/g, (full, rawName) => {
      return `0x${resolveAbiHash(functions, rawName, "__FUNC_SIG").slice(0, 8)}`;
    })
    .replace(/__EVENT_HASH\s*\(\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*\)/g, (full, rawName) => {
      return `0x${resolveAbiHash(events, rawName, "__EVENT_HASH")}`;
    })
    .replace(/__ERROR\s*\(\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*\)/g, (full, rawName) => {
      return `0x${resolveAbiHash(errors, rawName, "__ERROR").slice(0, 8).padEnd(64, "0")}`;
    });
}

export {
  stripComments,
  findMatchingBrace,
  extractMacroBody,
  collectMacroDefinitions,
  escapeRegExp,
  expandMacroBody,
  expandMacroInvocations,
  extractOpcodeBody,
  collectConstants,
  collectAbiHashes,
  resolveAbiHash,
  substituteBuiltins
};
