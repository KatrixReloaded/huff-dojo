import { execFileSync } from "node:child_process";
import { defaultSettings } from './config.js';
import { compactHex, wordHex } from '../utils.js';
import { renderSimulatorResult } from '../ui/display.js';
import { sectionLabel, successText, errorText } from '../ui/styles.js';
import { readHuffSource } from './template.js';

export function extractBytecode(stdout) {
  const match = stdout.match(/(?:0x)?[0-9a-fA-F]{10,}/g)?.at(-1);
  if (!match) return "";
  return match.startsWith("0x") ? match : `0x${match}`;
}

export function compileHuff(filePath, mode = "bytecode") {
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

export function rpc(settings, method, params = []) {
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

export function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function anvilCalldata(level) {
  const context = level.context || {};
  if (context.calldata) return context.calldata;
  if (context.calldataWords) {
    return `0x${context.calldataWords.map((word) => wordHex(word).slice(2)).join("")}`;
  }
  return "0x";
}

export function waitForReceipt(settings, txHash) {
  for (let i = 0; i < 30; i += 1) {
    const receipt = rpc(settings, "eth_getTransactionReceipt", [txHash]);
    if (receipt) return receipt;
    sleep(100);
  }
  throw new Error(`Timed out waiting for receipt ${txHash}`);
}

export function runInAnvil(level, bytecode, settings) {
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

export function renderHuffFileResult(level, filePath, settings = defaultSettings) {
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
