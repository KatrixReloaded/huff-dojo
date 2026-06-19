import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { currentMode, modeConfig } from './state.js';
import { LEGACY_SAVE_PATH_FILENAME } from './config.js';

const LEGACY_SAVE_PATH = path.join(os.homedir(), LEGACY_SAVE_PATH_FILENAME);

export function progressPath(mode = currentMode) {
  return path.join(os.homedir(), modeConfig(mode).progressFile);
}

export function normalizeCompleted(mode, completed, version = 1) {
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

export function loadProgress(mode) {
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

export function saveProgress(completed, mode) {
  const data = {
    mode,
    version: modeConfig(mode).progressVersion,
    completed: [...completed].sort((a, b) => a - b)
  };
  try {
    fs.writeFileSync(progressPath(mode), JSON.stringify(data, null, 2), "utf8");
  } catch { }
}
