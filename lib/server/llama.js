import { spawn } from "child_process";

import {
  expandHome,
  pathExists,
  resolveBinaryPath,
} from "@/lib/server/offline";

const SERVER_HOST = process.env.IRIPPLE_LLAMA_HOST || "127.0.0.1";
const DEFAULT_CHAT_PORT = Number(process.env.IRIPPLE_LLAMA_CHAT_PORT || "11435");
const DEFAULT_EMBED_PORT = Number(process.env.IRIPPLE_LLAMA_EMBED_PORT || "11436");
const DEFAULT_CHAT_MODEL = "llama3.2:3b";
const DEFAULT_EMBED_MODEL = "nomic-embed-text";
export const DEFAULT_KEEP_ALIVE = process.env.IRIPPLE_LLM_KEEP_ALIVE || "10m";
const DEFAULT_CHAT_CTX = Number(process.env.IRIPPLE_LLAMA_CTX || "2048");
const DEFAULT_EMBED_CTX = Number(
  process.env.IRIPPLE_LLAMA_EMBED_CTX || process.env.IRIPPLE_LLAMA_CTX || "2048",
);
const DEFAULT_THREADS = Number(process.env.IRIPPLE_LLAMA_THREADS || "0");
const DEFAULT_BATCH = Number(process.env.IRIPPLE_LLAMA_BATCH || "1024");
const DEFAULT_UBATCH = Number(process.env.IRIPPLE_LLAMA_UBATCH || "512");
const DEFAULT_GPU_LAYERS = Number(process.env.IRIPPLE_LLAMA_GPU_LAYERS || "-1");
const DEFAULT_EMBED_POOLING = process.env.IRIPPLE_LLAMA_EMBED_POOLING || "mean";
const SERVER_STARTUP_TIMEOUT_MS = Number(
  process.env.IRIPPLE_LLAMA_STARTUP_TIMEOUT_MS || "45000",
);
const REQUEST_TIMEOUT_MS = Number(
  process.env.IRIPPLE_LLAMA_REQUEST_TIMEOUT_MS || "300000",
);
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

function normalizeModelAlias(alias) {
  return String(alias || "")
    .trim()
    .replace(/^"+|"+$/g, "");
}

function toModelEnvKey(alias) {
  return normalizeModelAlias(alias)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getModelPathEnvVar(alias) {
  return `IRIPPLE_MODEL_${toModelEnvKey(alias)}_PATH`;
}

function looksLikeModelPath(value) {
  return /[\\/]/.test(value) || /\.gguf$/i.test(value) || value.startsWith("~");
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseIntegerOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function pushCommandArg(args, flag, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  args.push(flag, String(value));
}

function parseExtraArgs(rawArgs) {
  if (!rawArgs) {
    return [];
  }

  const matches = String(rawArgs).match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return matches.map((token) => token.replace(/^['"]|['"]$/g, ""));
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

async function resolveModelPath(alias) {
  const normalizedAlias = normalizeModelAlias(alias);
  if (!normalizedAlias) {
    throw new Error("A llama.cpp model alias or GGUF path is required.");
  }

  const configuredValue = looksLikeModelPath(normalizedAlias)
    ? normalizedAlias
    : process.env[getModelPathEnvVar(normalizedAlias)];

  if (!configuredValue) {
    throw new Error(
      `No GGUF path configured for "${normalizedAlias}". Set ${getModelPathEnvVar(normalizedAlias)} in your .env file.`,
    );
  }

  const modelPath = expandHome(configuredValue);
  if (!(await pathExists(modelPath))) {
    throw new Error(`Configured GGUF model was not found: ${modelPath}`);
  }

  return modelPath;
}

async function buildServerConfig(kind, preferredModel) {
  const alias = normalizeModelAlias(
    preferredModel ||
      (kind === "chat"
        ? process.env.IRIPPLE_CHAT_MODEL || DEFAULT_CHAT_MODEL
        : process.env.IRIPPLE_EMBED_MODEL || DEFAULT_EMBED_MODEL),
  );
  const modelPath = await resolveModelPath(alias);
  const port = parsePositiveNumber(
    kind === "chat"
      ? process.env.IRIPPLE_LLAMA_CHAT_PORT
      : process.env.IRIPPLE_LLAMA_EMBED_PORT,
    kind === "chat" ? DEFAULT_CHAT_PORT : DEFAULT_EMBED_PORT,
  );
  const contextSize = parsePositiveNumber(
    kind === "chat"
      ? process.env.IRIPPLE_LLAMA_CTX
      : process.env.IRIPPLE_LLAMA_EMBED_CTX || process.env.IRIPPLE_LLAMA_CTX,
    kind === "chat" ? DEFAULT_CHAT_CTX : DEFAULT_EMBED_CTX,
  );
  const threads = parseIntegerOrDefault(
    process.env.IRIPPLE_LLAMA_THREADS,
    DEFAULT_THREADS,
  );
  const batch = parsePositiveNumber(
    process.env.IRIPPLE_LLAMA_BATCH,
    DEFAULT_BATCH,
  );
  const ubatch = parsePositiveNumber(
    process.env.IRIPPLE_LLAMA_UBATCH,
    DEFAULT_UBATCH,
  );
  const gpuLayers = parseIntegerOrDefault(
    process.env.IRIPPLE_LLAMA_GPU_LAYERS,
    DEFAULT_GPU_LAYERS,
  );
  const extraArgs = parseExtraArgs(
    kind === "chat"
      ? process.env.IRIPPLE_LLAMA_CHAT_EXTRA_ARGS || process.env.IRIPPLE_LLAMA_EXTRA_ARGS
      : process.env.IRIPPLE_LLAMA_EMBED_EXTRA_ARGS || process.env.IRIPPLE_LLAMA_EXTRA_ARGS,
  );
  const pooling = kind === "embed"
    ? process.env.IRIPPLE_LLAMA_EMBED_POOLING || DEFAULT_EMBED_POOLING
    : null;

  return {
    kind,
    alias,
    modelPath,
    port,
    host: SERVER_HOST,
    baseUrl: `http://${SERVER_HOST}:${port}`,
    contextSize,
    threads,
    batch,
    ubatch,
    gpuLayers,
    pooling,
    extraArgs,
    cacheKey: JSON.stringify({
      kind,
      alias,
      modelPath,
      port,
      contextSize,
      threads,
      batch,
      ubatch,
      gpuLayers,
      pooling,
      extraArgs,
    }),
  };
}

function buildServerArgs(config) {
  const args = [
    "--host",
    config.host,
    "--port",
    String(config.port),
    "-m",
    config.modelPath,
    "--alias",
    config.alias,
  ];

  pushCommandArg(args, "-c", config.contextSize);

  if (config.threads > 0) {
    pushCommandArg(args, "-t", config.threads);
  }

  if (config.batch > 0) {
    pushCommandArg(args, "-b", config.batch);
  }

  if (config.ubatch > 0) {
    pushCommandArg(args, "-ub", config.ubatch);
  }

  if (Number.isFinite(config.gpuLayers)) {
    pushCommandArg(args, "-ngl", config.gpuLayers);
  }

  if (config.kind === "chat") {
    args.push("--jinja");
  } else {
    args.push("--embedding");
    if (config.pooling) {
      pushCommandArg(args, "--pooling", config.pooling);
    }
  }

  args.push(...config.extraArgs);

  return args;
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

async function ensureServer(kind, preferredModel) {
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

function buildMessages(system, prompt) {
  const messages = [];

  if (system) {
    messages.push({
      role: "system",
      content: system,
    });
  }

  messages.push({
    role: "user",
    content: prompt,
  });

  return messages;
}

async function fetchJson(baseUrl, endpoint, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: "Bearer no-key",
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `llama.cpp request failed for ${endpoint}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postJson(baseUrl, endpoint, payload, timeoutMs) {
  return fetchJson(
    baseUrl,
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
}

async function postStream(baseUrl, endpoint, payload, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer no-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `llama.cpp request failed for ${endpoint}`);
    }

    if (!response.body) {
      throw new Error(`llama.cpp did not return a stream for ${endpoint}`);
    }

    return {
      body: response.body,
      cancel: () => controller.abort(),
      clear: () => clearTimeout(timeoutId),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function getTextFromMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function getChatCompletionText(data) {
  return (
    getTextFromMessageContent(data?.choices?.[0]?.message?.content) ||
    getTextFromMessageContent(data?.choices?.[0]?.text) ||
    ""
  ).trim();
}

function getEmbeddingVectors(data) {
  if (Array.isArray(data?.data)) {
    return data.data
      .map((item) => item?.embedding)
      .filter((embedding) => Array.isArray(embedding));
  }

  if (Array.isArray(data?.embedding)) {
    return [data.embedding];
  }

  if (Array.isArray(data) && Array.isArray(data[0]?.embedding)) {
    return data.map((item) => item.embedding);
  }

  return [];
}

export async function listModels() {
  const configuredAliases = Object.keys(process.env)
    .filter((key) => /^IRIPPLE_MODEL_.+_PATH$/.test(key))
    .map((key) =>
      key
        .replace(/^IRIPPLE_MODEL_/, "")
        .replace(/_PATH$/, "")
        .toLowerCase(),
    );

  const aliases = new Set([
    process.env.IRIPPLE_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    process.env.IRIPPLE_EMBED_MODEL || DEFAULT_EMBED_MODEL,
    ...configuredAliases,
  ]);

  return Array.from(aliases)
    .filter(Boolean)
    .map((name) => ({ name }));
}

export async function resolveChatModel(preferredModel) {
  const config = await buildServerConfig("chat", preferredModel);
  return config.alias;
}

export async function resolveEmbedModel(preferredModel = DEFAULT_EMBED_MODEL) {
  const config = await buildServerConfig("embed", preferredModel);
  return config.alias;
}

export async function resolveEmbedModelPath(preferredModel = DEFAULT_EMBED_MODEL) {
  const config = await buildServerConfig("embed", preferredModel);
  return config.modelPath;
}

export async function embedText(
  text,
  model = DEFAULT_EMBED_MODEL,
) {
  const server = await ensureServer("embed", model);
  const data = await postJson(server.baseUrl, "/v1/embeddings", {
    model: server.alias,
    input: text,
    encoding_format: "float",
  });
  const embeddings = getEmbeddingVectors(data);

  if (Array.isArray(embeddings[0])) {
    return embeddings[0];
  }

  throw new Error("llama.cpp did not return an embedding");
}

export async function embedMany(
  texts,
  model = DEFAULT_EMBED_MODEL,
) {
  const server = await ensureServer("embed", model);
  const data = await postJson(server.baseUrl, "/v1/embeddings", {
    model: server.alias,
    input: texts,
    encoding_format: "float",
  });
  const embeddings = getEmbeddingVectors(data);

  if (embeddings.length === texts.length) {
    return embeddings;
  }

  throw new Error("llama.cpp did not return the expected embeddings");
}

export async function generateText({
  prompt,
  system,
  model = DEFAULT_CHAT_MODEL,
  options = {},
}) {
  const server = await ensureServer("chat", model);
  const data = await postJson(server.baseUrl, "/v1/chat/completions", {
    model: server.alias,
    messages: buildMessages(system, prompt),
    temperature: options.temperature,
    max_tokens: options.num_predict,
    stream: false,
  });

  return getChatCompletionText(data);
}

async function* iterateSseBody(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder
      .decode(value || new Uint8Array(), { stream: !done })
      .replace(/\r\n/g, "\n");

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf("\n\n");

      const dataLines = rawEvent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      for (const dataLine of dataLines) {
        if (!dataLine) {
          continue;
        }

        if (dataLine === "[DONE]") {
          return;
        }

        yield JSON.parse(dataLine);
      }
    }

    if (done) {
      break;
    }
  }
}

export async function* generateTextStream({
  prompt,
  system,
  model = DEFAULT_CHAT_MODEL,
  options = {},
}) {
  const server = await ensureServer("chat", model);
  const { body, cancel, clear } = await postStream(
    server.baseUrl,
    "/v1/chat/completions",
    {
      model: server.alias,
      messages: buildMessages(system, prompt),
      temperature: options.temperature,
      max_tokens: options.num_predict,
      stream: true,
    },
  );

  let completed = false;

  try {
    for await (const chunk of iterateSseBody(body)) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      const text = getTextFromMessageContent(delta);

      if (text) {
        yield {
          response: text,
          done: false,
        };
      }

      if (chunk?.choices?.[0]?.finish_reason) {
        completed = true;
        yield { done: true };
        break;
      }
    }

    if (!completed) {
      yield { done: true };
    }
  } finally {
    cancel();
    clear();
  }
}

export async function warmModels({ chatModel, embedModel }) {
  await Promise.allSettled([
    generateText({
      model: chatModel,
      system: "Reply with exactly [HAPPY] Ready.",
      prompt: "Warm the model.",
      options: {
        temperature: 0,
        num_predict: 8,
      },
    }),
    embedText("Warm the embeddings.", embedModel),
  ]);
}
