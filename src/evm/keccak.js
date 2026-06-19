// Ethereum ABI signatures use Keccak-256, whose padding differs from Node's SHA3-256.
const KECCAK_MASK_64 = (1n << 64n) - 1n;
const KECCAK_ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const KECCAK_ROTATIONS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14]
];

function rotateLeft64(value, shift) {
  if (shift === 0) return value & KECCAK_MASK_64;
  const amount = BigInt(shift);
  return ((value << amount) | (value >> (64n - amount))) & KECCAK_MASK_64;
}

function keccakPermutation(state) {
  for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
    const c = Array(5).fill(0n);
    const d = Array(5).fill(0n);
    const b = Array(25).fill(0n);

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) c[x] ^= state[x + (5 * y)];
    }
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotateLeft64(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) state[x + (5 * y)] ^= d[x];
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const nextX = y;
        const nextY = (2 * x + 3 * y) % 5;
        b[nextX + (5 * nextY)] = rotateLeft64(state[x + (5 * y)], KECCAK_ROTATIONS[x][y]);
      }
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + (5 * y)] = (
          b[x + (5 * y)]
          ^ ((~b[((x + 1) % 5) + (5 * y)]) & b[((x + 2) % 5) + (5 * y)])
        ) & KECCAK_MASK_64;
      }
    }
    state[0] ^= roundConstant;
  }
}

export function keccak256(text) {
  const rate = 136;
  const bytes = [...Buffer.from(text, "utf8"), 0x01];
  while ((bytes.length % rate) !== rate - 1) bytes.push(0);
  bytes.push(0x80);

  const state = Array(25).fill(0n);
  for (let offset = 0; offset < bytes.length; offset += rate) {
    for (let i = 0; i < rate; i += 1) {
      state[Math.floor(i / 8)] ^= BigInt(bytes[offset + i]) << BigInt((i % 8) * 8);
    }
    keccakPermutation(state);
  }

  const output = [];
  for (let i = 0; i < 32; i += 1) {
    output.push(Number((state[Math.floor(i / 8)] >> BigInt((i % 8) * 8)) & 0xffn));
  }
  return output.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
