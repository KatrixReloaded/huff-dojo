import { basicLevels, advancedLevels } from '../data/levels.js';
import { basicLessons, advancedLessons } from '../data/lessons.js';

export const modes = {
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

export let levels = basicLevels;
export let lessons = basicLessons;
export let currentMode = "basic";

export function modeConfig(mode = currentMode) {
  return modes[mode] || modes.basic;
}

export function setMode(mode) {
  currentMode = mode;
  levels = modeConfig(mode).levels;
  lessons = modeConfig(mode).lessons;
}
