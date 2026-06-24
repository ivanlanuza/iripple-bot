import { expandHome, pathExists } from "@/lib/server/offline";

const SERVER_HOST = process.env.IRIPPLE_LLAMA_HOST || "127.0.0.1";
const DEFAULT_CHAT_PORT = Number(process.env.IRIPPLE_LLAMA_CHAT_PORT || "11435");
const DEFAULT_EMBED_PORT = Number(process.env.IRIPPLE_LLAMA_EMBED_PORT || "11436");
const DEFAULT_CHAT_MODEL = "llama3.2:3b";
export const DEFAULT_EMBED_MODEL = "nomic-embed-text";
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
export const SERVER_STARTUP_TIMEOUT_MS = Number(
  process.env.IRIPPLE_LLAMA_STARTUP_TIMEOUT_MS || "45000",
);
export const REQUEST_TIMEOUT_MS = Number(
  process.env.IRIPPLE_LLAMA_REQUEST_TIMEOUT_MS || "300000",
);

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

export function normalizeModelAlias(alias) {
  return String(alias || "")
    .trim()
    .replace(/^"+|"+$/g, "");
}

export async function resolveModelPath(alias) {
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

export async function buildServerConfig(kind, preferredModel) {
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

export function buildServerArgs(config) {
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
