#!/usr/bin/env node

import { setMode, currentMode, modeConfig } from '../src/game/state.js';
import { basicLevels, advancedLevels } from '../src/data/levels.js';
import { keccak256 } from '../src/evm/keccak.js';
import { normalizeCompleted } from '../src/game/progress.js';
import { defaultSettings } from '../src/game/config.js';
import { findLevel, defaultLevelPath, usage, interactiveHelp, interactive } from '../src/game/interactive.js';
import { buildHuffTemplate, writeTemplate } from '../src/game/template.js';
import { renderHuffFileResult } from '../src/game/anvil.js';
import { renderSimulatorResult, renderResult, describeLevelWithLesson } from '../src/ui/display.js';

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
    const modeLessons = modeConfig(modeName).lessons;
    for (const [index, level] of modelevels.entries()) {
      if (level.id !== index + 1) failures.push(`${modeName} level IDs are not contiguous at ${level.id}.`);
      if (!modeLessons[level.id]) failures.push(`${modeName} Level ${level.id} has no lesson text.`);
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
