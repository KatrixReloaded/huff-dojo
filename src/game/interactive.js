import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";

import { levels, lessons, currentMode, modeConfig, setMode } from './state.js';
import { defaultSettings } from './config.js';
import { loadProgress, saveProgress } from './progress.js';
import { buildHuffTemplate, writeTemplate, rawOpcodesToHuff, readHuffSource } from './template.js';
import { renderHuffFileResult } from './anvil.js';
import { renderSimulatorResult, describeLevelWithLesson, describeLesson, listLevels, progressBar, formatContext } from '../ui/display.js';
import { style, sectionLabel, successText, warningText, errorText, mutedLabel, dojoLogo, startupText, levelHeading } from '../ui/styles.js';
import { runMiniEditor } from '../ui/editor.js';
import { basicLevels, advancedLevels } from '../data/levels.js';
import { opcodeHelp } from '../data/lessons.js';

export function usage() {
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

export function interactiveHelp() {
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

export function parseCommandLine(line) {
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

export function findLevel(id) {
  const level = levels.find((candidate) => candidate.id === Number(id));
  if (!level) throw new Error(`Unknown level ${id}`);
  return level;
}

export function defaultLevelPath(level, mode = currentMode) {
  const prefix = modeConfig(mode).filePrefix;
  return path.join(process.cwd(), "dojo-levels", `${prefix}-${String(level.id).padStart(2, "0")}.huff`);
}

export async function openCodePad(rl, level, settings, filePath, { stopWatching = () => {}, startWatching = () => {} } = {}) {
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

export function advanceAfterWin(level, settings, completed) {
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

export const COMMANDS = [
  ":code", ":template", ":template!", ":solution-template", ":skip",
  ":levels", ":level", ":mode", ":lesson", ":hint", ":solution",
  ":progress", ":reset", ":reset-progress",
  ":lessons", ":boilerplate", ":anvil",
  ":opcodes", ":ctx", ":clear", ":help", ":quit"
];

export async function interactive() {
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
  output.write(dojoLogo());
  output.write(`  ${style.bold("[1]")} ${style.bold(style.brightCyan("Basic"))}    — learn EVM opcodes and Huff from scratch  ${style.dim(`(${basicLevels.length} levels)`)}\n`);
  output.write(`  ${style.bold("[2]")} ${style.bold(style.brightCyan("Advanced"))} — apply what you know to solve harder challenges  ${style.dim(`(${advancedLevels.length} levels)`)}\n\n`);

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
          output.write(`\n${listLevels(levels, completed)}\n`);

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
