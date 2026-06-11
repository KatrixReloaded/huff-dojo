# Huff Dojo

A zero-dependency CLI game for learning EVM opcodes and Huff-style stack thinking.

Huff Dojo has two separate tracks:

| Track | Purpose |
|-------|---------|
| Basic | Learn Huff and EVM opcodes from scratch, one concept at a time. |
| Advanced | Solve larger challenges using the opcodes learned in Basic. |

Each track has its own level files and saved progress, so Basic and Advanced behave like separate game instances. The game watches your file — save from any editor and results appear instantly.

## Quick start

```bash
cd ~/Desktop/Learning/huff-dojo
npm start
```

On startup, choose `Basic` or `Advanced`. The game creates the first file for that track and starts watching it. Open the file in your editor of choice, write the solution in the `MAIN` body, and save. The game compiles, checks, and advances automatically.

Basic files are named `dojo-levels/level-XX.huff`; Advanced files are named `dojo-levels/advanced-XX.huff`.

If you prefer not to leave the terminal, `:code` opens a built-in TUI editor:

```
[✓1] > :code
```

`^S` inside the editor saves and checks. `^C` cancels.

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

Levels are split across two tracks:

| Track | Current lessons |
|-------|-----------------|
| Basic | 33 lessons covering stack basics, arithmetic, calldata, memory, storage, conditional and unconditional jumps, helper macros, selectors, context opcodes, ABI events, custom errors, and compile-time builtins |
| Advanced | 12 challenges covering dispatchers, routing, guarded arithmetic, auth gates, counters, event logs, calldata echoes, packed storage, and custom errors |

Use `:levels` to see the levels in the current track with completion marks. Use `:mode basic` or `:mode advanced` to switch tracks.

## Workflow

### File-watch mode (default)

The game watches the current track's Huff file in the background. Edit the `MAIN` body in any editor — VS Code, vim, nano — and save. Results appear in the game terminal within a third of a second:

```
Watching level-07.huff — edit and save to check automatically.

[✓7] >
Huff file: .../level-07.huff
Compiled bytecode: 0x6002a6000...

PASS
Steps: 4 | Instructions: 4
Stack: []
Return: 0x000000000000000000000000000000000000000000000000000000000000002a

Level 7 cleared. (7/33 done) Moving to level 8.
[█████░░░░░░░░░░░░░░░░░░░] 7/33 (21%)
```

### Built-in TUI editor

```
[✓7] > :code
```

Full-screen editor inside the terminal. Line numbers, auto-indent, scroll. Key bindings:

| Key | Action |
|-----|--------|
| `^S` | Save, compile, and check |
| `^C` | Cancel without saving |
| Arrow keys | Move cursor |
| `Tab` | Insert 4 spaces |
| `Home` / `End` | Start / end of line |
| `Delete` | Delete character forward |
| `Backspace` | Delete character backward |

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
:reset                    reset the hint counter for this level
:reset-progress           wipe all saved progress and start from level 1

:lessons on|off           show or hide lesson text when loading a level
:boilerplate on|off       include or omit the CONSTRUCTOR scaffold in new templates
:anvil on [rpc-url]       deploy compiled bytecode against local Anvil after each check
:anvil off                disable Anvil checks

:opcodes                  list all simulator-supported opcodes
:ctx                      show the level's initial calldata / callvalue / storage
:help                     show this reference
:quit                     exit
```

Anything typed that does not start with `:` is run through the opcode simulator for instant feedback. Practice can match the expected output, but advancing a level requires a compiled Huff file.

## Progress

Progress is saved automatically per track:

| Track | Save file |
|-------|-----------|
| Basic | `~/.huff-dojo-basic-progress.json` |
| Advanced | `~/.huff-dojo-advanced-progress.json` |

On next launch, choose a track and the game resumes at that track's first uncompleted level. If you have an older `~/.huff-dojo-progress.json`, Huff Dojo will read it as a legacy fallback.

```
Resuming basic mode — [█████████░░░░░░░░░░░░░░░] 12/33 (36%)
```

To start over:

```
[✓12] > :reset-progress
```

## Check pipeline

When a level is checked (on file save or `^S` in the TUI editor):

1. **Compile** — runs `hnc -b` on the Huff file.
2. **Simulate** — extracts the `MAIN` body, runs it through the built-in teaching EVM, and compares the final stack / return data / storage against the level's expected state.
3. **Anvil** (optional, `:anvil on`) — deploys the compiled bytecode to a local Anvil node and calls the contract over JSON-RPC.

All enabled checks must pass to win the level. The simulator is enough for practicing opcode logic; the compiler check is what confirms the Huff file itself is valid.

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

Runs every Basic and Advanced reference solution through the simulator and verifies they pass.
