import { TWO_256, WORD_BYTES, normalizeWord, toBigInt, compactHex, wordHex, bytesFromHex, contextFromLevel } from '../utils.js';
import { collectConstants, expandMacroInvocations, extractOpcodeBody, substituteBuiltins } from './parser.js';

function tokenize(source) {
  const constants = collectConstants(source);
  const body = expandMacroInvocations(extractOpcodeBody(source), source);
  return substituteBuiltins(body, source)
    .replace(/[,\[\]()]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .map((token) => constants.get(token) || token)
    .filter(Boolean);
}

function parseProgram(source) {
  const tokens = tokenize(source);
  const labels = new Map();
  const pending = [];
  let pc = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.endsWith(":")) {
      labels.set(token.slice(0, -1), pc);
      pending.push({ op: "JUMPDEST", fromLabel: token.slice(0, -1) });
      pc += 1;
      continue;
    }
    const op = token.toUpperCase();
    if (isNumericToken(token) || token.startsWith("@")) {
      pending.push({ op: pushOpForToken(token), value: token });
      pc += 1;
      continue;
    }
    if (/^PUSH([1-9]|[12][0-9]|3[0-2])$/.test(op) || op === "PUSH") {
      const value = tokens[i + 1];
      if (!value) throw new Error(`${op} needs an immediate value`);
      pending.push({ op: op === "PUSH" ? "PUSH32" : op, value });
      i += 1;
      pc += 1;
      continue;
    }
    if (isLikelyLabelReference(token, op)) {
      pending.push({ op: "PUSH32", value: `@${token}` });
      pc += 1;
      continue;
    }
    pending.push({ op });
    pc += 1;
  }

  return pending.map((instruction) => {
    if (instruction.value?.startsWith("@")) {
      const label = instruction.value.slice(1);
      if (!labels.has(label)) throw new Error(`Unknown label @${label}`);
      return { ...instruction, value: BigInt(labels.get(label)) };
    }
    return instruction;
  });
}

function isNumericToken(token) {
  return /^0x[0-9a-fA-F]+$/.test(token) || /^[0-9]+$/.test(token);
}

function pushOpForToken(token) {
  if (token.startsWith("@")) return "PUSH32";
  const value = toBigInt(token);
  if (value === 0n) return "PUSH0";
  const byteLength = Math.max(1, Math.ceil(value.toString(16).length / 2));
  return `PUSH${Math.min(byteLength, 32)}`;
}

function isLikelyLabelReference(token, op) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return false;
  return !knownOpcode(op);
}

function knownOpcode(op) {
  return op === "STOP"
    || op === "POP"
    || op === "NOT"
    || op === "ISZERO"
    || op === "ADDRESS"
    || op === "BALANCE"
    || op === "ORIGIN"
    || op === "CALLER"
    || op === "CALLVALUE"
    || op === "GASPRICE"
    || op === "COINBASE"
    || op === "TIMESTAMP"
    || op === "NUMBER"
    || op === "PREVRANDAO"
    || op === "GASLIMIT"
    || op === "CHAINID"
    || op === "SELFBALANCE"
    || op === "BASEFEE"
    || op === "GAS"
    || op === "MSIZE"
    || op === "CALLDATASIZE"
    || op === "CALLDATALOAD"
    || op === "CALLDATACOPY"
    || op === "MSTORE"
    || op === "MSTORE8"
    || op === "MLOAD"
    || op === "SSTORE"
    || op === "SLOAD"
    || op === "JUMPDEST"
    || op === "JUMP"
    || op === "JUMPI"
    || op === "RETURN"
    || op === "REVERT"
    || op === "PUSH0"
    || /^LOG[0-4]$/.test(op)
    || ["ADD", "MUL", "SUB", "DIV", "MOD", "ADDMOD", "MULMOD", "EXP", "SIGNEXTEND", "LT", "GT", "SLT", "SGT", "EQ", "AND", "OR", "XOR", "BYTE", "SHL", "SHR", "SAR"].includes(op)
    || /^DUP([1-9]|1[0-6])$/.test(op)
    || /^SWAP([1-9]|1[0-6])$/.test(op);
}

function requireStack(state, n, op) {
  if (state.stack.length < n) {
    throw new Error(`${op} needs ${n} stack item(s), found ${state.stack.length}`);
  }
}

function pop(state, op) {
  requireStack(state, 1, op);
  return state.stack.pop();
}

function push(state, value) {
  state.stack.push(normalizeWord(value));
}

function memWriteWord(state, offset, value) {
  const bytes = bytesFromHex(wordHex(value));
  const start = Number(offset);
  for (let i = 0; i < WORD_BYTES; i += 1) {
    state.memory.set(start + i, bytes[i]);
  }
}

function memWriteByte(state, offset, value) {
  state.memory.set(Number(offset), Number(normalizeWord(value) & 0xffn));
}

function memReadWord(state, offset) {
  const start = Number(offset);
  const bytes = [];
  for (let i = 0; i < WORD_BYTES; i += 1) {
    bytes.push(state.memory.get(start + i) || 0);
  }
  return BigInt(`0x${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}

function memSlice(state, offset, size) {
  const start = Number(offset);
  const length = Number(size);
  const bytes = [];
  for (let i = 0; i < length; i += 1) {
    bytes.push(state.memory.get(start + i) || 0);
  }
  return bytes;
}

function memSize(state) {
  if (state.memory.size === 0) return 0n;
  const highest = Math.max(...state.memory.keys());
  return BigInt(Math.ceil((highest + 1) / WORD_BYTES) * WORD_BYTES);
}

function calldataLoad(bytes, offset) {
  const start = Number(offset);
  const out = [];
  for (let i = 0; i < WORD_BYTES; i += 1) {
    out.push(bytes[start + i] || 0);
  }
  return BigInt(`0x${out.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}

function storageKey(value) {
  return compactHex(value);
}

function signedWord(value) {
  const word = normalizeWord(value);
  return word >= (1n << 255n) ? word - TWO_256 : word;
}

function signextend(byteIndex, value) {
  if (byteIndex >= 32n) return normalizeWord(value);
  const bitIndex = (byteIndex * 8n) + 7n;
  const signBit = 1n << bitIndex;
  const mask = (1n << (bitIndex + 1n)) - 1n;
  const truncated = normalizeWord(value) & mask;
  return (truncated & signBit) !== 0n ? truncated | (TWO_256 - 1n - mask) : truncated;
}

function step(state, instructions) {
  if (state.pc < 0 || state.pc >= instructions.length) {
    state.stopped = true;
    return;
  }

  const instruction = instructions[state.pc];
  const op = instruction.op;
  let nextPc = state.pc + 1;

  if (op === "STOP") {
    state.stopped = true;
  } else if (op === "PUSH0") {
    push(state, 0n);
  } else if (/^PUSH([1-9]|[12][0-9]|3[0-2])$/.test(op)) {
    push(state, instruction.value);
  } else if (op === "POP") {
    pop(state, op);
  } else if (/^DUP([1-9]|1[0-6])$/.test(op)) {
    const depth = Number(op.slice(3));
    requireStack(state, depth, op);
    push(state, state.stack[state.stack.length - depth]);
  } else if (/^SWAP([1-9]|1[0-6])$/.test(op)) {
    const depth = Number(op.slice(4));
    requireStack(state, depth + 1, op);
    const top = state.stack.length - 1;
    const other = state.stack.length - 1 - depth;
    [state.stack[top], state.stack[other]] = [state.stack[other], state.stack[top]];
  } else if (["ADDMOD", "MULMOD"].includes(op)) {
    const n = pop(state, op);
    const b = pop(state, op);
    const a = pop(state, op);
    push(state, n === 0n ? 0n : (op === "ADDMOD" ? a + b : a * b) % n);
  } else if (["ADD", "MUL", "SUB", "DIV", "MOD", "EXP", "SIGNEXTEND", "LT", "GT", "SLT", "SGT", "EQ", "AND", "OR", "XOR", "BYTE", "SHL", "SHR", "SAR"].includes(op)) {
    const a = pop(state, op);
    const b = pop(state, op);
    const result = {
      ADD: () => b + a,
      MUL: () => b * a,
      SUB: () => b - a,
      DIV: () => (a === 0n ? 0n : b / a),
      MOD: () => (a === 0n ? 0n : b % a),
      EXP: () => b ** a,
      SIGNEXTEND: () => signextend(a, b),
      LT: () => (b < a ? 1n : 0n),
      GT: () => (b > a ? 1n : 0n),
      SLT: () => (signedWord(b) < signedWord(a) ? 1n : 0n),
      SGT: () => (signedWord(b) > signedWord(a) ? 1n : 0n),
      EQ: () => (b === a ? 1n : 0n),
      AND: () => b & a,
      OR: () => b | a,
      XOR: () => b ^ a,
      BYTE: () => {
        if (a >= 32n) return 0n;
        const shift = (31n - a) * 8n;
        return (b >> shift) & 0xffn;
      },
      SHL: () => (a >= 256n ? 0n : b << a),
      SHR: () => (a >= 256n ? 0n : b >> a),
      SAR: () => {
        if (a >= 256n) return signedWord(b) < 0n ? TWO_256 - 1n : 0n;
        return signedWord(b) >> a;
      }
    }[op]();
    push(state, result);
  } else if (op === "NOT") {
    push(state, TWO_256 - 1n - pop(state, op));
  } else if (op === "ISZERO") {
    push(state, pop(state, op) === 0n ? 1n : 0n);
  } else if (op === "ADDRESS") {
    push(state, state.address);
  } else if (op === "BALANCE") {
    push(state, state.balances.get(compactHex(pop(state, op))) || 0n);
  } else if (op === "ORIGIN") {
    push(state, state.origin);
  } else if (op === "CALLER") {
    push(state, state.caller);
  } else if (op === "CALLVALUE") {
    push(state, state.callvalue);
  } else if (op === "GASPRICE") {
    push(state, state.gasprice);
  } else if (op === "COINBASE") {
    push(state, state.coinbase);
  } else if (op === "TIMESTAMP") {
    push(state, state.timestamp);
  } else if (op === "NUMBER") {
    push(state, state.number);
  } else if (op === "PREVRANDAO") {
    push(state, state.prevrandao || 0n);
  } else if (op === "GASLIMIT") {
    push(state, state.gaslimit);
  } else if (op === "CHAINID") {
    push(state, state.chainid);
  } else if (op === "SELFBALANCE") {
    push(state, state.selfbalance);
  } else if (op === "BASEFEE") {
    push(state, state.basefee);
  } else if (op === "GAS") {
    push(state, 1_000_000n - BigInt(state.steps));
  } else if (op === "CALLDATASIZE") {
    push(state, BigInt(state.calldata.length));
  } else if (op === "CALLDATALOAD") {
    push(state, calldataLoad(state.calldata, pop(state, op)));
  } else if (op === "CALLDATACOPY") {
    const destOffset = pop(state, op);
    const dataOffset = pop(state, op);
    const size = pop(state, op);
    const dest = Number(destOffset);
    const src = Number(dataOffset);
    for (let i = 0; i < Number(size); i += 1) {
      state.memory.set(dest + i, state.calldata[src + i] || 0);
    }
  } else if (op === "MSTORE") {
    const offset = pop(state, op);
    const value = pop(state, op);
    memWriteWord(state, offset, value);
  } else if (op === "MSTORE8") {
    const offset = pop(state, op);
    const value = pop(state, op);
    memWriteByte(state, offset, value);
  } else if (op === "MLOAD") {
    push(state, memReadWord(state, pop(state, op)));
  } else if (op === "MSIZE") {
    push(state, memSize(state));
  } else if (op === "SSTORE") {
    const key = pop(state, op);
    const value = pop(state, op);
    state.storage.set(storageKey(key), normalizeWord(value));
  } else if (op === "SLOAD") {
    const key = pop(state, op);
    push(state, state.storage.get(storageKey(key)) || 0n);
  } else if (op === "JUMPDEST") {
    // Marker only.
  } else if (op === "JUMP") {
    const dest = Number(pop(state, op));
    assertJumpdest(instructions, dest);
    nextPc = dest;
  } else if (op === "JUMPI") {
    const dest = Number(pop(state, op));
    const condition = pop(state, op);
    if (condition !== 0n) {
      assertJumpdest(instructions, dest);
      nextPc = dest;
    }
  } else if (op === "RETURN") {
    const offset = pop(state, op);
    const size = pop(state, op);
    state.returnData = memSlice(state, offset, size);
    state.stopped = true;
  } else if (op === "REVERT") {
    const offset = pop(state, op);
    const size = pop(state, op);
    state.returnData = memSlice(state, offset, size);
    state.reverted = true;
    state.stopped = true;
  } else if (/^LOG[0-4]$/.test(op)) {
    const count = Number(op.slice(3));
    const offset = pop(state, op);
    const size = pop(state, op);
    const topics = [];
    for (let i = 0; i < count; i += 1) topics.push(wordHex(pop(state, op)));
    state.logs.push({ topics: topics.reverse(), data: returnHex(memSlice(state, offset, size)) });
  } else {
    throw new Error(`Unsupported opcode: ${op}`);
  }

  state.pc = nextPc;
  state.steps += 1;
}

function assertJumpdest(instructions, dest) {
  if (!instructions[dest] || instructions[dest].op !== "JUMPDEST") {
    throw new Error(`Bad jump destination ${dest}; jumps must land on JUMPDEST/label`);
  }
}

export function execute(level, source, maxSteps = 512) {
  const instructions = parseProgram(source);
  const state = contextFromLevel(level);
  while (!state.stopped && state.pc < instructions.length && state.steps < maxSteps) {
    step(state, instructions);
  }
  if (state.steps >= maxSteps) {
    throw new Error(`Step limit exceeded (${maxSteps}). Possible infinite loop.`);
  }
  return { instructions, state };
}

export function returnHex(bytes) {
  return `0x${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function stackHex(stack) {
  return stack.map(compactHex);
}

export function stackHexDisplay(stack) {
  return stack.map(compactHex).reverse();
}

export function storageHex(storage) {
  return Object.fromEntries(
    [...storage.entries()]
      .sort(([a], [b]) => toBigInt(a) < toBigInt(b) ? -1 : 1)
      .map(([key, value]) => [compactHex(key), compactHex(value)])
  );
}

export function compareExpected(level, state) {
  const expected = level.expect || {};
  const checks = [];

  if (expected.stack) {
    checks.push({
      label: "stack",
      pass: JSON.stringify(stackHex(state.stack)) === JSON.stringify(expected.stack.map(compactHex)),
      expected: JSON.stringify(expected.stack.map(compactHex).reverse()),
      actual: JSON.stringify(stackHexDisplay(state.stack))
    });
  }

  if (expected.returnData !== undefined) {
    checks.push({
      label: "returnData",
      pass: returnHex(state.returnData).toLowerCase() === expected.returnData.toLowerCase(),
      expected: expected.returnData,
      actual: returnHex(state.returnData)
    });
  }

  if (expected.reverted !== undefined) {
    checks.push({
      label: "reverted",
      pass: state.reverted === expected.reverted,
      expected: String(expected.reverted),
      actual: String(state.reverted)
    });
  }

  if (expected.storage) {
    const actual = storageHex(state.storage);
    const wanted = Object.fromEntries(
      Object.entries(expected.storage).map(([key, value]) => [compactHex(key), compactHex(value)])
    );
    checks.push({
      label: "storage",
      pass: JSON.stringify(actual) === JSON.stringify(wanted),
      expected: JSON.stringify(wanted),
      actual: JSON.stringify(actual)
    });
  }

  if (expected.logs) {
    checks.push({
      label: "logs",
      pass: JSON.stringify(state.logs) === JSON.stringify(expected.logs),
      expected: JSON.stringify(expected.logs),
      actual: JSON.stringify(state.logs)
    });
  }

  return {
    pass: checks.every((check) => check.pass),
    checks
  };
}

export { tokenize, parseProgram };
