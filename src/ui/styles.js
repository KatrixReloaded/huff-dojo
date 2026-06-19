import { modeConfig } from '../game/state.js';

export const style = {
  bold: (text) => `\x1b[1m${text}\x1b[22m`,
  dim: (text) => `\x1b[2m${text}\x1b[22m`,
  green: (text) => `\x1b[32m${text}\x1b[39m`,
  yellow: (text) => `\x1b[33m${text}\x1b[39m`,
  red: (text) => `\x1b[31m${text}\x1b[39m`,
  blue: (text) => `\x1b[34m${text}\x1b[39m`,
  magenta: (text) => `\x1b[35m${text}\x1b[39m`,
  cyan: (text) => `\x1b[36m${text}\x1b[39m`,
  brightMagenta: (text) => `\x1b[95m${text}\x1b[39m`,
  brightCyan: (text) => `\x1b[96m${text}\x1b[39m`,
};

export function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function levelHeading(level) {
  return style.bold(style.cyan(`Level ${level.id}: ${level.title}`));
}

export function sectionLabel(text) {
  return style.bold(style.blue(text));
}

export function successText(text) {
  return style.bold(style.green(text));
}

export function warningText(text) {
  return style.bold(style.yellow(text));
}

export function errorText(text) {
  return style.bold(style.red(text));
}

export function mutedLabel(text) {
  return style.dim(text);
}

export const HUFF_OPCODE_RE = /\b(PUSH(?:[1-9]|[12]\d|3[012])|POP|ADD|SUB|MUL|DIV|SDIV|MOD|SMOD|ADDMOD|MULMOD|EXP|SIGNEXTEND|LT|GT|SLT|SGT|EQ|ISZERO|AND|OR|XOR|NOT|BYTE|SHL|SHR|SAR|KECCAK256|SHA3|ADDRESS|BALANCE|ORIGIN|CALLER|CALLVALUE|CALLDATALOAD|CALLDATASIZE|CALLDATACOPY|CODESIZE|CODECOPY|GASPRICE|EXTCODESIZE|EXTCODECOPY|RETURNDATASIZE|RETURNDATACOPY|EXTCODEHASH|BLOCKHASH|COINBASE|TIMESTAMP|NUMBER|DIFFICULTY|PREVRANDAO|GASLIMIT|CHAINID|SELFBALANCE|BASEFEE|MLOAD|MSTORE|MSTORE8|SLOAD|SSTORE|JUMP|JUMPI|PC|MSIZE|GAS|JUMPDEST|RETURN|REVERT|STOP|INVALID|SELFDESTRUCT|LOG[0-4]|CALLCODE|DELEGATECALL|STATICCALL|CALL|CREATE2?|DUP(?:[1-9]|1[0-6])|SWAP(?:[1-9]|1[0-6]))\b/g;

export function huffHighlight(line) {
  if (!line.trim()) return line;
  const commentIdx = line.indexOf("//");
  let code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const comment = commentIdx >= 0 ? line.slice(commentIdx) : "";
  code = code.replace(/(#define|#include|#error|#constant)\b/g, (m) => style.magenta(m));
  code = code.replace(/\b(macro|fn|takes|returns|constant)\b/g, (m) => style.dim(style.magenta(m)));
  code = code.replace(HUFF_OPCODE_RE, (m) => style.bold(style.cyan(m)));
  code = code.replace(/\b0x[0-9a-fA-F]+\b/g, (m) => style.yellow(m));
  code = code.replace(/@[a-zA-Z_][a-zA-Z0-9_]*/g, (m) => style.brightCyan(m));
  code = code.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*:)(?=\s|$)/g, (m, p1) => style.blue(p1));
  return code + (comment ? style.dim(comment) : "") + "\x1b[0m";
}

export function dojoLogo() {
  const W = 39;
  const boxWidth = W + 2;
  const termWidth = process.stdout.columns || 80;
  const indent = " ".repeat(Math.max(0, Math.floor((termWidth - boxWidth) / 2)));
  const border = (s) => style.bold(style.magenta(s));
  const top    = border("╔" + "═".repeat(W) + "╗");
  const bottom = border("╚" + "═".repeat(W) + "╝");
  const titleText = "H U F F   D O J O";
  const subText   = "EVM Opcode Puzzle Training";
  const titleL = Math.floor((W - titleText.length) / 2);
  const titleR = W - titleText.length - titleL;
  const subL   = Math.floor((W - subText.length) / 2);
  const subR   = W - subText.length - subL;
  const title  = style.bold(style.brightMagenta("H U F F")) + "   " + style.bold(style.brightCyan("D O J O"));
  const sub    = style.dim(subText);
  const row1 = border("║") + " ".repeat(titleL) + title + " ".repeat(titleR) + border("║");
  const row2 = border("║") + " ".repeat(subL) + sub + " ".repeat(subR) + border("║");
  return ["", indent + top, indent + row1, indent + row2, indent + bottom, ""].join("\n");
}

export function startupText() {
  const rule = "  " + style.dim("─".repeat(54));
  const info = `  ${style.bold(style.cyan(modeConfig().label + " Track"))}  ${style.dim("·  :help for commands  ·  :code to edit in-terminal")}`;
  return [rule, info, rule].join("\n");
}
