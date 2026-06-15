# Huff Dojo

A zero-dependency CLI game for learning EVM opcodes and Huff from scratch.

Huff Dojo has two separate tracks:

| Track | Purpose |
|-------|---------|
| Basic | Learn Huff and EVM opcodes from scratch, one concept at a time. |
| Advanced | Solve larger challenges using the opcodes learned in Basic. |

Each track has its own level files and saved progress. The game watches your file — save from any editor and results appear instantly.

## Quick start

```bash
cd path/to/huff-dojo
npm start
```

On startup, choose `Basic` or `Advanced`. The game creates the first level file and starts watching it. Write the solution in the `MAIN` body and save — the game compiles, checks, and advances automatically.

Basic files are named `dojo-levels/level-XX.huff`; Advanced files are `dojo-levels/advanced-XX.huff`. Files are created on demand as you reach each level and deleted when you reset progress.

If you prefer not to leave the terminal, `:code` opens a built-in TUI editor:

```
[B 1] > :code
```

`^S` saves and checks. `^C` cancels without saving.

## Prerequisites

The game ships with a built-in opcode simulator that works without any tools installed. To compile real Huff contracts and win levels, install `hnc`:

```bash
curl -L https://raw.githubusercontent.com/cakevm/huff-neo/main/hnc-up/install | bash
source ~/.zshrc
hnc-up
```

For the optional Anvil integration (live on-chain checks):

```bash
curl -L https://foundry.paradigm.xyz | bash
source ~/.zshrc
foundryup
# then in a separate terminal:
anvil
```

## Levels

| Track | Levels | Topics |
|-------|--------|--------|
| Basic | 33 | Stack, arithmetic, bitwise ops, shifts, calldata, memory, storage, conditional and unconditional jumps, Huff MAIN macro, helper macros, selectors, all context and block opcodes, CALLDATACOPY, MSTORE8/MSIZE, LOG opcodes, ABI events, custom errors, Huff constants, `__FUNC_SIG`, `__BYTES`/`__RIGHTPAD`, `FREE_STORAGE_POINTER` |
| Advanced | 12 | Single and multi-function dispatchers, guarded arithmetic, ABI calldata, auth gates, persistent counters, event emission, calldata echo, multi-word returns, packed storage, branching, custom error reverts |

Use `:levels` to see all levels with completion marks. Use `:mode basic` or `:mode advanced` to switch tracks.

## Workflow

### File-watch mode (default)

The game watches the current level file. Edit the `MAIN` body in any editor — VS Code, vim, nano — and save. Results appear within a third of a second:

```
[B 7] >
  File .../dojo-levels/level-07.huff
  Bytecode 0x6002600360…  (12 bytes)

  ══════════════════════════════════════════════════════════
  ✓  Level 7 cleared — Congratulations!
  ══════════════════════════════════════════════════════════

  Steps: 4   Instructions: 4   Stack: ["0x2a"]

  7 of 33 complete.

  ──────────────────────────────────────────────────────
  Up Next  Level 8: Toggle and Invert
  ──────────────────────────────────────────────────────
[████░░░░░░░░░░░░░░░░░░░░] 7/33 (21%)
```

### Built-in TUI editor

```
[B 7] > :code
```

Full-screen editor inside the terminal. Line numbers, auto-indent, scroll. Key bindings:

| Key | Action |
|-----|--------|
| `^S` | Save, compile, and check |
| `^C` | Cancel without saving |
| `Enter` | Insert newline and annotate the current line with the stack state at that point |
| Arrow keys | Move cursor |
| `Tab` | Insert 4 spaces |
| `Home` / `End` | Start / end of line |
| `Delete` | Delete character forward |
| `Backspace` | Delete character backward |

The `Enter` stack annotation writes a `// [...]` comment at the end of the current line showing what the stack looks like after the code on that line executes. This lets you track stack state line-by-line as you write.

### Command autocomplete

Typing `:` at the prompt shows a dropdown of matching commands. Use `↑` / `↓` to navigate, `Enter` to select, `Escape` to dismiss.

### Non-interactive mode

Run a single attempt without starting the game:

```bash
node ./bin/huff-dojo.js --level 2 --program "PUSH1 0x02 PUSH1 0x03 ADD"
```

Compile and check a file directly:

```bash
node ./bin/huff-dojo.js --level 7 --file ./dojo-levels/level-07.huff
```

Use `--mode advanced` for Advanced levels:

```bash
node ./bin/huff-dojo.js --mode advanced --level 1 --file ./dojo-levels/advanced-01.huff
```

Generate a starter template:

```bash
node ./bin/huff-dojo.js --template 7 --file ./dojo-levels/level-07.huff
node ./bin/huff-dojo.js --template 7 --file ./dojo-levels/level-07.huff --no-lessons
node ./bin/huff-dojo.js --template 7 --file ./dojo-levels/level-07.huff --no-boilerplate
node ./bin/huff-dojo.js --template 7 --file ./dojo-levels/level-07.huff --solution
node ./bin/huff-dojo.js --template 7 --file ./dojo-levels/level-07.huff --force
```

Check a file against Anvil directly:

```bash
node ./bin/huff-dojo.js --level 7 --file ./dojo-levels/level-07.huff --anvil --rpc-url http://127.0.0.1:8545
```

## Commands

```
:code [file]              open the built-in TUI editor (^S save+check, ^C cancel)
:template [file]          write a starter Huff contract if the file does not exist
:template! [file]         overwrite the starter Huff contract
:solution-template [file] write a solved Huff contract

:levels                   list all levels with [x]/[ ] completion marks
:level <number>           jump to a specific level
:mode basic|advanced      switch between Basic and Advanced
:lesson                   reread the lesson for the current level
:hint                     show the next hint (up to 3 per level)
:solution                 reveal the reference solution

:progress                 show progress bar and completed/remaining counts
:skip                     mark the current level done and move on without solving
:reset                    reset the hint counter for this level back to hint 1
:reset-progress           wipe all saved progress, delete all level files, and start from level 1

:lessons on|off           show or hide lesson text when loading a level
:boilerplate on|off       include or omit the CONSTRUCTOR scaffold in new templates
:anvil on [rpc-url]       deploy compiled bytecode against local Anvil after each check
:anvil off                disable Anvil checks

:opcodes                  list all simulator-supported opcodes
:ctx                      show the level's initial calldata / callvalue / storage
:help                     show this reference
:quit                     exit
```

Anything typed that does not start with `:` is run through the opcode simulator for instant feedback. Practice mode can match the expected output, but advancing a level requires a compiled Huff file.

## Progress

Progress is saved automatically per track:

| Track | Save file |
|-------|-----------|
| Basic | `~/.huff-dojo-basic-progress.json` |
| Advanced | `~/.huff-dojo-advanced-progress.json` |

On next launch, choose a track and the game resumes at the first uncompleted level. An older `~/.huff-dojo-progress.json` is read as a legacy fallback.

```
Resuming basic mode — [█████████░░░░░░░░░░░░░░░] 12/33 (36%)
```

To wipe progress and delete all level files:

```
[B 12] > :reset-progress
```

## Check pipeline

When a level is checked (on file save or `^S` in the TUI editor):

1. **Compile** — runs `hnc -b` on the Huff file.
2. **Simulate** — extracts the `MAIN` body, runs it through the built-in teaching EVM, and compares the final stack / return data / storage / logs against the level's expected state.
3. **Anvil** (optional, `:anvil on`) — deploys the compiled bytecode to a local Anvil node and calls the contract over JSON-RPC.

All enabled checks must pass to win the level. The simulator is enough for practicing opcode logic; the compiler check confirms the Huff file itself is valid.

## Simulator opcodes

`STOP` `ADD` `MUL` `SUB` `DIV` `MOD` `ADDMOD` `MULMOD` `EXP` `SIGNEXTEND` `LT` `GT` `SLT` `SGT` `EQ` `ISZERO` `AND` `OR` `XOR` `NOT` `BYTE` `SHL` `SHR` `SAR` `POP` `MLOAD` `MSTORE` `MSTORE8` `MSIZE` `SLOAD` `SSTORE` `JUMP` `JUMPI` `JUMPDEST` `PUSH0` `PUSH1`–`PUSH32` `DUP1`–`DUP16` `SWAP1`–`SWAP16` `ADDRESS` `BALANCE` `ORIGIN` `CALLER` `CALLVALUE` `GASPRICE` `COINBASE` `TIMESTAMP` `NUMBER` `PREVRANDAO` `GASLIMIT` `CHAINID` `SELFBALANCE` `BASEFEE` `GAS` `CALLDATALOAD` `CALLDATASIZE` `CALLDATACOPY` `RETURN` `REVERT` `LOG0`–`LOG4`

Labels are supported in practice mode and in the simulator:

```
CALLVALUE PUSH @ok JUMPI PUSH0 PUSH0 REVERT ok: PUSH1 0x2a
```

## Self-test

```bash
npm test
```

Runs every Basic and Advanced reference solution through the simulator and verifies they all pass.
