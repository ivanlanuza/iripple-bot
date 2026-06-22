import { constants as fsConstants } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const DATA_DIR = path.join(process.cwd(), "data");
export const TMP_DIR = path.join(process.cwd(), "tmp");
export const KNOWLEDGE_FILE = path.join(DATA_DIR, "knowledge.txt");
export const EMBEDDINGS_FILE = path.join(DATA_DIR, "embeddings.json");
export const DEFAULT_WHISPER_MODEL = path.join(os.homedir(), ".ggml-base.en.bin");
export const FAST_WHISPER_MODEL = path.join(os.homedir(), ".ggml-tiny.en.bin");

const DEFAULT_KNOWLEDGE = `iripple booth knowledge

Replace this file with the facts your robot should know offline.

- Company overview
- Product features
- Pricing and packages
- Demo flow
- Frequently asked expo questions
- Team introductions
- Contact and follow-up details
`;

let cachedWhisperEnvPromise;
let cachedWhisperModelPromise;
const COMMON_BINARY_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

function getCommandOverrideVar(command) {
  if (command === "ffmpeg") {
    return "FFMPEG_BIN";
  }

  if (command === "whisper-cli") {
    return "WHISPER_BIN";
  }

  if (command === "brew") {
    return "BREW_BIN";
  }

  return null;
}

async function isExecutable(filePath) {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveCommandPath(command, env = process.env) {
  const overrideVar = getCommandOverrideVar(command);
  const overriddenCommand = overrideVar ? env[overrideVar] : null;
  const targetCommand = expandHome(overriddenCommand || command);

  if (targetCommand.includes(path.sep)) {
    if (await isExecutable(targetCommand)) {
      return targetCommand;
    }

    const source = overrideVar && overriddenCommand ? `$${overrideVar}` : "path";
    throw new Error(`Required binary not found at ${source}: ${targetCommand}`);
  }

  const searchDirs = new Set([
    ...(env.PATH || "").split(path.delimiter).filter(Boolean),
    ...COMMON_BINARY_DIRS,
  ]);

  for (const dir of searchDirs) {
    const candidate = path.join(dir, targetCommand);
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  if (overrideVar) {
    throw new Error(
      `Required binary not found: ${command}. Install it or set ${overrideVar} to its full path.`,
    );
  }

  throw new Error(`Required binary not found: ${command}`);
}

function collapseCommandOutput(output) {
  return String(output || "")
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" | ");
}

export async function runCommand(command, args = [], options = {}) {
  const env = options.env || process.env;
  const resolvedCommand = await resolveCommandPath(command, env);

  try {
    return await execFileAsync(resolvedCommand, args, {
      maxBuffer: 16 * 1024 * 1024,
      env,
      ...options,
    });
  } catch (error) {
    const stderrSummary = collapseCommandOutput(error.stderr);
    const stdoutSummary = collapseCommandOutput(error.stdout);
    const details = stderrSummary || stdoutSummary;
    const message = details
      ? `Command failed: ${command}. ${details}`
      : `Command failed: ${command}`;

    throw new Error(message);
  }
}

export function expandHome(filePath) {
  if (!filePath) {
    return filePath;
  }

  if (filePath === "~") {
    return os.homedir();
  }

  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  return filePath;
}

export async function ensureRuntimeDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
}

export async function ensureDataFiles() {
  await ensureRuntimeDirs();

  try {
    await fs.access(KNOWLEDGE_FILE);
  } catch {
    await fs.writeFile(KNOWLEDGE_FILE, DEFAULT_KNOWLEDGE, "utf8");
  }

  try {
    await fs.access(EMBEDDINGS_FILE);
  } catch {
    await fs.writeFile(
      EMBEDDINGS_FILE,
      JSON.stringify(
        {
          version: 1,
          createdAt: null,
          embedModel: null,
          chunkSize: null,
          overlap: null,
          chunks: [],
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

export function createTempPath(prefix, extension) {
  const random = Math.random().toString(16).slice(2);
  return path.join(TMP_DIR, `${prefix}-${Date.now()}-${random}.${extension}`);
}

export async function safeUnlink(paths) {
  await Promise.all(
    paths.flat().filter(Boolean).map(async (filePath) => {
      try {
        await fs.unlink(filePath);
      } catch {}
    }),
  );
}

export async function getWhisperEnv() {
  if (!cachedWhisperEnvPromise) {
    cachedWhisperEnvPromise = (async () => {
      const env = { ...process.env };

      if (!env.GGML_METAL_PATH_RESOURCES) {
        try {
          const { stdout } = await runCommand("brew", ["--prefix", "whisper-cpp"]);
          env.GGML_METAL_PATH_RESOURCES = path.join(
            stdout.trim(),
            "share",
            "whisper-cpp",
          );
        } catch {}
      }

      return env;
    })();
  }

  return cachedWhisperEnvPromise;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveWhisperModelPath() {
  if (!cachedWhisperModelPromise) {
    cachedWhisperModelPromise = (async () => {
      if (process.env.WHISPER_MODEL_PATH) {
        const configuredModelPath = expandHome(process.env.WHISPER_MODEL_PATH);

        if (!(await fileExists(configuredModelPath))) {
          throw new Error(
            `Whisper model not found at WHISPER_MODEL_PATH: ${configuredModelPath}`,
          );
        }

        return configuredModelPath;
      }

      if (await fileExists(FAST_WHISPER_MODEL)) {
        return FAST_WHISPER_MODEL;
      }

      if (await fileExists(DEFAULT_WHISPER_MODEL)) {
        return DEFAULT_WHISPER_MODEL;
      }

      throw new Error(
        `Whisper model not found. Set WHISPER_MODEL_PATH or place a model at ${FAST_WHISPER_MODEL} or ${DEFAULT_WHISPER_MODEL}.`,
      );
    })();
  }

  return cachedWhisperModelPromise;
}
