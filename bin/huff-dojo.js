#!/usr/bin/env node

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

const TWO_256 = 1n << 256n;
const WORD_BYTES = 32;

const basicLevels = [
  {
    id: 1,
    title: "First Push",
    prompt: "Leave the number 42 on the stack.",
    context: {},
    expect: { stack: ["0x2a"] },
    hints: [
      "The EVM is a stack machine. PUSH instructions load constants onto the top of the stack.",
      "Hex 0x2a is decimal 42. PUSH0 pushes zero, PUSH1 pushes one byte.",
      "Try: PUSH1 0x2a"
    ],
    solution: "PUSH1 0x2a"
  },
  {
    id: 2,
    title: "Add and Subtract",
    prompt: "Compute 2 + 3 = 5 and 10 - 3 = 7. Leave both on the stack with 7 on top.",
    context: {},
    expect: { stack: ["0x05", "0x07"] },
    hints: [
      "ADD pops two items and pushes their sum. SUB pops a (top) and b (below) and pushes b - a.",
      "Push the two operands for ADD first, then run ADD. Then push the two operands for SUB.",
      "Try: PUSH1 0x02 PUSH1 0x03 ADD PUSH1 0x0a PUSH1 0x03 SUB"
    ],
    solution: "PUSH1 0x02 PUSH1 0x03 ADD PUSH1 0x0a PUSH1 0x03 SUB"
  },
  {
    id: 3,
    title: "Multiply, Divide, Remainder",
    prompt: "Compute three results: 6 × 7 = 42, 84 / 2 = 42, and 17 mod 5 = 2. Leave all three on the stack with 2 on top.",
    context: {},
    expect: { stack: ["0x2a", "0x2a", "0x02"] },
    hints: [
      "MUL, DIV, and MOD each pop two items (top is right-hand operand) and push one result.",
      "For DIV: push dividend first, divisor on top. 84 is 0x54, 2 is 0x02.",
      "Try: PUSH1 0x06 PUSH1 0x07 MUL PUSH1 0x54 PUSH1 0x02 DIV PUSH1 0x11 PUSH1 0x05 MOD"
    ],
    solution: "PUSH1 0x06 PUSH1 0x07 MUL PUSH1 0x54 PUSH1 0x02 DIV PUSH1 0x11 PUSH1 0x05 MOD"
  },
  {
    id: 4,
    title: "DUP and SWAP",
    prompt: "Starting stack is [0xbb, 0xaa] with 0xbb on top. Swap so 0xaa is on top, then duplicate it. Leave [0xaa, 0xaa, 0xbb].",
    context: { stack: ["0xaa", "0xbb"] },
    expect: { stack: ["0xbb", "0xaa", "0xaa"] },
    hints: [
      "SWAP1 exchanges the top stack item with the item directly below it.",
      "After swapping, 0xaa is on top. DUP1 then copies it.",
      "Try: SWAP1 DUP1"
    ],
    solution: "SWAP1 DUP1"
  },
  {
    id: 5,
    title: "Comparisons",
    prompt: "Starting stack is [10, 3] with 10 on top. Use LT to leave 1 if 3 is less than 10.",
    context: { stack: ["0x03", "0x0a"] },
    expect: { stack: ["0x01"] },
    hints: [
      "LT pops a (top), then b, and pushes 1 if b < a, else 0.",
      "With 10 on top (a=10) and 3 below (b=3): 3 < 10 → 1.",
      "Try: LT"
    ],
    solution: "LT"
  },
  {
    id: 6,
    title: "No Ether, Please",
    prompt: "The transaction sends 0 wei. Leave 1 on the stack if CALLVALUE is zero.",
    context: { callvalue: "0x00" },
    expect: { stack: ["0x01"] },
    hints: [
      "CALLVALUE pushes msg.value in wei.",
      "ISZERO turns 0 into 1, and any non-zero value into 0.",
      "Try: CALLVALUE ISZERO"
    ],
    solution: "CALLVALUE ISZERO"
  },
  {
    id: 7,
    title: "Mask and Set",
    prompt: "Compute 0xdeadbeef AND 0xff = 0xef (isolate the low byte). Then compute 0x7f OR 0x80 = 0xff (set bit 7). Leave both results: [0xef, 0xff] with 0xff on top.",
    context: {},
    expect: { stack: ["0xef", "0xff"] },
    hints: [
      "AND zeroes all bits not in the mask. OR sets the bits in the mask.",
      "Push 0xdeadbeef and 0xff then AND for the first result.",
      "Then push 0x7f and 0x80 and OR for the second. Try: PUSH4 0xdeadbeef PUSH1 0xff AND PUSH1 0x7f PUSH1 0x80 OR"
    ],
    solution: "PUSH4 0xdeadbeef PUSH1 0xff AND PUSH1 0x7f PUSH1 0x80 OR"
  },
  {
    id: 8,
    title: "Toggle and Invert",
    prompt: "Flip all 32 bits of 0x0f0f0f0f by XOR-ing with 0xffffffff to get 0xf0f0f0f0. Then push max uint256 (all 256 bits set) using NOT. Leave both on the stack.",
    context: {},
    expect: { stack: ["0xf0f0f0f0", "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"] },
    hints: [
      "XOR with all-ones flips every bit in that bit-width.",
      "NOT inverts all 256 bits. PUSH0 NOT gives max uint256.",
      "Try: PUSH4 0x0f0f0f0f PUSH4 0xffffffff XOR PUSH0 NOT"
    ],
    solution: "PUSH4 0x0f0f0f0f PUSH4 0xffffffff XOR PUSH0 NOT"
  },
  {
    id: 9,
    title: "Shifts and Packing",
    prompt: "Pack hi=0xdead and lo=0xbeef into one uint256 using SHL and OR: (hi << 128) | lo. Then extract hi back using SHR. Leave [0xdead, packed] with 0xdead on top.",
    context: {},
    expect: { stack: ["0xdead0000000000000000000000000000beef", "0xdead"] },
    hints: [
      "SHL pops shift amount (top) then value, pushes value << shift. SHR does the same but right.",
      "Pack: PUSH2 0xbeef, PUSH2 0xdead, PUSH1 0x80 SHL, OR. Then DUP1 the packed word.",
      "Try: PUSH2 0xbeef PUSH2 0xdead PUSH1 0x80 SHL OR DUP1 PUSH1 0x80 SHR"
    ],
    solution: "PUSH2 0xbeef PUSH2 0xdead PUSH1 0x80 SHL OR DUP1 PUSH1 0x80 SHR"
  },
  {
    id: 10,
    title: "Calldata Access",
    prompt: "Calldata holds two 32-byte words: 1 and 2. Push the total calldata length, then load the second word. Leave [2, length] with 2 on top.",
    context: { calldataWords: ["0x01", "0x02"] },
    expect: { stack: ["0x40", "0x02"] },
    hints: [
      "CALLDATASIZE pushes the byte length. Two 32-byte words = 64 bytes = 0x40.",
      "CALLDATALOAD(0x20) reads the second word starting at byte offset 32.",
      "Try: CALLDATASIZE PUSH1 0x20 CALLDATALOAD"
    ],
    solution: "CALLDATASIZE PUSH1 0x20 CALLDATALOAD"
  },
  {
    id: 11,
    title: "Memory Echo",
    prompt: "Store 0xc0de at memory offset 32, then load it back. Leave 0xc0de on the stack.",
    context: {},
    expect: { stack: ["0xc0de"] },
    hints: [
      "MSTORE pops offset (top) then value and writes 32 bytes. MLOAD pops offset and reads 32 bytes.",
      "Push the value first, then the offset, since MSTORE pops offset first.",
      "Try: PUSH2 0xc0de PUSH1 0x20 MSTORE PUSH1 0x20 MLOAD"
    ],
    solution: "PUSH2 0xc0de PUSH1 0x20 MSTORE PUSH1 0x20 MLOAD"
  },
  {
    id: 12,
    title: "Return 42",
    prompt: "Return ABI-style uint256(42): a 32-byte word containing 0x2a.",
    context: {},
    expect: {
      returnData: "0x000000000000000000000000000000000000000000000000000000000000002a"
    },
    hints: [
      "Return values come from memory, not the stack. Write with MSTORE, then RETURN a slice.",
      "MSTORE pops offset (top) then value. RETURN pops offset (top) then size.",
      "Try: PUSH1 0x2a PUSH1 0x00 MSTORE PUSH1 0x20 PUSH1 0x00 RETURN"
    ],
    solution: "PUSH1 0x2a PUSH1 0x00 MSTORE PUSH1 0x20 PUSH1 0x00 RETURN"
  },
  {
    id: 13,
    title: "Read and Write Storage",
    prompt: "Write 0xbeef to slot 0 with SSTORE. Then read from slot 7 (pre-set to 0x1337) with SLOAD. Leave 0x1337 on the stack.",
    context: { storage: { "0x07": "0x1337" } },
    expect: { stack: ["0x1337"], storage: { "0x00": "0xbeef", "0x07": "0x1337" } },
    hints: [
      "SSTORE pops key (slot) first from the top, then value. Push value first so key ends up on top.",
      "After SSTORE the stack is empty. Push the slot number then SLOAD to read.",
      "Try: PUSH2 0xbeef PUSH0 SSTORE PUSH1 0x07 SLOAD"
    ],
    solution: "PUSH2 0xbeef PUSH0 SSTORE PUSH1 0x07 SLOAD"
  },
  {
    id: 14,
    title: "Branch and Revert",
    prompt: "If CALLVALUE is non-zero, leave 0xff on the stack. Otherwise revert. Current CALLVALUE is 5 wei.",
    context: { callvalue: "0x05" },
    expect: { stack: ["0xff"], reverted: false },
    hints: [
      "JUMPI pops destination (top) then condition. If condition is non-zero, it jumps.",
      "A non-zero CALLVALUE is truthy, so CALLVALUE PUSH @paid JUMPI branches when ether is sent.",
      "Try: CALLVALUE PUSH @paid JUMPI PUSH0 PUSH0 REVERT paid: PUSH1 0xff"
    ],
    solution: "CALLVALUE PUSH @paid JUMPI PUSH0 PUSH0 REVERT paid: PUSH1 0xff"
  },
  {
    id: 15,
    title: "Counted Loop with JUMP",
    prompt: "Build a loop that starts at 0, increments to 3, and leaves 3 on the stack. Use JUMPI to exit and JUMP for the loop tail.",
    context: {},
    expect: { stack: ["0x03"] },
    hints: [
      "Keep the counter on the stack. Each pass adds 1, then compares a duplicate with 3.",
      "JUMPI can branch to done when the counter equals 3. Otherwise push the loop label and JUMP unconditionally.",
      "Try: PUSH0 loop: PUSH1 0x01 ADD DUP1 PUSH1 0x03 EQ PUSH @done JUMPI PUSH @loop JUMP done:"
    ],
    solution: "PUSH0 loop: PUSH1 0x01 ADD DUP1 PUSH1 0x03 EQ PUSH @done JUMPI PUSH @loop JUMP done:"
  },
  {
    id: 16,
    title: "Huff Return",
    prompt: "Use a Huff-style MAIN macro to return uint256(0xdeadbeef).",
    context: {},
    expect: {
      returnData: "0x00000000000000000000000000000000000000000000000000000000deadbeef"
    },
    hints: [
      "Huff contracts start execution in MAIN: #define macro MAIN() = takes(0) returns(0) { ... }",
      "Inside the braces, write opcode mnemonics in lowercase.",
      "Try: #define macro MAIN() = takes(0) returns(0) { 0xdeadbeef 0x00 mstore 0x20 0x00 return }"
    ],
    solution: "#define macro MAIN() = takes(0) returns(0) { PUSH4 0xdeadbeef PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN }"
  },
  {
    id: 17,
    title: "Calling a Helper Macro",
    prompt: "Define DOUBLE() as a helper macro that takes one stack item and returns its doubled value. Call it from MAIN with 21 and leave 42 on the stack.",
    context: {},
    expect: { stack: ["0x2a"] },
    hints: [
      "A helper macro is declared separately from MAIN and invoked by name with parentheses.",
      "DOUBLE takes one item and returns one item, so declare takes(1) returns(1). DUP1 ADD doubles the input.",
      "Try a full file with #define macro DOUBLE() = takes(1) returns(1) { dup1 add }, then call 0x15 DOUBLE() inside MAIN."
    ],
    solution: "#define macro DOUBLE() = takes(1) returns(1) {\n  dup1 add\n}\n#define macro MAIN() = takes(0) returns(0) {\n  0x15 DOUBLE()\n}"
  },
  {
    id: 18,
    title: "Selector Spotter",
    prompt: "Calldata starts with selector 0x12345678. Leave 1 on the stack if it matches.",
    context: {
      calldata: "0x1234567800000000000000000000000000000000000000000000000000000000"
    },
    expect: { stack: ["0x01"] },
    hints: [
      "CALLDATALOAD(0) loads 32 bytes — the selector sits in the top 4 bytes of the word.",
      "SHR by 224 bits (0xe0) moves the selector down to the low 4 bytes.",
      "Compare with PUSH4 0x12345678 EQ. Try: PUSH0 CALLDATALOAD PUSH1 0xe0 SHR PUSH4 0x12345678 EQ"
    ],
    solution: "PUSH0 CALLDATALOAD PUSH1 0xe0 SHR PUSH4 0x12345678 EQ"
  },
  {
    id: 19,
    title: "Modular Arithmetic and Powers",
    prompt: "Compute (5 + 8) mod 7 = 6, (6 * 7) mod 5 = 2, 2^8 = 256, and sign-extend byte 0 of 0x80. Leave all four results with the sign-extended value on top.",
    context: {},
    expect: { stack: ["0x06", "0x02", "0x0100", "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff80"] },
    hints: [
      "ADDMOD and MULMOD take three stack items: a, b, then modulus on top.",
      "EXP uses base below and exponent on top. SIGNEXTEND uses value below and byte index on top.",
      "Try: PUSH1 0x05 PUSH1 0x08 PUSH1 0x07 ADDMOD PUSH1 0x06 PUSH1 0x07 PUSH1 0x05 MULMOD PUSH1 0x02 PUSH1 0x08 EXP PUSH1 0x80 PUSH0 SIGNEXTEND"
    ],
    solution: "PUSH1 0x05 PUSH1 0x08 PUSH1 0x07 ADDMOD PUSH1 0x06 PUSH1 0x07 PUSH1 0x05 MULMOD PUSH1 0x02 PUSH1 0x08 EXP PUSH1 0x80 PUSH0 SIGNEXTEND"
  },
  {
    id: 20,
    title: "Signed Comparisons and SAR",
    prompt: "Use signed and unsigned comparisons on -1 and 1, then arithmetic-shift -1 right by 255. Leave [signedLess, unsignedLess, shifted].",
    context: {},
    expect: { stack: ["0x01", "0x00", "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"] },
    hints: [
      "PUSH0 NOT gives all ones, which is uint256 max but also signed -1.",
      "SLT/SGT interpret values as signed two's-complement; LT/GT are unsigned.",
      "Try: PUSH0 NOT PUSH1 0x01 SLT PUSH0 NOT PUSH1 0x01 LT PUSH0 NOT PUSH1 0xff SAR"
    ],
    solution: "PUSH0 NOT PUSH1 0x01 SLT PUSH0 NOT PUSH1 0x01 LT PUSH0 NOT PUSH1 0xff SAR"
  },
  {
    id: 21,
    title: "POP, DUP, and SWAP Cleanup",
    prompt: "Starting stack is [0x11, 0x22, 0x33] with 0x33 on top. Drop 0x33, duplicate 0x11, then leave [0x11, 0x11, 0x22].",
    context: { stack: ["0x11", "0x22", "0x33"] },
    expect: { stack: ["0x11", "0x11", "0x22"] },
    hints: [
      "POP removes the top stack item.",
      "After POP, DUP2 copies the lower item; SWAP1 can put the copy below 0x22.",
      "Try: POP DUP2 SWAP1"
    ],
    solution: "POP DUP2 SWAP1"
  },
  {
    id: 22,
    title: "BYTE Extraction",
    prompt: "From the word 0xabcdef, extract byte index 29 (0xab), 30 (0xcd), and 31 (0xef). Leave the three bytes with 0xef on top.",
    context: {},
    expect: { stack: ["0xab", "0xcd", "0xef"] },
    hints: [
      "BYTE pops index on top and word below. Index 0 is the most-significant byte of a 32-byte word.",
      "A short literal is left-padded to 32 bytes, so 0xabcdef occupies byte indexes 29, 30, and 31.",
      "Try: PUSH3 0xabcdef PUSH1 0x1d BYTE PUSH3 0xabcdef PUSH1 0x1e BYTE PUSH3 0xabcdef PUSH1 0x1f BYTE"
    ],
    solution: "PUSH3 0xabcdef PUSH1 0x1d BYTE PUSH3 0xabcdef PUSH1 0x1e BYTE PUSH3 0xabcdef PUSH1 0x1f BYTE"
  },
  {
    id: 23,
    title: "Call Context",
    prompt: "Push this contract's ADDRESS, the CALLER, the ORIGIN, and CALLVALUE. Leave them in that order with CALLVALUE on top.",
    context: { address: "0xd0d0", caller: "0xbeef", origin: "0xabcd", callvalue: "0x10" },
    expect: { stack: ["0xd0d0", "0xbeef", "0xabcd", "0x10"] },
    hints: [
      "ADDRESS is the current contract. CALLER is msg.sender. ORIGIN is tx.origin.",
      "CALLVALUE is msg.value in wei.",
      "Try: ADDRESS CALLER ORIGIN CALLVALUE"
    ],
    solution: "ADDRESS CALLER ORIGIN CALLVALUE"
  },
  {
    id: 24,
    title: "Block and Gas Context",
    prompt: "Read CHAINID, TIMESTAMP, NUMBER, BASEFEE, GASLIMIT, GASPRICE, COINBASE, SELFBALANCE, PREVRANDAO, and GAS. Leave them in that order.",
    context: {
      chainid: "0x01",
      timestamp: "0x65",
      number: "0x0a",
      basefee: "0x07",
      gaslimit: "0x1c9c380",
      gasprice: "0x03",
      coinbase: "0xc0",
      selfbalance: "0x64",
      prevrandao: "0x77"
    },
    expect: { stack: ["0x01", "0x65", "0x0a", "0x07", "0x1c9c380", "0x03", "0xc0", "0x64", "0x77", "0xf4237"] },
    hints: [
      "These opcodes read transaction, block, contract-balance, and remaining-gas context.",
      "They consume no stack items. GAS is dynamic, so put it last; this simulator reports one million minus the steps already executed.",
      "Try: CHAINID TIMESTAMP NUMBER BASEFEE GASLIMIT GASPRICE COINBASE SELFBALANCE PREVRANDAO GAS"
    ],
    solution: "CHAINID TIMESTAMP NUMBER BASEFEE GASLIMIT GASPRICE COINBASE SELFBALANCE PREVRANDAO GAS"
  },
  {
    id: 25,
    title: "CALLDATACOPY",
    prompt: "Calldata is 7 bytes: 0x12345678abcdef. Copy all calldata to memory offset 0, then MLOAD offset 0. Leave the copied word on the stack.",
    context: { calldata: "0x12345678abcdef" },
    expect: { stack: ["0x12345678abcdef00000000000000000000000000000000000000000000000000"] },
    hints: [
      "CALLDATACOPY pops destination offset, calldata offset, then size.",
      "Copied bytes keep their byte order in memory; MLOAD reads a 32-byte word from memory.",
      "Try: PUSH1 0x07 PUSH0 PUSH0 CALLDATACOPY PUSH0 MLOAD"
    ],
    solution: "PUSH1 0x07 PUSH0 PUSH0 CALLDATACOPY PUSH0 MLOAD"
  },
  {
    id: 26,
    title: "MSTORE8 and MSIZE",
    prompt: "Store the byte 0xab at memory offset 0 with MSTORE8, MLOAD it back as a word, then push MSIZE. Leave [word, 0x20].",
    context: {},
    expect: { stack: ["0xab00000000000000000000000000000000000000000000000000000000000000", "0x20"] },
    hints: [
      "MSTORE writes 32 bytes, but MSTORE8 writes only the low byte of the value.",
      "MSIZE reports the active memory size rounded up to a 32-byte word.",
      "Try: PUSH1 0xab PUSH0 MSTORE8 PUSH0 MLOAD MSIZE"
    ],
    solution: "PUSH1 0xab PUSH0 MSTORE8 PUSH0 MLOAD MSIZE"
  },
  {
    id: 27,
    title: "LOG Opcodes",
    prompt: "Store 0xbeef at memory offset 0, then emit LOG1 with topic 0x99 and 32 bytes of data from memory offset 0.",
    context: {},
    expect: {
      logs: [{
        topics: ["0x0000000000000000000000000000000000000000000000000000000000000099"],
        data: "0x000000000000000000000000000000000000000000000000000000000000beef"
      }]
    },
    hints: [
      "LOG1 pops memory offset, memory size, then one topic.",
      "Push the topic first, then size and offset so offset is on top.",
      "Try: PUSH2 0xbeef PUSH0 MSTORE PUSH1 0x99 PUSH1 0x20 PUSH0 LOG1"
    ],
    solution: "PUSH2 0xbeef PUSH0 MSTORE PUSH1 0x99 PUSH1 0x20 PUSH0 LOG1"
  },
  {
    id: 28,
    title: "ABI-Compatible Events",
    prompt: "Declare event Answer(uint256), store 42 as its data, and emit LOG1 using __EVENT_HASH(Answer) as topic zero.",
    context: {},
    expect: {
      logs: [{
        topics: ["0xe1cca926219c5c0c4684e42406e9dd0d82c5ee506e35dea074e251b1a5de0706"],
        data: "0x000000000000000000000000000000000000000000000000000000000000002a"
      }]
    },
    hints: [
      "Declare #define event Answer(uint256) outside MAIN.",
      "__EVENT_HASH(Answer) pushes keccak256(\"Answer(uint256)\"), the ABI topic-zero value.",
      "Inside MAIN: store 0x2a at memory 0, then push __EVENT_HASH(Answer), size 0x20, offset 0, and LOG1."
    ],
    solution: "#define event Answer(uint256)\n#define macro MAIN() = takes(0) returns(0) {\n  0x2a 0x00 mstore\n  __EVENT_HASH(Answer) 0x20 0x00 log1\n}"
  },
  {
    id: 29,
    title: "Custom Errors with __ERROR",
    prompt: "Declare Unauthorized() and revert with its 4-byte ABI selector generated by __ERROR.",
    context: {},
    expect: { returnData: "0x82b42900", reverted: true },
    hints: [
      "Declare #define error Unauthorized() outside MAIN.",
      "__ERROR(Unauthorized) produces the selector left-aligned in a 32-byte word, ready for MSTORE.",
      "Store it at memory 0, then REVERT 4 bytes from offset 0."
    ],
    solution: "#define error Unauthorized()\n#define macro MAIN() = takes(0) returns(0) {\n  __ERROR(Unauthorized) 0x00 mstore\n  0x04 0x00 revert\n}"
  },
  {
    id: 30,
    title: "Huff Constants",
    prompt: "Define a Huff constant named ANSWER equal to 0x2a, then push [ANSWER]. Leave 42 on the stack.",
    context: {},
    expect: { stack: ["0x2a"] },
    hints: [
      "Huff constants are compile-time values and are pushed with bracket notation.",
      "Use #define constant ANSWER = 0x2a above MAIN, then [ANSWER] inside MAIN.",
      "Try a full file with: #define constant ANSWER = 0x2a ... MAIN { [ANSWER] }"
    ],
    solution: "#define constant ANSWER = 0x2a\n#define macro MAIN() = takes(0) returns(0) {\n  [ANSWER]\n}"
  },
  {
    id: 31,
    title: "Function Interfaces and __FUNC_SIG",
    prompt: "Declare addTwo(uint256,uint256), extract calldata's selector, and compare it with __FUNC_SIG(addTwo). Leave 1 on match.",
    context: { calldata: "0x0f52d66e00000000000000000000000000000000000000000000000000000000" },
    expect: { stack: ["0x01"] },
    hints: [
      "Huff function declarations generate ABI metadata and can be used by __FUNC_SIG.",
      "Extract the first 4 calldata bytes the same way as the selector lesson.",
      "Try a full file with #define function addTwo(uint256,uint256) view returns(uint256), then compare __FUNC_SIG(addTwo)."
    ],
    solution: "#define function addTwo(uint256,uint256) view returns(uint256)\n#define macro MAIN() = takes(0) returns(0) {\n  0x00 calldataload 0xe0 shr __FUNC_SIG(addTwo) eq\n}"
  },
  {
    id: 32,
    title: "Bytes and Padding Builtins",
    prompt: "Use Huff constants with __BYTES(\"hi\") and __RIGHTPAD(0x1234). Push both constants with the padded word on top.",
    context: {},
    expect: { stack: ["0x6869", "0x1234000000000000000000000000000000000000000000000000000000000000"] },
    hints: [
      "__BYTES turns a short string into its UTF-8 bytes.",
      "__RIGHTPAD pads bytes to the right, which is useful when returning byte strings.",
      "Try defining HI = __BYTES(\"hi\") and PADDED = __RIGHTPAD(0x1234), then push [HI] [PADDED]."
    ],
    solution: "#define constant HI = __BYTES(\"hi\")\n#define constant PADDED = __RIGHTPAD(0x1234)\n#define macro MAIN() = takes(0) returns(0) {\n  [HI] [PADDED]\n}"
  },
  {
    id: 33,
    title: "FREE_STORAGE_POINTER",
    prompt: "Use a FREE_STORAGE_POINTER constant named SLOT. Store 0x2a at [SLOT], then load [SLOT]. Leave 42 on the stack.",
    context: {},
    expect: { stack: ["0x2a"], storage: { "0x00": "0x2a" } },
    hints: [
      "FREE_STORAGE_POINTER() allocates an unused storage slot at compile time.",
      "In this small contract, the first free storage pointer is slot 0.",
      "Try: #define constant SLOT = FREE_STORAGE_POINTER() ... PUSH1 0x2a [SLOT] SSTORE [SLOT] SLOAD"
    ],
    solution: "#define constant SLOT = FREE_STORAGE_POINTER()\n#define macro MAIN() = takes(0) returns(0) {\n  0x2a [SLOT] sstore [SLOT] sload\n}"
  }
];

const advancedLevels = [
  {
    id: 1,
    title: "Function Gate",
    prompt: "Calldata starts with selector 0xdeadbeef. If it matches, return uint256(0x42). Otherwise revert.",
    context: {
      calldata: "0xdeadbeef00000000000000000000000000000000000000000000000000000000"
    },
    expect: {
      returnData: "0x0000000000000000000000000000000000000000000000000000000000000042"
    },
    hints: [
      "Extract the selector: PUSH0 CALLDATALOAD PUSH1 0xe0 SHR.",
      "Compare with EQ and branch: PUSH4 0xdeadbeef EQ PUSH @fn JUMPI, then REVERT as fallback.",
      "In the fn branch: store 0x42 in memory and RETURN 32 bytes."
    ],
    solution: "PUSH0 CALLDATALOAD PUSH1 0xe0 SHR PUSH4 0xdeadbeef EQ PUSH @fn JUMPI PUSH0 PUSH0 REVERT fn: PUSH1 0x42 PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
  },
  {
    id: 2,
    title: "Two-Function Router",
    prompt: "Route two selectors: 0xaaaabbbb → return 0x0a, 0xccccdddd → return 0x0b, anything else → revert. Calldata has 0xaaaabbbb.",
    context: {
      calldata: "0xaaaabbbb00000000000000000000000000000000000000000000000000000000"
    },
    expect: {
      returnData: "0x000000000000000000000000000000000000000000000000000000000000000a"
    },
    hints: [
      "Extract the selector once, then DUP1 before each comparison so the selector survives a failed check.",
      "Each function branch must POP the leftover selector copy before building its return value.",
      "Chain: extract → DUP1 EQ JUMPI → DUP1 EQ JUMPI → REVERT → label: POP MSTORE RETURN"
    ],
    solution: "PUSH0 CALLDATALOAD PUSH1 0xe0 SHR DUP1 PUSH4 0xaaaabbbb EQ PUSH @getA JUMPI DUP1 PUSH4 0xccccdddd EQ PUSH @getB JUMPI PUSH0 PUSH0 REVERT getA: POP PUSH1 0x0a PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN getB: POP PUSH1 0x0b PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
  },
  {
    id: 3,
    title: "Safe Division",
    prompt: "Calldata holds a dividend (offset 0) and divisor (offset 32). Return dividend / divisor as a 32-byte ABI word. Revert if divisor is zero. Calldata: [80, 4] → returns 20.",
    context: { calldataWords: ["0x50", "0x04"] },
    expect: { returnData: "0x0000000000000000000000000000000000000000000000000000000000000014" },
    hints: [
      "Load the divisor from offset 32 first. DUP it, then ISZERO + JUMPI to a revert label if zero.",
      "After the zero-check, load dividend at offset 0, then SWAP1 so divisor is on top for DIV. DIV: a=top=divisor, b=below=dividend, result=b/a.",
      "Try: PUSH1 0x20 CALLDATALOAD DUP1 ISZERO PUSH @bad JUMPI PUSH0 CALLDATALOAD SWAP1 DIV PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN bad: PUSH0 PUSH0 REVERT"
    ],
    solution: "PUSH1 0x20 CALLDATALOAD DUP1 ISZERO PUSH @bad JUMPI PUSH0 CALLDATALOAD SWAP1 DIV PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN bad: PUSH0 PUSH0 REVERT"
  },
  {
    id: 4,
    title: "ABI Add Two",
    prompt: "Calldata holds two uint256 words: 2 and 3. Return their sum as a 32-byte ABI word.",
    context: { calldataWords: ["0x02", "0x03"] },
    expect: { returnData: "0x0000000000000000000000000000000000000000000000000000000000000005" },
    hints: [
      "Load offset 0 and offset 0x20, ADD, store the result at memory offset 0.",
      "RETURN 0x20 bytes from memory offset 0.",
      "Try: PUSH0 CALLDATALOAD PUSH1 0x20 CALLDATALOAD ADD PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
    ],
    solution: "PUSH0 CALLDATALOAD PUSH1 0x20 CALLDATALOAD ADD PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
  },
  {
    id: 5,
    title: "Owner Gate",
    prompt: "Only caller 0x1111 is authorized. Current CALLER is 0x1111. Return uint256(1) if authorized, otherwise revert.",
    context: { caller: "0x1111" },
    expect: { returnData: "0x0000000000000000000000000000000000000000000000000000000000000001", reverted: false },
    hints: [
      "Compare CALLER with the owner constant, then JUMPI to the success label.",
      "Put REVERT before the success branch so failed calls stop immediately.",
      "Try: CALLER PUSH2 0x1111 EQ PUSH @ok JUMPI PUSH0 PUSH0 REVERT ok: PUSH1 0x01 PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
    ],
    solution: "CALLER PUSH2 0x1111 EQ PUSH @ok JUMPI PUSH0 PUSH0 REVERT ok: PUSH1 0x01 PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
  },
  {
    id: 6,
    title: "Counter Increment",
    prompt: "Storage slot 0 starts at 41. Increment it, persist the new value, and return the new value.",
    context: { storage: { "0x00": "0x29" } },
    expect: {
      returnData: "0x000000000000000000000000000000000000000000000000000000000000002a",
      storage: { "0x00": "0x2a" }
    },
    hints: [
      "SLOAD slot 0, ADD 1, DUP the result before SSTORE consumes value and slot.",
      "After SSTORE, keep the duplicate value for MSTORE and RETURN.",
      "Try: PUSH0 SLOAD PUSH1 0x01 ADD DUP1 PUSH0 SSTORE PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
    ],
    solution: "PUSH0 SLOAD PUSH1 0x01 ADD DUP1 PUSH0 SSTORE PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
  },
  {
    id: 7,
    title: "Deposit Event",
    prompt: "CALLVALUE is 5 and CALLER is 0xbeef. Emit LOG1 topic 0xdd with CALLER stored as the 32-byte data word.",
    context: { caller: "0xbeef", callvalue: "0x05" },
    expect: {
      logs: [{
        topics: ["0x00000000000000000000000000000000000000000000000000000000000000dd"],
        data: "0x000000000000000000000000000000000000000000000000000000000000beef"
      }]
    },
    hints: [
      "CALLER PUSH0 MSTORE writes the sender as event data.",
      "LOG1 then needs topic, size, offset pushed so offset is on top.",
      "Try: CALLER PUSH0 MSTORE PUSH1 0xdd PUSH1 0x20 PUSH0 LOG1"
    ],
    solution: "CALLER PUSH0 MSTORE PUSH1 0xdd PUSH1 0x20 PUSH0 LOG1"
  },
  {
    id: 8,
    title: "Echo Calldata",
    prompt: "Return the entire calldata byte-for-byte. Calldata is 0xabcdef.",
    context: { calldata: "0xabcdef" },
    expect: { returnData: "0xabcdef" },
    hints: [
      "CALLDATASIZE tells you how many bytes to copy and return.",
      "Copy calldata to memory offset 0, then RETURN the same size from memory offset 0.",
      "Try: CALLDATASIZE PUSH0 PUSH0 CALLDATACOPY CALLDATASIZE PUSH0 RETURN"
    ],
    solution: "CALLDATASIZE PUSH0 PUSH0 CALLDATACOPY CALLDATASIZE PUSH0 RETURN"
  },
  {
    id: 9,
    title: "Two-Word Return",
    prompt: "Calldata holds 4 and 5. Return two ABI words: their sum (9) and product (20).",
    context: { calldataWords: ["0x04", "0x05"] },
    expect: {
      returnData: "0x00000000000000000000000000000000000000000000000000000000000000090000000000000000000000000000000000000000000000000000000000000014"
    },
    hints: [
      "Load both inputs once, duplicate them for ADD, then use the originals for MUL.",
      "Store sum at memory offset 0 and product at memory offset 0x20.",
      "Try: PUSH0 CALLDATALOAD PUSH1 0x20 CALLDATALOAD DUP2 DUP2 ADD PUSH0 MSTORE MUL PUSH1 0x20 MSTORE PUSH1 0x40 PUSH0 RETURN"
    ],
    solution: "PUSH0 CALLDATALOAD PUSH1 0x20 CALLDATALOAD DUP2 DUP2 ADD PUSH0 MSTORE MUL PUSH1 0x20 MSTORE PUSH1 0x40 PUSH0 RETURN"
  },
  {
    id: 10,
    title: "Packed Flag Update",
    prompt: "Storage slot 0 is 0x1200. Set the low byte to 0xff while preserving the high byte, persist it, and return the packed word.",
    context: { storage: { "0x00": "0x1200" } },
    expect: {
      returnData: "0x00000000000000000000000000000000000000000000000000000000000012ff",
      storage: { "0x00": "0x12ff" }
    },
    hints: [
      "Mask away the low byte with AND 0xff00, then OR in 0xff.",
      "DUP the packed value before SSTORE consumes it.",
      "Try: PUSH0 SLOAD PUSH2 0xff00 AND PUSH1 0xff OR DUP1 PUSH0 SSTORE PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
    ],
    solution: "PUSH0 SLOAD PUSH2 0xff00 AND PUSH1 0xff OR DUP1 PUSH0 SSTORE PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
  },
  {
    id: 11,
    title: "Max of Two",
    prompt: "Calldata holds 7 and 11. Return the larger value.",
    context: { calldataWords: ["0x07", "0x0b"] },
    expect: { returnData: "0x000000000000000000000000000000000000000000000000000000000000000b" },
    hints: [
      "Load a and b, duplicate them, and compare a < b.",
      "If true, jump to the branch that returns b; otherwise return a.",
      "Try: PUSH0 CALLDATALOAD PUSH1 0x20 CALLDATALOAD DUP2 DUP2 LT PUSH @bigger JUMPI POP PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN bigger: SWAP1 POP PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
    ],
    solution: "PUSH0 CALLDATALOAD PUSH1 0x20 CALLDATALOAD DUP2 DUP2 LT PUSH @bigger JUMPI POP PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN bigger: SWAP1 POP PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN"
  },
  {
    id: 12,
    title: "Custom Error Revert",
    prompt: "Declare Unauthorized() and use __ERROR to revert with its ABI custom-error selector.",
    context: {},
    expect: { returnData: "0x82b42900", reverted: true },
    hints: [
      "Declare #define error Unauthorized() outside MAIN.",
      "__ERROR(Unauthorized) produces the selector left-aligned for MSTORE.",
      "Store it at offset 0, then REVERT 4 bytes from offset 0."
    ],
    solution: "#define error Unauthorized()\n#define macro MAIN() = takes(0) returns(0) {\n  __ERROR(Unauthorized) 0x00 mstore\n  0x04 0x00 revert\n}"
  }
];

const opcodeHelp = [
  "Stack/constants: PUSH0, PUSH1-PUSH32, POP, DUP1-DUP16, SWAP1-SWAP16",
  "Math/logic: ADD, MUL, SUB, DIV, MOD, ADDMOD, MULMOD, EXP, SIGNEXTEND",
  "Comparisons/bits: LT, GT, SLT, SGT, EQ, ISZERO, AND, OR, XOR, NOT, BYTE, SHL, SHR, SAR",
  "Context/block: ADDRESS, BALANCE, ORIGIN, CALLER, CALLVALUE, GASPRICE, COINBASE, TIMESTAMP, NUMBER, GASLIMIT, CHAINID, SELFBALANCE, BASEFEE, GAS",
  "Data: CALLDATALOAD, CALLDATASIZE, CALLDATACOPY, MLOAD, MSTORE, MSTORE8, MSIZE, SLOAD, SSTORE",
  "Flow/end: JUMP, JUMPI, JUMPDEST, STOP, RETURN, REVERT",
  "Logs: LOG0, LOG1, LOG2, LOG3, LOG4",
  "Labels: use label: and PUSH @label"
];

const basicLessons = {
  1: [
    "Lesson 1: The Stack and PUSH",
    "",
    "The EVM is a stack machine — it has no registers, only a last-in-first-out (LIFO)",
    "stack of 256-bit words. Every opcode either reads from, writes to, or rearranges it.",
    "",
    "PUSH instructions load a constant onto the top of the stack. There are 33 variants:",
    "  PUSH0        — pushes the literal zero (compact opcode, no extra bytes in bytecode)",
    "  PUSH1–PUSH32 — embed 1 to 32 bytes of immediate data directly in the bytecode",
    "",
    "In Huff you write hex literals like 0x2a directly and the compiler picks the",
    "smallest PUSH that fits. So 0x2a compiles to PUSH1 0x2a.",
    "",
    "For this level: push the number 42, which is 0x2a in hex."
  ],
  2: [
    "Lesson 2: ADD and SUB — the additive family",
    "",
    "ADD pops two items, adds them modulo 2^256, and pushes the result.",
    "All EVM arithmetic wraps silently — no overflow exception ever fires.",
    "ADD is symmetric: order doesn't matter for addition.",
    "",
    "SUB pops a (the top item), then b (the item below), and pushes b - a.",
    "The top item is the right-hand side — it is subtracted FROM the item below.",
    "",
    "  PUSH1 0x0a  // 10 goes in first (sits below)",
    "  PUSH1 0x03  // 3 on top (the subtrahend)",
    "  SUB         // pops 3 (a) and 10 (b) → pushes 10 - 3 = 7",
    "",
    "Pushing 3 then 10 instead would give 3 - 10, which wraps to a huge number.",
    "Getting SUB's order backwards is one of the most common EVM bugs.",
    "",
    "For this level: compute 2 + 3 = 5 and 10 - 3 = 7, leaving [5, 7]."
  ],
  3: [
    "Lesson 3: MUL, DIV, and MOD — the multiplicative family",
    "",
    "All three opcodes pop two items (top = right-hand operand) and push one result.",
    "",
    "MUL — multiplies and wraps mod 2^256. Symmetric: order doesn't matter.",
    "  PUSH1 0x06 PUSH1 0x07 MUL  → 42",
    "",
    "DIV — unsigned integer division, truncated. Top item is the divisor.",
    "  PUSH1 0x54 PUSH1 0x02 DIV  → 84 / 2 = 42",
    "  Division by zero silently returns 0 — no exception thrown.",
    "",
    "MOD — remainder after division. Top item is the modulus.",
    "  PUSH1 0x11 PUSH1 0x05 MOD  → 17 mod 5 = 2",
    "  Modulo by zero also silently returns 0.",
    "",
    "For this level: compute 6×7, 84/2, and 17 mod 5, leaving all three on the stack."
  ],
  4: [
    "Lesson 4: DUP and SWAP — rearranging the stack",
    "",
    "DUP1–DUP16 copy a stack item and push the copy on top.",
    "  DUP1 — copies the top item        DUP2 — copies one below the top",
    "  DUP3 — copies two below … and so on up to DUP16",
    "The originals are never removed — DUP only adds a copy.",
    "",
    "SWAP1–SWAP16 exchange the top item with a deeper item.",
    "  SWAP1 — top ↔ depth 1 (item directly below)",
    "  SWAP2 — top ↔ depth 2  … and so on up to SWAP16",
    "SWAP does not add or remove items — it only reorders.",
    "",
    "Together, DUP and SWAP let you route values to wherever an opcode needs them.",
    "SUB needs its operands in a specific order, MSTORE needs offset on top — SWAPs fix that.",
    "",
    "For this level: swap 0xbb and 0xaa so 0xaa is on top, then DUP it."
  ],
  5: [
    "Lesson 5: LT, GT, EQ, ISZERO — comparison opcodes",
    "",
    "All comparison opcodes pop two items and push 0 or 1.",
    "",
    "LT  — pushes 1 if b < a  (a = top, b = below). Unsigned comparison.",
    "GT  — pushes 1 if b > a  (a = top, b = below). Unsigned comparison.",
    "EQ  — pushes 1 if b == a (both items equal).",
    "ISZERO — pops one item; pushes 1 if it was zero, 0 otherwise.",
    "",
    "All four treat values as unsigned 256-bit integers.",
    "There are also signed versions: SLT (signed less-than) and SGT (signed greater-than),",
    "which interpret values as two's complement.",
    "",
    "Example with stack [3, 10] (10 on top):",
    "  LT → a=10, b=3 → 3 < 10 → 1    GT → a=10, b=3 → 3 > 10 → 0",
    "",
    "For this level: use LT to confirm that 3 is less than 10."
  ],
  6: [
    "Lesson 6: CALLVALUE and ISZERO — checking msg.value",
    "",
    "CALLVALUE pushes the amount of ether (in wei) attached to the current call.",
    "It is the EVM equivalent of Solidity's msg.value.",
    "",
    "ISZERO pops one item and pushes 1 if it was zero, 0 otherwise.",
    "It is the universal 'is this falsy?' opcode.",
    "",
    "CALLVALUE ISZERO leaves 1 when no ether was sent and 0 otherwise —",
    "the same logic as require(msg.value == 0) in Solidity.",
    "",
    "CALLVALUE can also be used directly as a condition for JUMPI, since any",
    "non-zero value is truthy — you'll see that pattern in a later level.",
    "",
    "For this level: confirm CALLVALUE is zero by leaving 1 on the stack."
  ],
  7: [
    "Lesson 7: AND and OR — masking and setting bits",
    "",
    "AND pops two items and pushes their bitwise AND.",
    "  Each bit is 1 only when both input bits are 1.",
    "  Used for masking: AND with 0xff keeps only the lowest 8 bits.",
    "  0xdeadbeef AND 0xff = 0xef   (zeroes everything above the low byte)",
    "",
    "OR pops two items and pushes their bitwise OR.",
    "  A bit is 1 when either input bit is 1.",
    "  Used for setting bits: OR with 0x80 turns bit 7 on without touching others.",
    "  0x7f OR 0x80 = 0xff",
    "",
    "These two opcodes are the foundation of packed storage in Huff:",
    "AND reads a field out (masks off the rest), OR writes it back (sets the bits).",
    "",
    "For this level: isolate 0xef with AND, then produce 0xff with OR."
  ],
  8: [
    "Lesson 8: XOR and NOT — toggling and inverting",
    "",
    "XOR pops two items and pushes their bitwise exclusive-OR.",
    "  A bit is 1 only when the two inputs differ.",
    "  XOR with 1 flips a bit. XOR with 0 leaves it unchanged.",
    "  XOR with all-ones (e.g. 0xffffffff) flips every bit in that width.",
    "  x XOR x = 0 — a value XORed with itself is always zero.",
    "",
    "NOT pops one item and flips all 256 bits.",
    "  NOT x = (2^256 - 1) - x   (one's complement in 256 bits)",
    "  NOT of zero = max uint256 = 0xfff...fff",
    "  PUSH0 NOT is the cheapest way to get max uint256 on the stack.",
    "",
    "For this level: flip 0x0f0f0f0f with XOR, then push max uint256 with NOT."
  ],
  9: [
    "Lesson 9: SHL and SHR — shifts and bit-packing",
    "",
    "SHL pops a shift amount (top), then a value, and pushes value << shift.",
    "  Shifting left by N multiplies by 2^N. Bits shifted past bit 255 are discarded.",
    "",
    "SHR pops a shift amount (top), then a value, and pushes value >> shift (logical).",
    "  Shifting right by N divides by 2^N. Vacated high bits are filled with zeros.",
    "",
    "Packing two uint128 values into one uint256 word:",
    "  PUSH2 0xbeef   // lo — pushed first so it sits below",
    "  PUSH2 0xdead   // hi — on top",
    "  PUSH1 0x80 SHL // shift hi left 128 bits into the upper half",
    "  OR             // merge: (hi << 128) | lo",
    "",
    "Unpacking the hi field back out:",
    "  DUP1           // copy the packed word",
    "  PUSH1 0x80 SHR // shift right 128 bits → hi lands in the low 128 bits",
    "",
    "This pack/unpack pattern appears in every Huff token contract and packed struct.",
    "",
    "For this level: pack 0xdead and 0xbeef, then immediately extract 0xdead back."
  ],
  10: [
    "Lesson 10: CALLDATALOAD and CALLDATASIZE — reading input",
    "",
    "When a contract is called, the caller supplies a byte string called calldata.",
    "In Solidity it is decoded for you; in Huff you read it manually with two opcodes.",
    "",
    "CALLDATASIZE pushes the total byte length of calldata.",
    "  A call with two uint256 arguments (no selector) is 64 bytes = 0x40.",
    "  Checking size before reading guards against short or empty calldata.",
    "",
    "CALLDATALOAD pops a byte offset and pushes 32 bytes starting there.",
    "  Bytes past the end of calldata are treated as zero.",
    "  Offset 0 → first word.  Offset 32 (0x20) → second word.  And so on.",
    "",
    "In a selector-based call (4-byte selector + args), the first argument is at offset 4.",
    "In a selector-less call (raw ABI), arguments start at offset 0.",
    "",
    "For this level: push CALLDATASIZE (64 = 0x40), then load the second word."
  ],
  11: [
    "Lesson 11: MSTORE and MLOAD — reading and writing memory",
    "",
    "EVM memory is a flat, zero-initialized byte array. It exists only for the current call.",
    "Memory expands automatically as you write to higher addresses.",
    "",
    "MSTORE(offset, value):",
    "  pops offset (top of stack), then value",
    "  writes a right-aligned 32-byte word to memory[offset..offset+32)",
    "",
    "MLOAD(offset):",
    "  pops offset, reads 32 bytes from memory[offset], pushes the result",
    "",
    "Huff idiom — push value first since MSTORE pops offset first:",
    "  0xc0de 0x20 mstore   // write 0xc0de at memory offset 32",
    "  0x20 mload           // read it back",
    "",
    "For this level: store 0xc0de at offset 32, then load it back."
  ],
  12: [
    "Lesson 12: RETURN — sending data back to the caller",
    "",
    "Return values in the EVM come from memory, not the stack.",
    "Write the value to memory with MSTORE, then RETURN points to it.",
    "",
    "RETURN(offset, size):",
    "  pops offset (top), then size",
    "  returns memory[offset .. offset+size) to the caller",
    "",
    "For a single uint256 return value:",
    "  Store it at offset 0 with MSTORE.",
    "  Then RETURN 32 bytes (0x20) from offset 0.",
    "",
    "For multiple return values, store each one 32 bytes apart:",
    "  value1 at offset 0, value2 at offset 32 (0x20), then RETURN 64 bytes (0x40).",
    "",
    "Huff style (push value first, then offset, since MSTORE pops offset first):",
    "  0x2a 0x00 mstore   0x20 0x00 return",
    "",
    "STOP ends execution successfully without returning data. It is common at the end",
    "of state-changing paths that only update storage or emit logs. Falling off the end",
    "of bytecode also stops, but an explicit STOP makes the intended terminal path clear.",
    "",
    "For this level: return a 32-byte payload whose value is 42 (0x2a)."
  ],
  13: [
    "Lesson 13: SSTORE and SLOAD — persistent storage",
    "",
    "Storage is a permanent 256-bit key → 256-bit value map that survives between calls.",
    "Unwritten slots read as 0. Storage is the most expensive resource on the EVM.",
    "",
    "SSTORE pops key (top = the slot number), then value:",
    "  Push value first so key ends up on top when SSTORE runs.",
    "  PUSH2 0xbeef PUSH0 SSTORE  — writes 0xbeef to slot 0",
    "  Gas: 20,000 for a fresh write; 2,900 for an update.",
    "",
    "SLOAD pops a slot key and pushes its value (0 if never written):",
    "  PUSH1 0x07 SLOAD  — reads slot 7",
    "  Gas: 2,100 cold (first access); 100 warm (already accessed this tx).",
    "",
    "In Huff you typically define constants for slot numbers:",
    "  #define constant BALANCE_SLOT = 0x00",
    "  [BALANCE_SLOT] sload",
    "",
    "For this level: write 0xbeef to slot 0, then read 0x1337 from slot 7."
  ],
  14: [
    "Lesson 14: JUMPI and labels — conditional branching",
    "",
    "JUMPI pops two items: a destination PC (top), then a condition (below).",
    "If the condition is non-zero, execution jumps to that program counter.",
    "The destination must be a JUMPDEST instruction, or the EVM aborts.",
    "",
    "In Huff, labels create JUMPDEST markers automatically:",
    "  paid:      — defines a label (compiles to JUMPDEST at that address)",
    "  PUSH @paid — pushes the program counter of label 'paid'",
    "",
    "Pattern for branching on CALLVALUE:",
    "  CALLVALUE        // non-zero when ether is sent",
    "  PUSH @paid       // destination",
    "  JUMPI            // jumps if CALLVALUE ≠ 0",
    "  PUSH0 PUSH0 REVERT  // no ether sent — revert",
    "  paid:            // ether received — execution arrives here",
    "  PUSH1 0xff",
    "",
    "For this level: jump to 'paid' when CALLVALUE is non-zero, leaving 0xff."
  ],
  15: [
    "Lesson 15: JUMP — unconditional control flow",
    "",
    "JUMP pops one destination and always transfers execution there.",
    "Like JUMPI, its target must be a JUMPDEST; Huff labels create those markers.",
    "",
    "A common loop shape uses JUMPI for the exit and JUMP for the loop tail:",
    "  loop:",
    "    ...update counter...",
    "    ...condition... done jumpi",
    "    loop jump",
    "  done:",
    "",
    "Unconditional jumps also appear in dispatch tables when several branches share",
    "one return or cleanup tail.",
    "",
    "For this level: count from zero to three, jumping back until the exit condition holds."
  ],
  16: [
    "Lesson 16: The Huff MAIN macro — writing a real contract",
    "",
    "A Huff source file is a collection of '#define macro' blocks.",
    "The macro named MAIN is the runtime entry point — all calls to the deployed",
    "contract begin executing here.",
    "",
    "Macro syntax:",
    "  #define macro MAIN() = takes(0) returns(0) { ... }",
    "    takes(n)   — stack items this macro expects on entry",
    "    returns(m) — stack items it leaves when done",
    "  For MAIN both are 0: the EVM starts with an empty stack, and the return",
    "  value is written to memory (not pushed).",
    "",
    "Inside the braces, write opcode mnemonics in lowercase:",
    "  0xdeadbeef 0x00 mstore   // store at memory[0]",
    "  0x20 0x00 return         // return 32 bytes",
    "",
    "The CONSTRUCTOR macro (if defined) runs once at deploy time.",
    "Huff's default constructor already returns MAIN as the runtime bytecode,",
    "so you can omit CONSTRUCTOR unless you need custom deploy logic.",
    "",
    "For this level: write a MAIN macro that returns uint256(0xdeadbeef)."
  ],
  17: [
    "Lesson 17: Calling helper macros",
    "",
    "Huff macros are compile-time code organization. Calling DOUBLE() inside MAIN",
    "inlines DOUBLE's body at that point; it is not an EVM CALL and creates no new frame.",
    "",
    "  #define macro DOUBLE() = takes(1) returns(1) {",
    "    dup1 add",
    "  }",
    "",
    "The stack annotations document and validate the contract between macros:",
    "  takes(1)   — one value must already be on the stack",
    "  returns(1) — one value remains after the expanded body finishes",
    "",
    "Small guards, memory helpers, storage accessors, and shared return tails are commonly",
    "written as helper macros so MAIN stays readable.",
    "",
    "For this level: call a reusable DOUBLE() helper from MAIN."
  ],
  18: [
    "Lesson 18: Function selectors — the first 4 bytes",
    "",
    "Solidity identifies functions by their selector: the first 4 bytes of calldata,",
    "equal to keccak256('funcName(type1,type2,...)').[0..4].",
    "",
    "CALLDATALOAD at offset 0 loads 32 bytes. The selector sits in the top 4 bytes",
    "(the most-significant bytes of the 256-bit word).",
    "",
    "To move the selector into the low 4 bytes for comparison, shift right 224 bits:",
    "  224 = 28 bytes × 8 = 0xe0",
    "",
    "  PUSH0 CALLDATALOAD    // 32-byte word, selector in the high 4 bytes",
    "  PUSH1 0xe0 SHR        // shift right 224 → selector in the low 4 bytes",
    "  PUSH4 0x12345678 EQ   // compare — leaves 1 if matched",
    "",
    "This three-step pattern is the entry point of every Huff dispatcher.",
    "",
    "For this level: extract the selector and check whether it matches 0x12345678."
  ],
  19: [
    "Lesson 19: ADDMOD, MULMOD, EXP, and SIGNEXTEND",
    "",
    "ADDMOD and MULMOD do arithmetic under a modulus without keeping the full intermediate value.",
    "EXP raises a base to an exponent and then the EVM word is reduced modulo 2^256.",
    "SIGNEXTEND turns a smaller signed integer into a full 256-bit signed word.",
    "",
    "For this level: practice the arithmetic edge opcodes that show up in math-heavy Huff."
  ],
  20: [
    "Lesson 20: Signed comparisons and arithmetic shift",
    "",
    "LT and GT compare unsigned 256-bit integers. SLT and SGT compare signed two's-complement integers.",
    "SAR shifts right while preserving the sign bit; SHR always fills high bits with zero.",
    "",
    "For this level: contrast uint256 max with signed -1."
  ],
  21: [
    "Lesson 21: POP with DUP and SWAP",
    "",
    "POP is simple but essential: it removes stack values after checks, failed selector comparisons,",
    "or helper calculations. DUP and SWAP then let you keep only the values future opcodes need.",
    "",
    "For this level: clean up and reorder a small starting stack."
  ],
  22: [
    "Lesson 22: BYTE",
    "",
    "BYTE extracts one byte from a 32-byte word. Index 0 is the high byte; index 31 is the low byte.",
    "This is useful for parsing packed data or inspecting selectors and compact byte strings.",
    "",
    "For this level: pull each byte out of 0xabcdef."
  ],
  23: [
    "Lesson 23: Call context opcodes",
    "",
    "ADDRESS, CALLER, ORIGIN, and CALLVALUE read the current execution context.",
    "CALLER is usually the safe identity primitive; ORIGIN should almost never be used for auth.",
    "",
    "For this level: read the contract, sender, transaction origin, and msg.value."
  ],
  24: [
    "Lesson 24: Block and gas context",
    "",
    "CHAINID, TIMESTAMP, NUMBER, BASEFEE, GASLIMIT, COINBASE, and PREVRANDAO expose",
    "chain or block metadata. PREVRANDAO replaced the old DIFFICULTY meaning after the Merge.",
    "",
    "GASPRICE reads the effective transaction gas price. SELFBALANCE reads this contract's",
    "ether balance. GAS reports the remaining gas at that exact point in execution.",
    "",
    "These values help with domain separation, accounting, and gas-aware forwarding,",
    "but block fields such as TIMESTAMP and PREVRANDAO are not strong standalone randomness.",
    "",
    "For this level: read the full environment set in a predictable order."
  ],
  25: [
    "Lesson 25: CALLDATACOPY",
    "",
    "CALLDATALOAD reads one 32-byte word. CALLDATACOPY copies an arbitrary byte slice into memory.",
    "Its stack order is destination offset, calldata offset, size, with destination on top.",
    "",
    "For this level: copy a short calldata blob into memory and read it back."
  ],
  26: [
    "Lesson 26: MSTORE8 and MSIZE",
    "",
    "MSTORE8 writes a single byte instead of a full word. MSIZE reports active memory size,",
    "rounded up to the next 32-byte boundary.",
    "",
    "For this level: write one byte and observe how memory expands."
  ],
  27: [
    "Lesson 27: LOG0 through LOG4",
    "",
    "LOG opcodes emit event data from memory plus zero to four indexed topics.",
    "This level focuses on the raw stack order; the next level turns it into a real ABI event.",
    "",
    "For this level: emit one topic and one 32-byte data word."
  ],
  28: [
    "Lesson 28: Event declarations and __EVENT_HASH",
    "",
    "#define event declares an ABI event signature. For a non-anonymous event, topic zero",
    "is keccak256 of its canonical signature, such as keccak256(\"Answer(uint256)\").",
    "",
    "__EVENT_HASH(Answer) inserts that full 32-byte hash at compile time.",
    "Indexed arguments become additional topics; non-indexed arguments are ABI-encoded in memory",
    "and supplied as the LOG data slice.",
    "",
    "For this level: emit Answer(42) with the compiler-generated signature hash."
  ],
  29: [
    "Lesson 29: Error declarations and __ERROR",
    "",
    "A custom error payload begins with the first four bytes of keccak256 of its canonical",
    "signature. #define error declares the signature, and __ERROR(name) inserts its selector",
    "left-aligned so it can be stored directly with MSTORE.",
    "",
    "Errors with arguments append ABI-encoded words after the selector. A no-argument error",
    "needs only four bytes, making it much cheaper than a revert string.",
    "",
    "For this level: declare Unauthorized() and REVERT its generated selector."
  ],
  30: [
    "Lesson 30: Huff constants",
    "",
    "Huff constants are compile-time names for byte values. They do not live in storage.",
    "Use bracket notation, like [ANSWER], to push the constant's value in code.",
    "",
    "For this level: define and use a constant."
  ],
  31: [
    "Lesson 31: Function declarations and __FUNC_SIG",
    "",
    "Huff function declarations describe ABI-visible entry points and can be used by compiler builtins.",
    "__FUNC_SIG(name) inserts the function selector so you do not hand-copy magic four-byte values.",
    "",
    "For this level: compare calldata's selector with the selector generated from a function declaration."
  ],
  32: [
    "Lesson 32: __BYTES and padding builtins",
    "",
    "__BYTES turns a string literal into UTF-8 bytes. __LEFTPAD and __RIGHTPAD produce 32-byte padded values.",
    "These are compile-time tools, often used through constants or code tables.",
    "",
    "For this level: push a short byte string and a right-padded word."
  ],
  33: [
    "Lesson 33: FREE_STORAGE_POINTER",
    "",
    "FREE_STORAGE_POINTER() gives each constant a unique storage slot at compile time.",
    "This avoids hand-assigning overlapping storage slots as contracts grow.",
    "",
    "For this level: store and load through a named storage-slot constant."
  ]
};

const advancedLessons = {
  1: [
    "Challenge 1: The Single-Function Dispatcher",
    "",
    "Time to apply everything. A real Huff contract routes incoming calls by selector.",
    "You have learned all the pieces:",
    "  - CALLDATALOAD + SHR to extract the 4-byte selector",
    "  - EQ + JUMPI to branch on a match",
    "  - MSTORE + RETURN to send back a value",
    "  - REVERT as the fallback for unknown selectors",
    "",
    "Combine them: extract → compare → branch → return, with REVERT before the branch target.",
    "",
    "Calldata: 0xdeadbeef followed by 28 zero bytes (padded to 32)."
  ],
  2: [
    "Challenge 2: The Multi-Function Router",
    "",
    "Extend the dispatcher to handle two selectors. EQ consumes the selector copy it compares",
    "against, so DUP1 before each EQ to preserve a copy for the next check.",
    "",
    "  DUP1  PUSH4 0xaaaa... EQ  PUSH @fnA JUMPI",
    "  DUP1  PUSH4 0xcccc... EQ  PUSH @fnB JUMPI",
    "  PUSH0 PUSH0 REVERT",
    "  fnA: POP  ...return 0x0a...",
    "  fnB: POP  ...return 0x0b...",
    "",
    "Each branch must POP the leftover selector copy before returning."
  ],
  3: [
    "Challenge 3: Safe Division",
    "",
    "Integer division that guards against divide-by-zero. Calldata holds two 32-byte words:",
    "dividend at offset 0, divisor at offset 32.",
    "",
    "Pattern: load divisor first → ISZERO → JUMPI to revert if zero → load dividend → SWAP1 → DIV → RETURN.",
    "",
    "Stack discipline: DIV pops a (top) as divisor and b (below) as dividend, result = b / a.",
    "After the zero-check the divisor sits below; load the dividend on top, then SWAP1",
    "so divisor ends up on top for DIV.",
    "",
    "Return: a single 32-byte ABI word containing the quotient."
  ],
  4: [
    "Challenge 4: ABI-style arithmetic",
    "",
    "A minimal useful contract reads calldata words, computes, writes memory, and returns ABI words.",
    "This is the core loop behind many simple view functions."
  ],
  5: [
    "Challenge 5: Authorization",
    "",
    "Owner gates combine CALLER, EQ, JUMPI, and REVERT. Keep the revert path short and explicit.",
    "In production, CALLER is usually the right primitive; avoid ORIGIN-based authorization."
  ],
  6: [
    "Challenge 6: Persistent state update",
    "",
    "Storage updates require careful duplication because SSTORE consumes both key and value.",
    "A common pattern is compute -> DUP1 -> SSTORE -> use the duplicate for the return value."
  ],
  7: [
    "Challenge 7: Event emission",
    "",
    "Events are LOG opcodes over memory slices plus indexed topics. Huff event declarations and",
    "__EVENT_HASH can help produce topic zero for real ABI-compatible events."
  ],
  8: [
    "Challenge 8: Byte-for-byte echo",
    "",
    "CALLDATACOPY plus RETURN is the skeleton of many proxy and fallback-style contracts.",
    "The main trick is preserving or recomputing the byte length for RETURN."
  ],
  9: [
    "Challenge 9: Multiple return words",
    "",
    "ABI return data is just adjacent 32-byte memory words. Store each result at a fixed offset",
    "and return the total byte length."
  ],
  10: [
    "Challenge 10: Packed storage update",
    "",
    "Packed storage is mask, clear, set, and persist. AND removes the field you are replacing;",
    "OR inserts the new field without disturbing the preserved bits."
  ],
  11: [
    "Challenge 11: Branching without losing values",
    "",
    "Comparisons consume operands. DUP before comparing when the branch still needs the original values."
  ],
  12: [
    "Challenge 12: Custom errors",
    "",
    "Apply the Basic custom-error pattern in a complete Huff source: declare the error,",
    "let __ERROR compute its selector, store it, and REVERT exactly four bytes."
  ]
};

let levels = basicLevels;
let lessons = basicLessons;
let currentMode = "basic";
const modes = {
  basic: {
    label: "Basic",
    promptPrefix: "B",
    levels: basicLevels,
    lessons: basicLessons,
    filePrefix: "level",
    progressVersion: 2,
    progressFile: ".huff-dojo-basic-progress.json"
  },
  advanced: {
    label: "Advanced",
    promptPrefix: "A",
    levels: advancedLevels,
    lessons: advancedLessons,
    filePrefix: "advanced",
    progressVersion: 1,
    progressFile: ".huff-dojo-advanced-progress.json"
  }
};

const defaultAnvilPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const defaultAnvilFrom = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const defaultSettings = {
  boilerplate: true,
  lessons: true,
  anvil: false,
  rpcUrl: "http://127.0.0.1:8545",
  privateKey: defaultAnvilPrivateKey,
  from: defaultAnvilFrom
};

const style = {
  bold: (text) => `\x1b[1m${text}\x1b[22m`,
  dim: (text) => `\x1b[2m${text}\x1b[22m`,
  green: (text) => `\x1b[32m${text}\x1b[39m`,
  yellow: (text) => `\x1b[33m${text}\x1b[39m`,
  red: (text) => `\x1b[31m${text}\x1b[39m`,
  blue: (text) => `\x1b[34m${text}\x1b[39m`,
  magenta: (text) => `\x1b[35m${text}\x1b[39m`,
  cyan: (text) => `\x1b[36m${text}\x1b[39m`
};

function levelHeading(level) {
  return style.bold(style.cyan(`Level ${level.id}: ${level.title}`));
}

function sectionLabel(text) {
  return style.bold(style.blue(text));
}

function successText(text) {
  return style.bold(style.green(text));
}

function warningText(text) {
  return style.bold(style.yellow(text));
}

function errorText(text) {
  return style.bold(style.red(text));
}

function mutedLabel(text) {
  return style.dim(text);
}

const LEGACY_SAVE_PATH = path.join(os.homedir(), ".huff-dojo-progress.json");

function modeConfig(mode = currentMode) {
  return modes[mode] || modes.basic;
}

function setMode(mode) {
  currentMode = mode;
  levels = modeConfig(mode).levels;
  lessons = modeConfig(mode).lessons;
}

function progressPath(mode = currentMode) {
  return path.join(os.homedir(), modeConfig(mode).progressFile);
}

function normalizeCompleted(mode, completed, version = 1) {
  let ids = completed.map(Number).filter(Number.isInteger);
  if (mode === "basic" && version < 2) {
    ids = ids.map((id) => {
      if (id <= 14) return id;
      if (id === 15) return 16;
      if (id <= 25) return id + 2;
      return id + 4;
    });
  }
  const validIds = new Set(modeConfig(mode).levels.map((level) => level.id));
  return new Set(ids.filter((id) => validIds.has(id)));
}

function loadProgress(mode) {
  const currentSavePath = progressPath(mode);
  try {
    if (fs.existsSync(currentSavePath)) {
      const data = JSON.parse(fs.readFileSync(currentSavePath, "utf8"));
      return normalizeCompleted(
        mode,
        Array.isArray(data.completed) ? data.completed : [],
        Number(data.version || 1)
      );
    }
  } catch { }

  try {
    if (fs.existsSync(LEGACY_SAVE_PATH)) {
      const data = JSON.parse(fs.readFileSync(LEGACY_SAVE_PATH, "utf8"));
      const completed = Array.isArray(data)
        ? (mode === "basic" ? data : [])
        : data[mode] || [];
      return normalizeCompleted(mode, completed, 1);
    }
  } catch { }
  return new Set();
}

function saveProgress(completed, mode) {
  const data = {
    mode,
    version: modeConfig(mode).progressVersion,
    completed: [...completed].sort((a, b) => a - b)
  };
  try {
    fs.writeFileSync(progressPath(mode), JSON.stringify(data, null, 2), "utf8");
  } catch { }
}

function usage() {
  return [
    "Huff Dojo - EVM opcode and Huff CLI puzzles",
    "",
    "Usage:",
    "  huff-dojo",
    "  huff-dojo --mode basic --level 3 --program \"PUSH1 0x0a PUSH1 0x03 SUB\"",
    "  huff-dojo --mode advanced --level 1 --file ./dojo-levels/advanced-01.huff",
    "  huff-dojo --level 3 --program \"PUSH1 0x0a PUSH1 0x03 SUB\"",
    "  huff-dojo --level 7 --file ./dojo-levels/level-07.huff",
    "  huff-dojo --template 7 --file ./dojo-levels/level-07.huff",
    "  huff-dojo --self-test",
    "",
    "Inside the dojo, type :help for commands."
  ].join("\n");
}

function interactiveHelp() {
  return [
    "Huff Dojo commands",
    "",
    "The game watches your level file automatically — edit it in any editor and save.",
    "",
    "Core flow:",
    "  :code [file]                 open the built-in TUI editor (^S save+check, ^C cancel)",
    "  :template [file]             write a starter Huff contract if the file does not exist",
    "  :template! [file]            overwrite the starter Huff contract",
    "  :solution-template [file]    write a solved Huff contract",
    "  :skip                        mark the current level done and move on without solving",
    "",
    "Navigation:",
    "  :levels                      list all levels with completion marks",
    "  :level <number>              jump to a level",
    "  :mode basic|advanced         switch between basic and advanced mode",
    "  :lesson                      reread the current lesson",
    "  :hint                        show the next hint",
    "  :solution                    show raw opcode and Huff body solution",
    "",
    "Progress:",
    "  :progress                    show progress bar and completed/remaining counts",
    "  :reset                       reset hint counter for this level",
    "  :reset-progress              wipe all saved progress and start from level 1",
    "",
    "Settings:",
    "  :lessons on|off              show or hide lesson text when loading a level",
    "  :boilerplate on|off          include or omit scaffold comments in new templates",
    "  :anvil on [rpc-url]          deploy compiled bytecode against local Anvil",
    "  :anvil off                   disable Anvil checks",
    "",
    "Reference:",
    "  :opcodes                     list simulator-supported opcodes",
    "  :ctx                         show level calldata / callvalue / storage context",
    "  :help                        show this reference",
    "  :quit                        exit",
    "",
    "Practice:",
    "  Any non-command line is run through the opcode simulator for instant feedback.",
    "  Practice can match the expected output, but winning requires a compiled Huff file."
  ].join("\n");
}

function startupText() {
  return [
    "Huff Dojo",
    `${modeConfig().label} track selected. Type :help for commands. Use :code to solve the current level in the terminal.`
  ].join("\n");
}

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

function keccak256(text) {
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

function execute(level, source, maxSteps = 512) {
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

function returnHex(bytes) {
  return `0x${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function stackHex(stack) {
  return stack.map(compactHex);
}

function stackHexDisplay(stack) {
  return stack.map(compactHex).reverse();
}

function storageHex(storage) {
  return Object.fromEntries(
    [...storage.entries()]
      .sort(([a], [b]) => toBigInt(a) < toBigInt(b) ? -1 : 1)
      .map(([key, value]) => [compactHex(key), compactHex(value)])
  );
}

function compareExpected(level, state) {
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

function describeLevel(level) {
  const lines = [
    "",
    `  ${levelHeading(level)}`,
    "",
    `  ${sectionLabel("Objective")}`,
    `  ${level.prompt}`
  ];
  const context = formatContext(level.context || {});
  if (context) lines.push("", `  ${sectionLabel("Starting Context")}`, `  ${context}`);
  return lines.join("\n");
}

function describeLesson(level) {
  const lesson = lessons[level.id];
  if (!lesson) return "";
  return [
    "",
    ...lesson.map((line, index) => {
      if (!line) return "";
      return index === 0 ? `  ${sectionLabel(line)}` : `  ${line}`;
    })
  ].join("\n");
}

function describeLevelWithLesson(level, settings = defaultSettings) {
  const parts = [describeLevel(level)];
  if (settings.lessons) parts.push(describeLesson(level));
  return parts.filter(Boolean).join("\n");
}

function formatContext(context = {}) {
  const parts = [];
  if (context.stack) parts.push(`stack ${JSON.stringify([...context.stack].reverse().map(compactHex))}`);
  if (context.callvalue !== undefined) parts.push(`callvalue ${compactHex(context.callvalue)}`);
  if (context.address !== undefined) parts.push(`address ${compactHex(context.address)}`);
  if (context.caller !== undefined) parts.push(`caller ${compactHex(context.caller)}`);
  if (context.origin !== undefined) parts.push(`origin ${compactHex(context.origin)}`);
  if (context.chainid !== undefined) parts.push(`chainid ${compactHex(context.chainid)}`);
  if (context.gasprice !== undefined) parts.push(`gasprice ${compactHex(context.gasprice)}`);
  if (context.coinbase !== undefined) parts.push(`coinbase ${compactHex(context.coinbase)}`);
  if (context.timestamp !== undefined) parts.push(`timestamp ${compactHex(context.timestamp)}`);
  if (context.number !== undefined) parts.push(`number ${compactHex(context.number)}`);
  if (context.prevrandao !== undefined) parts.push(`prevrandao ${compactHex(context.prevrandao)}`);
  if (context.gaslimit !== undefined) parts.push(`gaslimit ${compactHex(context.gaslimit)}`);
  if (context.basefee !== undefined) parts.push(`basefee ${compactHex(context.basefee)}`);
  if (context.selfbalance !== undefined) parts.push(`selfbalance ${compactHex(context.selfbalance)}`);
  if (context.calldata) parts.push(`calldata ${context.calldata}`);
  if (context.calldataWords) parts.push(`calldataWords ${JSON.stringify(context.calldataWords.map(wordHex))}`);
  if (context.storage) parts.push(`storage ${JSON.stringify(context.storage)}`);
  if (context.balances) parts.push(`balances ${JSON.stringify(context.balances)}`);
  return parts.join("; ");
}

function renderSimulatorResult(level, source, options = {}) {
  const canWin = options.canWin ?? false;
  const { instructions, state } = execute(level, source);
  const verdict = compareExpected(level, state);

  const lines = [""];

  if (verdict.pass && canWin) {
    const msg = `  ${successText(`✓  Level ${level.id} cleared — Congratulations!`)}  `;
    const bar = "  " + "═".repeat(msg.length - 2);
    lines.push(bar, "", msg, "", bar, "");
    const parts = [`Steps: ${state.steps}`, `Instructions: ${instructions.length}`];
    if (state.returnData.length) parts.push(`Return: ${returnHex(state.returnData)}`);
    if (state.stack.length) parts.push(`Stack: ${JSON.stringify(stackHexDisplay(state.stack))}`);
    if (state.storage.size) parts.push(`Storage: ${JSON.stringify(storageHex(state.storage))}`);
    if (state.logs.length) parts.push(`Logs: ${JSON.stringify(state.logs)}`);
    lines.push("  " + parts.join("   "));

  } else if (verdict.pass && !canWin) {
    lines.push(`  ${successText("✓  Logic correct")} — compile a Huff file to officially win this level.`);
    lines.push(`     ${mutedLabel("Type :code to open the built-in editor, then Ctrl+S to save and check.")}`);
    lines.push("");
    lines.push(`  Steps: ${state.steps}   Stack: ${JSON.stringify(stackHexDisplay(state.stack))}`);

  } else {
    lines.push(`  ${errorText("✗  Not quite.")}`);
    lines.push("");
    for (const check of verdict.checks.filter((item) => !item.pass)) {
      lines.push(`  ${warningText(`${check.label} mismatch.`)}`);
      lines.push(`  got ${check.label}: ${check.actual}`);
      lines.push("");
    }
    const parts = [`Steps: ${state.steps}`, `Stack: ${JSON.stringify(stackHexDisplay(state.stack))}`];
    if (state.returnData.length || (level.expect && level.expect.returnData != null)) {
      parts.push(`Return: ${returnHex(state.returnData)}`);
    }
    parts.push(`Reverted: ${state.reverted}`);
    if (state.storage.size) parts.push(`Storage: ${JSON.stringify(storageHex(state.storage))}`);
    if (state.logs.length) parts.push(`Logs: ${JSON.stringify(state.logs)}`);
    lines.push("  " + parts.join("   "));
  }

  return { pass: verdict.pass, wins: verdict.pass && canWin, text: lines.join("\n") };
}

function renderResult(level, source) {
  return renderSimulatorResult(level, source, { canWin: true });
}

function progressBar(done, total, width = 24) {
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return `[${style.green("█".repeat(filled))}${style.dim("░".repeat(width - filled))}] ${style.bold(`${done}/${total}`)} (${pct}%)`;
}

function listLevels(completed = new Set()) {
  return levels
    .map((level) => {
      const mark = completed.has(level.id) ? style.green("[x]") : style.dim("[ ]");
      const num = String(level.id).padStart(2, "0");
      return `${mark} ${style.bold(`${num}.`)} ${level.title}`;
    })
    .join("\n");
}

function parseCommandLine(line) {
  const parts = line.slice(1).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { cmd: "", arg: "" };

  let cmd = parts[0];
  if (/^[a-z-]+:0x[0-9a-f]+$/i.test(cmd)) {
    cmd = cmd.replace(/:0x[0-9a-f]+$/i, "");
  }

  return {
    cmd,
    arg: parts.slice(1).join(" ")
  };
}

function findLevel(id) {
  const level = levels.find((candidate) => candidate.id === Number(id));
  if (!level) throw new Error(`Unknown level ${id}`);
  return level;
}

function defaultLevelPath(level, mode = currentMode) {
  const prefix = modeConfig(mode).filePrefix;
  return path.join(process.cwd(), "dojo-levels", `${prefix}-${String(level.id).padStart(2, "0")}.huff`);
}

function huffBodyForLevel(level, solved = false) {
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

function extraHuffDefinitions(level, solved = false) {
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

function rawOpcodesToHuff(source) {
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

function scaffoldNotes(settings = defaultSettings) {
  if (!settings.boilerplate) return [];
  return [
    "    // Optional Solidity-style memory convention:",
    "    // 0x80 0x40 mstore    // free memory pointer = 0x80",
    "    //",
    "    // Your level body goes below."
  ];
}

function buildHuffTemplate(level, settings = defaultSettings, solved = false) {
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

function writeTemplate(level, filePath, settings, solved = false, overwrite = false) {
  const resolved = path.resolve(filePath);
  if (fs.existsSync(resolved) && !overwrite) {
    throw new Error(`${resolved} already exists. Use :template! to overwrite it.`);
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, buildHuffTemplate(level, settings, solved), "utf8");
  return resolved;
}

function replaceMainBody(source, body) {
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

function writeMainBody(level, filePath, settings, body) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    writeTemplate(level, resolved, settings, false, false);
  }
  const source = fs.readFileSync(resolved, "utf8");
  fs.writeFileSync(resolved, replaceMainBody(source, body), "utf8");
  return resolved;
}

function readHuffSource(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  return { resolved, source: fs.readFileSync(resolved, "utf8") };
}

function extractBytecode(stdout) {
  const match = stdout.match(/(?:0x)?[0-9a-fA-F]{10,}/g)?.at(-1);
  if (!match) return "";
  return match.startsWith("0x") ? match : `0x${match}`;
}

function compileHuff(filePath, mode = "bytecode") {
  const flag = mode === "runtime" ? "-r" : "-b";
  try {
    const stdout = execFileSync("hnc", [filePath, flag], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const bytecode = extractBytecode(stdout);
    if (!bytecode) {
      return { ok: false, error: `hnc succeeded, but no bytecode was found in output:\n${stdout}` };
    }
    return { ok: true, bytecode, stdout };
  } catch (error) {
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");
    return {
      ok: false,
      error: detail.includes("ENOENT")
        ? "hnc was not found. Install Huff Neo with hnc-up, then run `hnc --help`."
        : detail
    };
  }
}

function rpc(settings, method, params = []) {
  const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const stdout = execFileSync("curl", [
    "-sS",
    "-X",
    "POST",
    "-H",
    "content-type: application/json",
    "--data",
    payload,
    settings.rpcUrl
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      NO_PROXY: "*",
      no_proxy: "*",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      all_proxy: ""
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const response = JSON.parse(stdout);
  if (response.error) {
    throw new Error(`${response.error.message || "RPC error"} (${method})`);
  }
  return response.result;
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function anvilCalldata(level) {
  const context = level.context || {};
  if (context.calldata) return context.calldata;
  if (context.calldataWords) {
    return `0x${context.calldataWords.map((word) => wordHex(word).slice(2)).join("")}`;
  }
  return "0x";
}

function waitForReceipt(settings, txHash) {
  for (let i = 0; i < 30; i += 1) {
    const receipt = rpc(settings, "eth_getTransactionReceipt", [txHash]);
    if (receipt) return receipt;
    sleep(100);
  }
  throw new Error(`Timed out waiting for receipt ${txHash}`);
}

function runInAnvil(level, bytecode, settings) {
  try {
    const deployHash = rpc(settings, "eth_sendTransaction", [{
      from: settings.from,
      data: bytecode
    }]);
    const deployReceipt = waitForReceipt(settings, deployHash);
    const address = deployReceipt.contractAddress;
    if (!address) {
      return { ok: false, text: `Anvil deploy ran, but no contract address was found in receipt ${deployHash}.` };
    }

    const checks = [`Anvil deployed: ${address}`];
    if (level.expect?.returnData !== undefined) {
      const callOut = rpc(settings, "eth_call", [{
        from: settings.from,
        to: address,
        data: anvilCalldata(level),
        value: compactHex(level.context?.callvalue || 0)
      }, "latest"]);
      const actual = callOut.toLowerCase();
      const expected = level.expect.returnData.toLowerCase();
      checks.push(`Anvil call return: ${callOut}`);
      if (actual !== expected) {
        return {
          ok: false,
          text: `${checks.join("\n")}\nAnvil mismatch: expected ${level.expect.returnData}, got ${callOut}`
        };
      }
    } else if (level.expect?.storage) {
      const txHash = rpc(settings, "eth_sendTransaction", [{
        from: settings.from,
        to: address,
        data: anvilCalldata(level),
        value: compactHex(level.context?.callvalue || 0)
      }]);
      waitForReceipt(settings, txHash);
      for (const [slot, expected] of Object.entries(level.expect.storage)) {
        const actual = compactHex(rpc(settings, "eth_getStorageAt", [address, compactHex(slot), "latest"]));
        checks.push(`Anvil storage ${compactHex(slot)}: ${actual}`);
        if (actual !== compactHex(expected)) {
          return {
            ok: false,
            text: `${checks.join("\n")}\nAnvil mismatch: expected slot ${slot} = ${expected}, got ${actual}`
          };
        }
      }
    } else {
      checks.push("Anvil live check: deployment succeeded. This stack-only level is still judged by the simulator.");
    }

    return { ok: true, text: checks.join("\n") };
  } catch (error) {
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");
    return {
      ok: false,
      text: detail.includes("ENOENT")
        ? "curl was not found. Start `anvil` and make sure curl is available, then try again."
        : detail
    };
  }
}

function renderHuffFileResult(level, filePath, settings = defaultSettings) {
  const { resolved, source } = readHuffSource(filePath);
  const compile = compileHuff(resolved, "bytecode");
  const byteLen = compile.ok ? (compile.bytecode.length - 2) / 2 : 0;
  const lines = [``, `  ${sectionLabel("File")} ${resolved}`];
  if (!compile.ok) {
    lines.push("", `  ${errorText("Compile error")}`);
    for (const errLine of compile.error.split("\n")) lines.push(`    ${errLine}`);
    return { pass: false, wins: false, text: lines.join("\n") };
  }
  lines.push(`  ${sectionLabel("Bytecode")} ${compile.bytecode.slice(0, 42)}${compile.bytecode.length > 42 ? "…" : ""}  (${byteLen} bytes)`);

  const result = renderSimulatorResult(level, source, { canWin: true });
  lines.push(result.text);
  if (!result.pass) return { pass: false, wins: false, text: lines.join("\n") };

  if (settings.anvil) {
    const live = runInAnvil(level, compile.bytecode, settings);
    lines.push("");
    lines.push(live.ok ? `  ${successText("Anvil: pass")}` : `  ${errorText("Anvil: FAILED")}`);
    lines.push(live.text.split("\n").map((l) => `  ${l}`).join("\n"));
    if (!live.ok) return { pass: false, wins: false, text: lines.join("\n") };
  }

  return { pass: true, wins: true, text: lines.join("\n") };
}

const STACK_TRACE_COMMENT = /\s*\/\/\s*\[[^\]]*\]\s*$/;

function stripStackTraceComment(line) {
  return line.replace(STACK_TRACE_COMMENT, "");
}

function findMainBodyRange(lines) {
  const mainLine = lines.findIndex((line) => /#define\s+macro\s+MAIN\s*\(/i.test(line));
  if (mainLine === -1) return null;

  let openLine = -1;
  let depth = 0;
  for (let row = mainLine; row < lines.length; row += 1) {
    const clean = stripComments(lines[row] || "");
    for (const ch of clean) {
      if (ch === "{") {
        if (openLine === -1) openLine = row;
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (openLine !== -1 && depth === 0) return { start: openLine + 1, end: row };
      }
    }
  }
  return openLine === -1 ? null : { start: openLine + 1, end: lines.length };
}

function shouldAnnotateStackLine(line) {
  const code = stripComments(stripStackTraceComment(line)).trim();
  return code !== "" && code !== "{" && code !== "}" && !code.startsWith("#");
}

function sourceThroughEditorLine(lines, row) {
  const range = findMainBodyRange(lines);
  if (!range || row < range.start || row >= range.end) return null;
  const copy = lines.map(stripStackTraceComment);
  for (let i = row + 1; i < range.end; i += 1) copy[i] = "";
  return copy.join("\n");
}

function annotateStackAtLine(level, lines, row) {
  if (row < 0 || row >= lines.length) return;
  const baseLine = stripStackTraceComment(lines[row]);
  if (!shouldAnnotateStackLine(baseLine)) {
    lines[row] = baseLine;
    return;
  }
  const source = sourceThroughEditorLine(lines, row);
  if (!source) return;
  try {
    const { state } = execute(level, source);
    lines[row] = `${baseLine.replace(/\s+$/, "")} // ${JSON.stringify(stackHexDisplay(state.stack))}`;
  } catch {
    lines[row] = baseLine;
  }
}

function runMiniEditor(level, filePath, initialContent) {
  return new Promise((resolve) => {
    const lines = initialContent.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (lines.length === 0) lines.push("");

    let cursorRow = 0;
    let cursorCol = 0;
    let scrollRow = 0;

    // Start cursor inside MAIN body
    const mainIdx = lines.findIndex((l) => /#define\s+macro\s+MAIN/i.test(l));
    if (mainIdx !== -1) {
      const bodyLine = mainIdx + 2;
      if (bodyLine < lines.length) {
        cursorRow = bodyLine;
        cursorCol = lines[bodyLine].length;
      }
    }

    const HEADER = 3;
    const FOOTER = 1;
    let finished = false;
    function w() { return process.stdout.columns || 80; }
    function editorRows() { return Math.max(1, (process.stdout.rows || 24) - HEADER - FOOTER); }
    function gw() { return String(lines.length).length + 1; }

    function clampCol() {
      const max = lines[cursorRow]?.length ?? 0;
      if (cursorCol > max) cursorCol = max;
    }

    function adjustScroll() {
      if (cursorRow < scrollRow) scrollRow = cursorRow;
      if (cursorRow >= scrollRow + editorRows()) scrollRow = cursorRow - editorRows() + 1;
      if (scrollRow < 0) scrollRow = 0;
    }

    function render() {
      const width = w();
      const eRows = editorRows();
      const g = gw();
      let out = "\x1b[?25l\x1b[H";

      // Header 1: level info (inverted)
      const info = ` ${levelHeading(level)}`;
      out += "\x1b[7m" + info.slice(0, width).padEnd(width) + "\x1b[0m\r\n";

      // Header 2: file path (dim)
      out += "\x1b[2m " + filePath.slice(0, width - 1).padEnd(width - 1) + "\x1b[0m\r\n";

      // Header 3: key hints (dim)
      const hints = "  ^S save+check   ^C cancel   Enter=stack note   Tab=4sp   ↑↓←→ navigate";
      out += "\x1b[2m" + hints.slice(0, width).padEnd(width) + "\x1b[0m\r\n";

      // Editor content
      for (let r = 0; r < eRows; r++) {
        const lineIdx = scrollRow + r;
        const lineNum = String(lineIdx < lines.length ? lineIdx + 1 : "").padStart(g);
        const marker = lineIdx < lines.length ? " " : "\x1b[2m~\x1b[0m";
        const content = lineIdx < lines.length
          ? (lines[lineIdx] ?? "").slice(0, width - g - 1)
          : "";
        out += `\x1b[2m${lineNum}\x1b[0m${marker}${content}\x1b[K\r\n`;
      }

      // Footer: status bar (inverted)
      const status = ` Ln ${cursorRow + 1}/${lines.length}  Col ${cursorCol + 1}  |  ^S save & check   ^C cancel`;
      out += "\x1b[7m" + status.slice(0, width).padEnd(width) + "\x1b[0m";

      // Position terminal cursor
      const screenRow = HEADER + (cursorRow - scrollRow) + 1;
      const screenCol = g + 1 + cursorCol + 1;
      out += `\x1b[${screenRow};${Math.min(screenCol, width)}H\x1b[?25h`;
      process.stdout.write(out);
    }

    function onResize() { render(); }
    process.stdout.on("resize", onResize);

    function finish(saved) {
      if (finished) return;
      finished = true;
      process.stdout.removeListener("resize", onResize);
      process.stdin.removeListener("data", handleData);
      process.removeListener("SIGINT", handleSigint);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write("\x1b[?25h\x1b[2J\x1b[H");
      resolve(saved ? { cancelled: false, content: lines.join("\n") + "\n" } : { cancelled: true });
    }

    function handleSigint() {
      finish(false);
    }

    function handleData(chunk) {
      const s = chunk.toString();
      let i = 0;
      while (i < s.length) {
        if (s[i] === "\x1b") {
          const rest = s.slice(i);
          if (rest.startsWith("\x1b[A")) {
            if (cursorRow > 0) { cursorRow--; clampCol(); adjustScroll(); } i += 3;
          } else if (rest.startsWith("\x1b[B")) {
            if (cursorRow < lines.length - 1) { cursorRow++; clampCol(); adjustScroll(); } i += 3;
          } else if (rest.startsWith("\x1b[C")) {
            if (cursorCol < (lines[cursorRow]?.length ?? 0)) cursorCol++;
            else if (cursorRow < lines.length - 1) { cursorRow++; cursorCol = 0; adjustScroll(); }
            i += 3;
          } else if (rest.startsWith("\x1b[D")) {
            if (cursorCol > 0) cursorCol--;
            else if (cursorRow > 0) { cursorRow--; cursorCol = lines[cursorRow]?.length ?? 0; adjustScroll(); }
            i += 3;
          } else if (rest.startsWith("\x1b[H")) {
            cursorCol = 0; i += 3;
          } else if (rest.startsWith("\x1b[F")) {
            cursorCol = lines[cursorRow]?.length ?? 0; i += 3;
          } else if (rest.startsWith("\x1b[1~")) {
            cursorCol = 0; i += 4;
          } else if (rest.startsWith("\x1b[4~")) {
            cursorCol = lines[cursorRow]?.length ?? 0; i += 4;
          } else if (rest.startsWith("\x1b[3~")) {
            const line = lines[cursorRow] ?? "";
            if (cursorCol < line.length) {
              lines[cursorRow] = line.slice(0, cursorCol) + line.slice(cursorCol + 1);
            } else if (cursorRow < lines.length - 1) {
              lines[cursorRow] = line + lines[cursorRow + 1];
              lines.splice(cursorRow + 1, 1);
            }
            i += 4;
          } else {
            i++;
          }
          continue;
        }

        const ch = s[i];
        i++;

        if (ch === "\x03") { finish(false); return; }
        if (ch === "\x13") { finish(true); return; }

        if (ch === "\r" || ch === "\n") {
          const line = lines[cursorRow] ?? "";
          const before = line.slice(0, cursorCol);
          const after = line.slice(cursorCol);
          const indent = /^(\s*)/.exec(before)?.[1] ?? "";
          lines[cursorRow] = before;
          annotateStackAtLine(level, lines, cursorRow);
          lines.splice(cursorRow + 1, 0, indent + after);
          cursorRow++;
          cursorCol = indent.length;
          adjustScroll();
          continue;
        }

        if (ch === "\x7f" || ch === "\x08") {
          if (cursorCol > 0) {
            const line = lines[cursorRow] ?? "";
            lines[cursorRow] = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
            cursorCol--;
          } else if (cursorRow > 0) {
            const prevLen = lines[cursorRow - 1]?.length ?? 0;
            lines[cursorRow - 1] = (lines[cursorRow - 1] ?? "") + (lines[cursorRow] ?? "");
            lines.splice(cursorRow, 1);
            cursorRow--;
            cursorCol = prevLen;
            adjustScroll();
          }
          continue;
        }

        if (ch === "\t") {
          const line = lines[cursorRow] ?? "";
          lines[cursorRow] = line.slice(0, cursorCol) + "    " + line.slice(cursorCol);
          cursorCol += 4;
          continue;
        }

        if (ch >= " " && ch.charCodeAt(0) < 127) {
          const line = lines[cursorRow] ?? "";
          lines[cursorRow] = line.slice(0, cursorCol) + ch + line.slice(cursorCol);
          cursorCol++;
        }
      }
      render();
    }

    process.on("SIGINT", handleSigint);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", handleData);
    render();
  });
}

async function openCodePad(rl, level, settings, filePath, { stopWatching = () => {}, startWatching = () => {} } = {}) {
  const resolved = path.resolve(filePath || defaultLevelPath(level));
  if (!fs.existsSync(resolved)) {
    writeTemplate(level, resolved, settings, false, false);
  }

  stopWatching();
  const rlSigintListeners = rl.listeners("SIGINT");
  const promptKeypressListeners = input.listeners("keypress");
  const swallowReadlineSigint = () => {};
  rl.removeAllListeners("SIGINT");
  rl.on("SIGINT", swallowReadlineSigint);
  input.removeAllListeners("keypress");
  rl.pause();
  let edit;
  try {
    edit = await runMiniEditor(level, resolved, fs.readFileSync(resolved, "utf8"));
  } finally {
    rl.removeListener("SIGINT", swallowReadlineSigint);
    for (const listener of rlSigintListeners) rl.on("SIGINT", listener);
    for (const listener of promptKeypressListeners) input.on("keypress", listener);
    rl.resume();
    if (input.isTTY) input.setRawMode(true);
    process.stdin.resume();
  }

  if (edit.cancelled) {
    output.write("\nCode pad closed without saving.\n");
    startWatching();
    return { wins: false, cancelled: true };
  }

  fs.writeFileSync(resolved, edit.content, "utf8");
  const result = renderHuffFileResult(level, resolved, settings);
  output.write(result.text);
  output.write("\n");
  startWatching();
  return result;
}

function advanceAfterWin(level, settings, completed) {
  completed.add(level.id);
  saveProgress(completed, currentMode);
  // Find next uncompleted level after this one, then wrap around if needed
  const next = levels.find((l) => l.id > level.id && !completed.has(l.id))
    || levels.find((l) => !completed.has(l.id));
  if (!next) {
    output.write(`\n  ${successText(`All ${levels.length} levels cleared.`)} The EVM yields to you.\n`);
    return level;
  }
  const rule = "  " + "─".repeat(54);
  output.write(`\n  ${successText(`${completed.size} of ${levels.length} complete.`)}\n`);
  output.write(`\n${rule}\n`);
  output.write(`  ${sectionLabel("Up Next")} ${levelHeading(next)}\n`);
  output.write(`${rule}\n`);
  output.write(describeLevelWithLesson(next, settings));
  output.write("\n");
  return next;
}

const COMMANDS = [
  ":code", ":template", ":template!", ":solution-template", ":skip",
  ":levels", ":level", ":mode", ":lesson", ":hint", ":solution",
  ":progress", ":reset", ":reset-progress",
  ":lessons", ":boilerplate", ":anvil",
  ":opcodes", ":ctx", ":clear", ":help", ":quit"
];

async function interactive() {
  const rl = readline.createInterface({ input, output });

  // ── command dropdown ──────────────────────────────────────────────────────
  // Wrap readline's own keypress listener so we can suppress it for specific
  // keys (↑/↓) without needing to patch private methods.
  let suppressNextRlKeypress = false;
  {
    const rlListeners = input.rawListeners('keypress');
    rlListeners.forEach((fn) => {
      input.removeListener('keypress', fn);
      input.on('keypress', (c, k) => {
        if (suppressNextRlKeypress) { suppressNextRlKeypress = false; return; }
        fn(c, k);
      });
    });
  }

  let acItems = [];     // current filtered list
  let acSelected = -1;  // -1 = not in list, 0+ = highlighted index
  let acDrawn = 0;      // suggestion lines currently rendered above the prompt
  let acTyped = '';     // input text saved before entering selection mode
  let acPromptStr = ''; // set before each rl.question call

  // Move up acDrawn rows, erase to end-of-screen, redraw suggestions + prompt.
  // Cursor lands at the end of the input — readline's next \r\x1b[K redraw
  // will correctly refresh that same row, keeping everything in sync.
  function acRender() {
    if (!output.isTTY) return;
    const count = Math.min(acItems.length, 6);
    const promptLine = acPromptStr.replace(/^\n/, '');
    const inputLine = rl.line ?? '';
    let seq = '';
    if (acDrawn > 0) seq += `\x1b[${acDrawn}A`;
    seq += '\r\x1b[J';
    for (let i = 0; i < count; i++) {
      seq += i === acSelected
        ? `\x1b[36;1m › ${acItems[i]}\x1b[0m\r\n`
        : `\x1b[2m   ${acItems[i]}\x1b[0m\r\n`;
    }
    seq += `\x1b[0m${promptLine}${inputLine}`;
    output.write(seq);
    acDrawn = count;
  }

  function acClose() {
    if (acDrawn === 0 && acItems.length === 0) return;
    const promptLine = acPromptStr.replace(/^\n/, '');
    const inputLine = rl.line ?? '';
    let seq = '';
    if (acDrawn > 0) seq += `\x1b[${acDrawn}A`;
    seq += `\r\x1b[J\x1b[0m${promptLine}${inputLine}`;
    output.write(seq);
    acDrawn = 0;
    acItems = [];
    acSelected = -1;
  }

  function acReset() {
    acDrawn = 0;
    acItems = [];
    acSelected = -1;
    acTyped = '';
  }

  input.prependListener('keypress', (char, key) => {
    if (!key || !output.isTTY) return;

    // ↓ — enter or advance selection
    if (acItems.length > 0 && key.name === 'down') {
      suppressNextRlKeypress = true;
      if (acSelected === -1) acTyped = rl.line;
      acSelected = Math.min(acSelected + 1, Math.min(acItems.length, 6) - 1);
      rl.write(null, { ctrl: true, name: 'u' });
      rl.write(acItems[acSelected]);
      acRender();
      return;
    }

    // ↑ — move up, or close dropdown if already at top
    if (acItems.length > 0 && key.name === 'up') {
      suppressNextRlKeypress = true;
      if (acSelected > 0) {
        acSelected--;
        rl.write(null, { ctrl: true, name: 'u' });
        rl.write(acItems[acSelected]);
        acRender();
      } else if (acSelected === 0) {
        acSelected = -1;
        rl.write(null, { ctrl: true, name: 'u' });
        rl.write(acTyped);
        acRender();
      } else {
        // Not in list yet — close dropdown, keep current input
        const line = rl.line ?? '';
        acItems = [];
        acSelected = -1;
        rl.write(null, { ctrl: true, name: 'u' });
        rl.write(line);
        acRender(); // count = 0 → just erases the suggestion lines
      }
      return;
    }

    // Enter — close dropdown, let readline submit
    if (key.name === 'return' || key.name === 'enter') {
      acClose();
      return;
    }

    // Escape — close dropdown, keep current input
    if (key.name === 'escape') {
      suppressNextRlKeypress = true;
      const line = rl.line ?? '';
      acItems = [];
      acSelected = -1;
      rl.write(null, { ctrl: true, name: 'u' });
      rl.write(line);
      acRender();
      return;
    }

    // Any other key: re-evaluate suggestions after readline updates rl.line
    setImmediate(() => {
      const line = rl.line ?? '';
      if (line.startsWith(':')) {
        acItems = COMMANDS.filter((c) => c.startsWith(line));
        acSelected = -1;
        acRender();
      } else if (acDrawn > 0) {
        acClose();
      }
    });
  });
  // ─────────────────────────────────────────────────────────────────────────

  const settings = { ...defaultSettings };
  const hintIndex = new Map();

  // ── mode selection ────────────────────────────────────────────────────────
  output.write(`\n  ${style.bold(style.magenta("Huff Dojo"))}\n\n`);
  output.write(`  ${style.bold("[1] Basic")}    — learn EVM opcodes and Huff from scratch (${basicLevels.length} levels)\n`);
  output.write(`  ${style.bold("[2] Advanced")} — apply what you know to solve harder challenges (${advancedLevels.length} levels)\n\n`);

  let chosenMode = null;
  while (!chosenMode) {
    const choice = (await rl.question("  Choose mode [1/2]: ")).trim().toLowerCase();
    if (choice === "1" || choice === "basic") {
      chosenMode = "basic";
    } else if (choice === "2" || choice === "advanced") {
      chosenMode = "advanced";
    } else {
      output.write(`  ${warningText("Please enter 1 (basic) or 2 (advanced).")}\n`);
    }
  }

  setMode(chosenMode);
  const completed = loadProgress(currentMode);

  let level = levels.find((l) => !completed.has(l.id)) || levels[0];

  // ── watcher ──────────────────────────────────────────────────────────────
  let watcher = null;
  let debounceTimer = null;
  let suppressNextWatchEventFor = null;

  function stopWatching() {
    if (watcher) { watcher.close(); watcher = null; }
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function startWatching() {
    stopWatching();
    const resolved = path.resolve(defaultLevelPath(level, currentMode));

    if (!fs.existsSync(resolved)) {
      writeTemplate(level, resolved, settings, false, false);
      suppressNextWatchEventFor = resolved;
      output.write(`${successText("Created")} ${path.basename(resolved)} — edit it to solve the level.\n`);
    }

    try {
      watcher = fs.watch(resolved, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            if (suppressNextWatchEventFor === resolved) {
              suppressNextWatchEventFor = null;
              return;
            }
            process.stdout.write("\r\x1b[2K"); // clear current prompt line
            const result = renderHuffFileResult(level, resolved, settings);
            output.write(result.text + "\n");
            if (result.wins) {
              level = advanceAfterWin(level, settings, completed);
              output.write(progressBar(completed.size, levels.length) + "\n");
              startWatching(); // watch the new level's file
            }
          } catch (err) {
            output.write(`\nERROR: ${err.message}\n`);
          }
          rl.write(null, { ctrl: true, name: "u" });
          acRender();
        }, 300);
      });
      watcher.on("error", stopWatching);
    } catch {
      // fs.watch unavailable in this environment — TUI editor still works
    }
  }

  // ── startup ───────────────────────────────────────────────────────────────
  output.write(`${startupText()}\n`);
  if (completed.size > 0) {
    output.write(`${sectionLabel("Resume")} ${currentMode} mode — ${progressBar(completed.size, levels.length)}\n`);
  } else {
    output.write(`${progressBar(0, levels.length)}\n`);
  }
  output.write(describeLevelWithLesson(level, settings));
  output.write(`\n${mutedLabel("Edit the Huff file in any editor and save, or use :code for the built-in editor.")}\n`);
  startWatching();

  // ── command loop ──────────────────────────────────────────────────────────
  while (true) {
    const mark = completed.has(level.id) ? "✓" : " ";
    acPromptStr = `\n[${modeConfig().promptPrefix}${mark}${level.id}] > `;
    const line = (await rl.question(acPromptStr)).trim();
    if (!line) continue;

    try {
      if (line.startsWith(":")) {
        const { cmd, arg } = parseCommandLine(line);
        const parts = line.slice(1).split(/\s+/).filter(Boolean);

        if (["quit", "q", "exit"].includes(cmd)) break;

        if (cmd === "levels") {
          output.write(`\n${listLevels(completed)}\n`);

        } else if (cmd === "level") {
          level = findLevel(arg);
          output.write(describeLevelWithLesson(level, settings));
          output.write("\n");
          startWatching();

        } else if (cmd === "mode") {
          const newMode = arg.toLowerCase();
          if (!["basic", "advanced"].includes(newMode)) {
            output.write(`\n${sectionLabel("Current Mode")} ${currentMode}. Use :mode basic or :mode advanced to switch.\n`);
          } else if (newMode === currentMode) {
            output.write(`\n${mutedLabel(`Already in ${currentMode} mode.`)}\n`);
          } else {
            setMode(newMode);
            const newCompleted = loadProgress(currentMode);
            completed.clear();
            for (const id of newCompleted) completed.add(id);
            level = levels.find((l) => !completed.has(l.id)) || levels[0];
            output.write(`\n${sectionLabel("Switched")} ${currentMode} mode.\n`);
            output.write(`${progressBar(completed.size, levels.length)}\n`);
            output.write(describeLevelWithLesson(level, settings));
            output.write("\n");
            startWatching();
          }

        } else if (cmd === "progress") {
          const done = [...completed].sort((a, b) => a - b);
          const remaining = levels.filter((l) => !completed.has(l.id)).map((l) => l.id);
          output.write(`\n${progressBar(done.length, levels.length)}\n`);
          if (done.length) output.write(`${successText("Completed")} : ${done.join(", ")}\n`);
          if (remaining.length) output.write(`${warningText("Remaining")} : ${remaining.join(", ")}\n`);
          output.write(`${sectionLabel("Current")}   : level ${level.id} — ${level.title}\n`);

        } else if (cmd === "skip") {
          completed.add(level.id);
          saveProgress(completed, currentMode);
          const next = levels.find((l) => !completed.has(l.id));
          output.write(`\n${warningText(`Skipped level ${level.id}.`)}\n`);
          if (next) {
            level = next;
            output.write(describeLevelWithLesson(level, settings));
            output.write("\n");
            startWatching();
          } else {
            output.write(`${successText("All levels skipped or completed.")}\n`);
          }

        } else if (cmd === "reset-progress") {
          completed.clear();
          saveProgress(completed, currentMode);
          level = levels[0];
          stopWatching();
          for (const l of levels) {
            const fp = path.resolve(defaultLevelPath(l, currentMode));
            try { fs.rmSync(fp); } catch { /* ignore if missing */ }
          }
          suppressNextWatchEventFor = path.resolve(defaultLevelPath(level, currentMode));
          output.write(`\n${warningText("Progress wiped.")} Starting from level 1.\n`);
          output.write(`${progressBar(0, levels.length)}\n`);
          output.write(describeLevelWithLesson(level, settings));
          output.write("\n");
          startWatching();

        } else if (cmd === "lesson") {
          output.write(describeLesson(level) || "\nNo lesson for this level.");
          output.write("\n");

        } else if (cmd === "lessons") {
          if (!["on", "off"].includes(arg)) {
            output.write(`\n${sectionLabel("Lessons")} ${settings.lessons ? "on" : "off"}. Use :lessons on or :lessons off.\n`);
          } else {
            settings.lessons = arg === "on";
            output.write(`\n${sectionLabel("Lessons")} ${settings.lessons ? "on" : "off"}.\n`);
          }

        } else if (cmd === "template" || cmd === "template!") {
          const fp = arg || defaultLevelPath(level, currentMode);
          const written = writeTemplate(level, fp, settings, false, cmd === "template!");
          output.write(`\n${successText("Wrote starter Huff contract")} ${written}\n`);

        } else if (cmd === "code" || cmd === "edit") {
          const fp = arg || defaultLevelPath(level, currentMode);
          const result = await openCodePad(rl, level, settings, fp, { stopWatching, startWatching });
          suppressNextWatchEventFor = path.resolve(fp);
          if (result.wins) {
            level = advanceAfterWin(level, settings, completed);
            suppressNextWatchEventFor = null;
            output.write(progressBar(completed.size, levels.length) + "\n");
            startWatching();
          }

        } else if (cmd === "solution-template" || cmd === "solution-template!") {
          const fp = arg || defaultLevelPath(level, currentMode).replace(/\.huff$/, ".solution.huff");
          const written = writeTemplate(level, fp, settings, true, cmd === "solution-template!");
          output.write(`\n${successText("Wrote solution Huff contract")} ${written}\n`);

        } else if (cmd === "boilerplate") {
          if (!["on", "off"].includes(arg)) {
            output.write(`\n${sectionLabel("Boilerplate")} ${settings.boilerplate ? "on" : "off"}. Use :boilerplate on or :boilerplate off.\n`);
          } else {
            settings.boilerplate = arg === "on";
            output.write(`\n${sectionLabel("Boilerplate")} ${settings.boilerplate ? "on" : "off"}.\n`);
          }

        } else if (cmd === "anvil") {
          if (parts[1] === "on") settings.anvil = true;
          if (parts[1] === "off") settings.anvil = false;
          if (parts[2]) settings.rpcUrl = parts[2];
          output.write(`\n${sectionLabel("Anvil")} checks are ${settings.anvil ? "on" : "off"} at ${settings.rpcUrl}.\n`);
          if (settings.anvil) {
            output.write(`${mutedLabel("Start Anvil separately with `anvil`; the dojo will deploy with Anvil's default account.")}\n`);
          }

        } else if (cmd === "hint") {
          const hintKey = `${currentMode}:${level.id}`;
          const idx = hintIndex.get(hintKey) || 0;
          const hint = level.hints[Math.min(idx, level.hints.length - 1)];
          hintIndex.set(hintKey, idx + 1);
          output.write(`\n${sectionLabel(`Hint ${Math.min(idx + 1, level.hints.length)}/${level.hints.length}`)} ${hint}\n`);

        } else if (cmd === "solution") {
          output.write(`\n${sectionLabel("Raw opcodes")}\n${level.solution}\n\n${sectionLabel("Huff body")}\n${rawOpcodesToHuff(level.solution)}\n`);

        } else if (cmd === "opcodes") {
          output.write(`\n${opcodeHelp.join("\n")}\n`);

        } else if (cmd === "ctx") {
          output.write(`\n${sectionLabel("Context")}\n${formatContext(level.context || {}) || "empty context"}\n`);

        } else if (cmd === "reset") {
          hintIndex.set(`${currentMode}:${level.id}`, 0);
          output.write(`\n${successText("Hint counter reset.")}\n`);

        } else if (cmd === "help") {
          output.write(`\n${interactiveHelp()}\n`);

        } else if (cmd === "clear") {
          acReset();
          output.write("\x1b[3J\x1b[2J\x1b[H");
          output.write(`${progressBar(completed.size, levels.length)}\n`);
          output.write(describeLevelWithLesson(level, settings));
          output.write("\n");

        } else {
          output.write(`\n${errorText(`Unknown command :${cmd}.`)} Try :help.\n`);
        }
        continue;
      }

      // bare opcode/Huff practice
      const result = renderSimulatorResult(level, line, { canWin: false });
      output.write(result.text + "\n");
    } catch (error) {
      output.write(`\n${errorText("ERROR")} ${error.message}\n`);
    }
  }

  stopWatching();
  rl.close();
}

function argsMap(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      map.set(key, true);
    } else {
      map.set(key, next);
      i += 1;
    }
  }
  return map;
}

function runSelfTest() {
  const failures = [];
  const originalMode = currentMode;
  for (const [modeName, modelevels] of [["basic", basicLevels], ["advanced", advancedLevels]]) {
    setMode(modeName);
    for (const [index, level] of modelevels.entries()) {
      if (level.id !== index + 1) failures.push(`${modeName} level IDs are not contiguous at ${level.id}.`);
      if (!modeConfig(modeName).lessons[level.id]) failures.push(`${modeName} Level ${level.id} has no lesson text.`);
      try {
        const result = renderResult(level, level.solution);
        if (!result.pass) failures.push(`${modeName} Level ${level.id} failed:\n${result.text}`);
        const templateResult = renderResult(level, buildHuffTemplate(level, defaultSettings, true));
        if (!templateResult.pass) failures.push(`${modeName} Level ${level.id} solved template failed:\n${templateResult.text}`);
      } catch (error) {
        failures.push(`${modeName} Level ${level.id} threw: ${error.message}`);
      }
    }
  }
  setMode(originalMode);

  if (keccak256("addTwo(uint256,uint256)").slice(0, 8) !== "0f52d66e") {
    failures.push("Keccak function selector regression.");
  }
  if (keccak256("Answer(uint256)") !== "e1cca926219c5c0c4684e42406e9dd0d82c5ee506e35dea074e251b1a5de0706") {
    failures.push("Keccak event hash regression.");
  }
  const migrated = [...normalizeCompleted("basic", [15, 16, 25, 26, 29], 1)];
  if (JSON.stringify(migrated) !== JSON.stringify([16, 18, 27, 30, 33])) {
    failures.push(`Basic progress migration regression: ${JSON.stringify(migrated)}`);
  }

  if (failures.length) {
    console.error(failures.join("\n\n"));
    return 1;
  }
  console.log(`Self-test passed: ${basicLevels.length} basic + ${advancedLevels.length} advanced solutions solved.`);
  return 0;
}

async function main() {
  const args = argsMap(process.argv.slice(2));
  if (args.has("help") || args.has("h")) {
    console.log(usage());
    return;
  }
  if (args.has("self-test")) {
    process.exitCode = runSelfTest();
    return;
  }
  // Apply --mode flag for non-interactive CLI paths
  if (args.has("mode")) {
    const m = args.get("mode").toLowerCase();
    if (m === "basic" || m === "advanced") {
      setMode(m);
    } else {
      console.error(`Unknown mode "${args.get("mode")}". Use --mode basic or --mode advanced.`);
      process.exitCode = 1;
      return;
    }
  }
  if (args.has("template")) {
    const level = findLevel(args.get("template"));
    const settings = {
      ...defaultSettings,
      boilerplate: !args.has("no-boilerplate"),
      lessons: !args.has("no-lessons")
    };
    const filePath = args.get("file") || defaultLevelPath(level);
    const written = writeTemplate(level, filePath, settings, args.has("solution"), args.has("force"));
    console.log(`Wrote starter Huff contract:\n${written}`);
    return;
  }
  if (args.has("level") && args.has("file")) {
    const level = findLevel(args.get("level"));
    const settings = {
      ...defaultSettings,
      lessons: !args.has("no-lessons"),
      anvil: args.has("anvil"),
      rpcUrl: args.get("rpc-url") || defaultSettings.rpcUrl,
      privateKey: args.get("private-key") || defaultSettings.privateKey,
      from: args.get("from") || defaultSettings.from
    };
    console.log(describeLevelWithLesson(level, settings));
    const result = renderHuffFileResult(level, args.get("file"), settings);
    console.log(result.text);
    process.exitCode = result.wins ? 0 : 1;
    return;
  }
  if (args.has("level") && args.has("program")) {
    const level = findLevel(args.get("level"));
    const settings = { ...defaultSettings, lessons: !args.has("no-lessons") };
    console.log(describeLevelWithLesson(level, settings));
    const result = renderSimulatorResult(level, args.get("program"), { canWin: false });
    console.log(result.text);
    process.exitCode = result.pass ? 0 : 1;
    return;
  }
  await interactive();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
