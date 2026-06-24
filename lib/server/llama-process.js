import { spawn } from "child_process";

import {
  buildServerArgs,
  buildServerConfig,
  SERVER_STARTUP_TIMEOUT_MS,
} from "@/lib/server/llama-config";
import { resolveBinaryPath } from "@/lib/server/offline";

const GLOBAL_STATE_KEY = Symbol.for("iripple.llamaCppState");

function getGlobalState() {
  if (!globalThis[GLOBAL_STATE_KEY]) {
    globalThis[GLOBAL_STATE_KEY] = {
      chat: null,
      embed: null,
    };
  }

  return globalThis[GLOBAL_STATE_KEY];
}

function appendLog(target, chunk) {
  const lines = String(chunk || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return;
  }

  target.push(...lines);
  if (target.length > 60) {
    target.splice(0, target.length - 60);
  }
}

function formatServerLogs(lines) {
  return lines.slice(-8).join(" | ");
}

async function stopServer(entry) {
  if (!entry?.process || entry.exited) {
    return;
  }

  entry.process.kill("SIGTERM");

  await Promise.race([
    new Promise((resolve) => {
      entry.process.once("exit", resolve);
    }),
    new Promise((resolve) => {
      setTimeout(() => {
        if (!entry.exited) {
          entry.process.kill("SIGKILL");
        }
        resolve();
      }, 4000);
    }),
  ]);
}

async function waitForServerReady(baseUrl, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {}

    try {
      const response = await fetch(`${baseUrl}/v1/models`);
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("llama.cpp server did not become ready in time.");
}

export async function ensureServer(kind, preferredModel) {
  const state = getGlobalState();
  const config = await buildServerConfig(kind, preferredModel);
  const currentEntry = state[kind];

  if (
    currentEntry &&
    currentEntry.cacheKey === config.cacheKey &&
    !currentEntry.exited &&
    currentEntry.readyPromise
  ) {
    await currentEntry.readyPromise;
    return currentEntry;
  }

  if (currentEntry) {
    await stopServer(currentEntry);
  }

  const binaryPath = await resolveBinaryPath("llama-server");
  const args = buildServerArgs(config);
  const logs = [];
  const child = spawn(binaryPath, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const entry = {
    ...config,
    binaryPath,
    args,
    logs,
    process: child,
    exited: false,
    readyPromise: null,
  };

  child.stdout.on("data", (chunk) => appendLog(logs, chunk));
  child.stderr.on("data", (chunk) => appendLog(logs, chunk));
  child.on("exit", (code, signal) => {
    entry.exited = true;
    appendLog(logs, `llama-server exited (${signal || code || 0})`);
  });

  entry.readyPromise = (async () => {
    try {
      await waitForServerReady(config.baseUrl, SERVER_STARTUP_TIMEOUT_MS);
    } catch (error) {
      entry.exited = true;
      child.kill("SIGTERM");
      const details = formatServerLogs(logs);
      throw new Error(
        details
          ? `${error.message} ${details}`
          : error.message,
      );
    }
  })();

  state[kind] = entry;
  await entry.readyPromise;

  return entry;
}
