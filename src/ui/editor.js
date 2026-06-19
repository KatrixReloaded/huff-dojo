import { execute } from '../evm/simulator.js';
import { stackHexDisplay } from '../evm/simulator.js';
import { stripComments } from '../evm/parser.js';
import { levelHeading, stripAnsi, huffHighlight } from './styles.js';

export const STACK_TRACE_COMMENT = /\s*\/\/\s*\[[^\]]*\]\s*$/;

export function stripStackTraceComment(line) {
  return line.replace(STACK_TRACE_COMMENT, "");
}

export function findMainBodyRange(lines) {
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

export function shouldAnnotateStackLine(line) {
  const code = stripComments(stripStackTraceComment(line)).trim();
  return code !== "" && code !== "{" && code !== "}" && !code.startsWith("#");
}

export function sourceThroughEditorLine(lines, row) {
  const range = findMainBodyRange(lines);
  if (!range || row < range.start || row >= range.end) return null;
  const copy = lines.map(stripStackTraceComment);
  for (let i = row + 1; i < range.end; i += 1) copy[i] = "";
  return copy.join("\n");
}

export function annotateStackAtLine(level, lines, row) {
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

export function runMiniEditor(level, filePath, initialContent) {
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
      const infoVisualLen = 1 + stripAnsi(levelHeading(level)).length;
      const infoPad = " ".repeat(Math.max(0, width - infoVisualLen));
      out += "\x1b[7m" + info + infoPad + "\x1b[0m\r\n";

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
        const rawContent = lineIdx < lines.length ? (lines[lineIdx] ?? "").slice(0, width - g - 1) : "";
        const content = lineIdx < lines.length ? huffHighlight(rawContent) : "";
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
