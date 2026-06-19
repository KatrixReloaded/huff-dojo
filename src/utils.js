const TWO_256 = 1n << 256n;
const WORD_BYTES = 32;

function normalizeWord(value) {
  return mod256(toBigInt(value));
}

function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value !== "string") {
    throw new Error(`Cannot parse value ${String(value)}`);
  }
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  if (/^0x[0-9a-fA-F]*$/.test(trimmed)) return BigInt(trimmed || "0x0");
  if (/^[0-9]+$/.test(trimmed)) return BigInt(trimmed);
  throw new Error(`Invalid number: ${value}`);
}

function mod256(value) {
  const result = value % TWO_256;
  return result >= 0n ? result : result + TWO_256;
}

function hex(value, minBytes = 0) {
  const raw = normalizeWord(value).toString(16);
  const padded = minBytes > 0 ? raw.padStart(minBytes * 2, "0") : raw;
  return `0x${padded || "0"}`;
}

function compactHex(value) {
  return hex(value).replace(/^0x0+([0-9a-f])/, "0x$1");
}

function wordHex(value) {
  return hex(value, WORD_BYTES);
}

function bytesFromHex(inputHex) {
  const clean = (inputHex || "0x").replace(/^0x/i, "");
  const even = clean.length % 2 === 0 ? clean : `0${clean}`;
  const bytes = [];
  for (let i = 0; i < even.length; i += 2) {
    bytes.push(Number.parseInt(even.slice(i, i + 2), 16));
  }
  return bytes;
}

function calldataFromContext(context = {}) {
  if (context.calldata) return bytesFromHex(context.calldata);
  if (context.calldataWords) {
    return context.calldataWords.flatMap((word) => bytesFromHex(wordHex(word)));
  }
  return [];
}

function contextFromLevel(level) {
  const context = level.context || {};
  return {
    stack: (context.stack || []).map(normalizeWord),
    memory: new Map(),
    storage: new Map(
      Object.entries(context.storage || {}).map(([key, value]) => [
        compactHex(key),
        normalizeWord(value)
      ])
    ),
    calldata: calldataFromContext(context),
    callvalue: normalizeWord(context.callvalue || 0n),
    address: normalizeWord(context.address || "0xd0d0"),
    caller: normalizeWord(context.caller || "0xca11e2"),
    origin: normalizeWord(context.origin || "0x0123"),
    chainid: normalizeWord(context.chainid || 1n),
    gasprice: normalizeWord(context.gasprice || 0n),
    coinbase: normalizeWord(context.coinbase || 0n),
    timestamp: normalizeWord(context.timestamp || 0n),
    number: normalizeWord(context.number || 0n),
    prevrandao: normalizeWord(context.prevrandao || 0n),
    gaslimit: normalizeWord(context.gaslimit || 30_000_000n),
    basefee: normalizeWord(context.basefee || 0n),
    selfbalance: normalizeWord(context.selfbalance || 0n),
    balances: new Map(
      Object.entries(context.balances || {}).map(([key, value]) => [
        compactHex(key),
        normalizeWord(value)
      ])
    ),
    returnData: [],
    reverted: false,
    stopped: false,
    pc: 0,
    steps: 0,
    logs: []
  };
}

export {
  TWO_256,
  WORD_BYTES,
  normalizeWord,
  toBigInt,
  mod256,
  hex,
  compactHex,
  wordHex,
  bytesFromHex,
  calldataFromContext,
  contextFromLevel
};
