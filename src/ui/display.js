import { style, stripAnsi, levelHeading, sectionLabel, successText, warningText, errorText, mutedLabel } from './styles.js';
import { execute, compareExpected, returnHex, stackHexDisplay, storageHex } from '../evm/simulator.js';
import { compactHex, wordHex } from '../utils.js';
import { lessons, modeConfig } from '../game/state.js';
import { defaultSettings } from '../game/config.js';

export function describeLevel(level) {
  const rule = "  " + style.dim("─".repeat(52));
  const lines = [
    "",
    `  ${levelHeading(level)}`,
    rule,
    "",
    `  ${sectionLabel("Objective")}`,
    `  ${level.prompt}`
  ];
  const context = formatContext(level.context || {});
  if (context) lines.push("", `  ${sectionLabel("Starting Context")}`, `  ${context}`);
  return lines.join("\n");
}

export function describeLesson(level) {
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

export function describeLevelWithLesson(level, settings = defaultSettings) {
  const parts = [describeLevel(level)];
  if (settings.lessons) parts.push(describeLesson(level));
  return parts.filter(Boolean).join("\n");
}

export function formatContext(context = {}) {
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

export function renderSimulatorResult(level, source, options = {}) {
  const canWin = options.canWin ?? false;
  const { instructions, state } = execute(level, source);
  const verdict = compareExpected(level, state);

  const lines = [""];

  if (verdict.pass && canWin) {
    const rawWinText = `✓  Level ${level.id} cleared — Congratulations!`;
    const msg = `  ${successText(rawWinText)}  `;
    const bar = "  " + style.green("═".repeat(rawWinText.length + 2));
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

export function renderResult(level, source) {
  return renderSimulatorResult(level, source, { canWin: true });
}

export function progressBar(done, total, width = 24) {
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return `[${style.green("█".repeat(filled))}${style.dim("░".repeat(width - filled))}] ${style.bold(`${done}/${total}`)} (${pct}%)`;
}

export function listLevels(levels, completed = new Set()) {
  const pct = levels.length > 0 ? Math.round((completed.size / levels.length) * 100) : 0;
  const header = `  ${sectionLabel(modeConfig().label + " Levels")}  ${style.dim(`${completed.size}/${levels.length} complete — ${pct}%`)}`;
  const rule = "  " + style.dim("─".repeat(40));

  const rows = levels.map((level) => {
    const mark = completed.has(level.id) ? style.green("[x]") : style.dim("[ ]");
    const num = String(level.id).padStart(2, "0");
    const entry = `  ${mark} ${style.bold(`${num}.`)} ${level.title}`;
    return { entry, visualLen: stripAnsi(entry).length };
  });

  let levelList;
  if (levels.length > 16) {
    const half = Math.ceil(levels.length / 2);
    const colWidth = Math.max(...rows.slice(0, half).map((r) => r.visualLen)) + 3;
    const lines = [];
    for (let i = 0; i < half; i++) {
      const left = rows[i];
      const right = rows[i + half];
      const pad = " ".repeat(Math.max(1, colWidth - left.visualLen));
      lines.push(`${left.entry}${pad}${right ? right.entry : ""}`);
    }
    levelList = lines.join("\n");
  } else {
    levelList = rows.map((r) => r.entry).join("\n");
  }

  return [header, rule, levelList].join("\n");
}
