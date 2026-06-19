export const basicLevels = [
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

export const advancedLevels = [
  {
    id: 1,
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
    id: 2,
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
    id: 3,
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
    id: 4,
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
    id: 5,
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
    id: 6,
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
    id: 7,
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
    id: 8,
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
    id: 9,
    title: "getTimeAndBlock()",
    prompt: "Implement getTimeAndBlock() which returns (timestamp, blocknumber) as two ABI uint256 words. timestamp=0x100, number=0x200. (huff-puzzles: TimeAndBlock)",
    context: {
      timestamp: "0x100",
      number: "0x200",
      calldata: "0xce58b56e00000000000000000000000000000000000000000000000000000000"
    },
    expect: {
      returnData: "0x00000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200"
    },
    hints: [
      "TIMESTAMP pushes block.timestamp. NUMBER pushes block.number.",
      "Store timestamp at memory offset 0, block number at offset 0x20, then RETURN 0x40 bytes.",
      "Route __FUNC_SIG(getTimeAndBlock) first and REVERT on unknown selectors."
    ],
    solution: "#define function getTimeAndBlock() payable returns(uint256,uint256)\n#define macro MAIN() = takes(0) returns(0) {\n    0x00 calldataload 0xe0 shr\n    __FUNC_SIG(getTimeAndBlock) eq gtab jumpi\n    0x00 0x00 revert\n    gtab:\n        timestamp 0x00 mstore\n        number 0x20 mstore\n        0x40 0x00 return\n}"
  },
  {
    id: 10,
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
    id: 11,
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
    id: 12,
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
    id: 13,
    title: "Donations",
    prompt: "Implement a donation receiver: when called with no calldata, add msg.value to the caller's balance in storage. Caller is 0xd00d, donating 0x100 wei. (huff-puzzles: Donations)",
    context: { caller: "0xd00d", callvalue: "0x100" },
    expect: { storage: { "0xd00d": "0x100" } },
    hints: [
      "When CALLDATASIZE is 0, this is a receive-ether call. Use calldatasize iszero to detect it.",
      "Accumulate donations: SLOAD the caller's current total, ADD msg.value, SSTORE back at the caller's address slot.",
      "Stack before SSTORE: [new_total, caller]. SSTORE pops key (top=caller) then value — swap first: swap1 sstore."
    ],
    solution: "#define function donated(address) payable returns(uint256)\n#define macro MAIN() = takes(0) returns(0) {\n    calldatasize iszero receive jumpi\n    0x00 calldataload 0xe0 shr\n    __FUNC_SIG(donated) eq donated jumpi\n    0x00 0x00 revert\n    receive:\n        caller\n        dup1 sload\n        callvalue add\n        swap1 sstore\n        stop\n    donated:\n        0x04 calldataload\n        0xffffffffffffffffffffffffffffffffffffffff and\n        sload\n        0x00 mstore\n        0x20 0x00 return\n}"
  },
  // ── huff-puzzles (RareSkills) ──────────────────────────────────────────────
  {
    id: 14,
    title: "multiply() with Overflow Guard",
    prompt: "Implement multiply(uint256, uint256) → product. Revert on overflow. Inputs are 6 and 7, expected output is 42. (huff-puzzles: Multiply)",
    context: { calldata: "0x165c4a1600000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000007" },
    expect: { returnData: "0x000000000000000000000000000000000000000000000000000000000000002a" },
    hints: [
      "Load a (offset 0x04) and b (offset 0x24). Overflow check: if a != 0 and (a*b)/a != b, revert.",
      "Pattern: dup2 iszero no_check jumpi → dup1 dup3 mul → dup3 div → dup2 eq → no_check jumpi → REVERT",
      "After the check, stack still holds [b, a]. MUL them, MSTORE, and RETURN."
    ],
    solution: "#define function multiply(uint256,uint256) payable returns(uint256)\n#define macro MAIN() = takes(0) returns(0) {\n    0x00 calldataload 0xe0 shr\n    __FUNC_SIG(multiply) eq multiply jumpi\n    0x00 0x00 revert\n    multiply:\n        0x04 calldataload\n        0x24 calldataload\n        dup2 iszero no_check jumpi\n        dup1 dup3 mul\n        dup3 div\n        dup2 eq\n        no_check jumpi\n        0x00 0x00 revert\n    no_check:\n        mul\n        0x00 mstore\n        0x20 0x00 return\n}"
  },
  {
    id: 15,
    title: "getTimeElapsed / getTimeUntil",
    prompt: "Implement getTimeElapsed(uint256) → max(0, timestamp - arg) and getTimeUntil(uint256) → max(0, arg - timestamp). timestamp=0x1000, arg=0x800, expected elapsed=0x800. (huff-puzzles: CountTime)",
    context: {
      timestamp: "0x1000",
      calldata: "0xfd1b192e0000000000000000000000000000000000000000000000000000000000000800"
    },
    expect: { returnData: "0x0000000000000000000000000000000000000000000000000000000000000800" },
    hints: [
      "For elapsed: if arg > timestamp return 0; else return timestamp - arg. Use GT then ISZERO+JUMPI for the branch.",
      "GT(top=a, below=b) returns b>a. After loading [ts, arg] with ts on top, dup2 dup2 gt gives arg>ts.",
      "For the subtraction: stack is [ts, arg] with ts on top. swap1 then sub gives ts - arg."
    ],
    solution: "#define function getTimeElapsed(uint256) payable returns(uint256)\n#define function getTimeUntil(uint256) payable returns(uint256)\n#define macro MAIN() = takes(0) returns(0) {\n    0x00 calldataload 0xe0 shr\n    dup1 __FUNC_SIG(getTimeElapsed) eq elapsed jumpi\n    dup1 __FUNC_SIG(getTimeUntil) eq until jumpi\n    0x00 0x00 revert\n    elapsed:\n        pop\n        0x04 calldataload\n        timestamp\n        dup2 dup2 gt\n        iszero ok_e jumpi\n        pop pop\n        0x00 0x00 mstore\n        0x20 0x00 return\n    ok_e:\n        swap1 sub\n        0x00 mstore\n        0x20 0x00 return\n    until:\n        pop\n        0x04 calldataload\n        timestamp\n        dup2 dup2 gt\n        ok_u jumpi\n        pop pop\n        0x00 0x00 mstore\n        0x20 0x00 return\n    ok_u:\n        sub\n        0x00 mstore\n        0x20 0x00 return\n}"
  },
  {
    id: 16,
    title: "Emit Value Event",
    prompt: "Implement value(uint256 a, uint256 b) which emits Value(uint256 indexed a, uint256 b). Calldata: value(7, 11). (huff-puzzles: Emitter)",
    context: { calldata: "0x3996e6560000000000000000000000000000000000000000000000000000000000000007000000000000000000000000000000000000000000000000000000000000000b" },
    expect: {
      logs: [{
        topics: [
          "0xd0df8930e73a69258b2c5f54b88f056f4a3594e30a976d7e9d02f45cb0c8d72f",
          "0x0000000000000000000000000000000000000000000000000000000000000007"
        ],
        data: "0x000000000000000000000000000000000000000000000000000000000000000b"
      }]
    },
    hints: [
      "Declare #define event Value(uint256,uint256). Use __EVENT_HASH(Value) for topic[0].",
      "LOG2 pops: offset, size, then two topics (last popped = topic[0]). Push in order: event_hash, indexed_arg, size, offset.",
      "Store the non-indexed arg b in memory for the log data. Then push __EVENT_HASH(Value), a (from cd[0x04]), 0x20, 0x00, LOG2."
    ],
    solution: "#define function value(uint256,uint256) payable returns()\n#define event Value(uint256,uint256)\n#define macro MAIN() = takes(0) returns(0) {\n    0x00 calldataload 0xe0 shr\n    __FUNC_SIG(value) eq emit jumpi\n    0x00 0x00 revert\n    emit:\n        0x24 calldataload 0x00 mstore\n        __EVENT_HASH(Value)\n        0x04 calldataload\n        0x20\n        0x00\n        log2\n        stop\n}"
  },
  {
    id: 17,
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
  },
  {
    id: 18,
    title: "Revert with String",
    prompt: "Always revert with the ABI-encoded string error \"Only Huff\". (huff-puzzles: RevertString)",
    context: {},
    expect: {
      returnData: "0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000094f6e6c7920487566660000000000000000000000000000000000000000000000",
      reverted: true
    },
    hints: [
      "The ABI-encoded string revert payload is: Error(string) selector (0x08c379a0) + offset (0x20) + length (9) + \"Only Huff\" left-aligned in 32 bytes.",
      "Write the selector left-aligned: 0x08c379a0 0xe0 shl stores it in the top 4 bytes of the word at offset 0.",
      "Store the string left-aligned: 0x4f6e6c792048756666 0xb8 shl at memory offset 0x44. Then REVERT 100 (0x64) bytes from offset 0."
    ],
    solution: "#define macro MAIN() = takes(0) returns(0) {\n    0x08c379a0 0xe0 shl 0x00 mstore\n    0x20 0x04 mstore\n    0x09 0x24 mstore\n    0x4f6e6c792048756666 0xb8 shl 0x44 mstore\n    0x64 0x00 revert\n}"
  },
  {
    id: 19,
    title: "sumArray(uint256[])",
    prompt: "Implement sumArray(uint256[]) which returns the sum of all elements. Input is [3, 5, 7], expected sum is 15. (huff-puzzles: SumArray)",
    context: { calldata: "0x1e2aea0600000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000007" },
    expect: { returnData: "0x000000000000000000000000000000000000000000000000000000000000000f" },
    hints: [
      "Array length is at calldata offset 0x24. Elements start at 0x44 (offset = 0x44 + index * 0x20).",
      "Stack layout during the loop: [len (bottom), i, sum (top)]. Compare i and len with dup2 dup4 eq.",
      "Loop body: dup2 (i) compute offset, calldataload element, swap1 add the element to sum, then swap1 0x01 add swap1 to increment i."
    ],
    solution: "#define function sumArray(uint256[]) payable returns(uint256)\n#define macro MAIN() = takes(0) returns(0) {\n    0x00 calldataload 0xe0 shr\n    __FUNC_SIG(sumArray) eq sumarray jumpi\n    0x00 0x00 revert\n    sumarray:\n        0x24 calldataload\n        0x00\n        0x00\n    loop:\n        dup2 dup4 eq done jumpi\n        dup2 0x20 mul 0x44 add calldataload\n        swap1 add\n        swap1 0x01 add swap1\n        loop jump\n    done:\n        0x00 mstore\n        0x20 0x00 return\n}"
  },
  {
    id: 20,
    title: "maxOfArray(uint256[])",
    prompt: "Implement maxOfArray(uint256[]) which returns the maximum. Revert if empty. Input is [5, 3, 9, 2], expected max is 9. (huff-puzzles: MaxOfArray)",
    context: { calldata: "0xa9505eb4000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000090000000000000000000000000000000000000000000000000000000000000002" },
    expect: { returnData: "0x0000000000000000000000000000000000000000000000000000000000000009" },
    hints: [
      "Revert if length is zero. Initialize max = arr[0], i = 1. Stack layout: [len (bottom), max, i (top)].",
      "Compare each arr[i] to max with dup1 dup4 gt (GT pops top=max, below=arr[i], returns arr[i]>max).",
      "To update max: swap2 pop (replaces old max with arr[i]). Always increment i with 0x01 add."
    ],
    solution: "#define function maxOfArray(uint256[]) payable returns(uint256)\n#define macro MAIN() = takes(0) returns(0) {\n    0x00 calldataload 0xe0 shr\n    __FUNC_SIG(maxOfArray) eq maxofarray jumpi\n    0x00 0x00 revert\n    maxofarray:\n        0x24 calldataload\n        dup1 iszero revert_empty jumpi\n        0x44 calldataload\n        0x01\n    loop:\n        dup1 dup4 eq done jumpi\n        dup1 0x20 mul 0x44 add calldataload\n        dup1 dup4 gt\n        update_max jumpi\n        pop\n        0x01 add\n        loop jump\n    update_max:\n        swap2 pop\n        0x01 add\n        loop jump\n    done:\n        swap1\n        0x00 mstore\n        0x20 0x00 return\n    revert_empty:\n        0x00 0x00 revert\n}"
  },
  // ── Huffathon 2023 — devtooligan/huffathon-2023-challenge-0-1 ──────────────
  {
    id: 21,
    title: "Stackoor",
    prompt: "Arrange exactly 11 stack items using TIMESTAMP, CALLER, NUMBER, 0x69, and SHR. Each EVM value is shifted right by 0x69 bits. timestamp=3*2^105, caller=5*2^105, number=7*2^105. (huffathon-2023 challenge-0-1)",
    context: {
      timestamp: "0x600000000000000000000000000",
      caller:    "0xa00000000000000000000000000",
      number:    "0xe00000000000000000000000000"
    },
    expect: {
      stack: ["0x5", "0x69", "0x5", "0x7", "0x69", "0x3", "0x69", "0x5", "0x7", "0x5", "0x3"]
    },
    hints: [
      "Each EVM env opcode (TIMESTAMP, CALLER, NUMBER) is followed by PUSH1 0x69 then SHR to produce one stack item.",
      "Build the stack from bottom to top: push the bottom item first, the top item last.",
      "Required bottom-to-top order: caller>>0x69, 0x69, caller>>0x69, number>>0x69, 0x69, timestamp>>0x69, 0x69, number>>0x69, caller>>0x69, caller>>0x69, timestamp>>0x69 (top)."
    ],
    solution: "CALLER 0x69 SHR  0x69  CALLER 0x69 SHR  NUMBER 0x69 SHR  0x69  TIMESTAMP 0x69 SHR  0x69  CALLER 0x69 SHR  NUMBER 0x69 SHR  CALLER 0x69 SHR  TIMESTAMP 0x69 SHR"
  }
];
