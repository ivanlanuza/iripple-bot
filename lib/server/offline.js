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

export async function runCommand(command, args = [], options = {}) {
  return execFileAsync(command, args, {
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
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
        return expandHome(process.env.WHISPER_MODEL_PATH);
      }

      if (await fileExists(FAST_WHISPER_MODEL)) {
        return FAST_WHISPER_MODEL;
      }

      return DEFAULT_WHISPER_MODEL;
    })();
  }

  return cachedWhisperModelPromise;
}
