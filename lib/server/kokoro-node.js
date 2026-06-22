import path from "path";

const DEFAULT_MODEL_ID =
  process.env.IRIPPLE_KOKORO_MODEL || "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_DTYPE = process.env.IRIPPLE_KOKORO_DTYPE || "q8";
const DEFAULT_DEVICE = process.env.IRIPPLE_KOKORO_DEVICE || "cpu";
const DEFAULT_SPEED = Number(process.env.IRIPPLE_KOKORO_SPEED || "1");
const DEFAULT_CACHE_DIR =
  process.env.IRIPPLE_KOKORO_CACHE_DIR ||
  path.join(process.cwd(), ".cache", "huggingface");

let runtimePromise;
let ttsPromise;

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("kokoro-js").then((mod) => {
      mod.env.cacheDir = DEFAULT_CACHE_DIR;
      mod.env.useFSCache = true;
      mod.env.allowLocalModels = true;
      mod.env.allowRemoteModels = true;
      return mod;
    });
  }

  return runtimePromise;
}

export function getKokoroDefaults() {
  return {
    modelId: DEFAULT_MODEL_ID,
    dtype: DEFAULT_DTYPE,
    device: DEFAULT_DEVICE,
    speed: DEFAULT_SPEED,
    cacheDir: DEFAULT_CACHE_DIR,
  };
}

export async function getKokoroTts() {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS } = await loadRuntime();
      return KokoroTTS.from_pretrained(DEFAULT_MODEL_ID, {
        dtype: DEFAULT_DTYPE,
        device: DEFAULT_DEVICE,
      });
    })().catch((error) => {
      ttsPromise = null;
      throw error;
    });
  }

  return ttsPromise;
}

export async function synthesizeKokoroAudio(text, voice, speed = DEFAULT_SPEED) {
  const tts = await getKokoroTts();
  const audio = await tts.generate(text, {
    voice,
    speed,
  });

  return Buffer.from(audio.toWav());
}

export async function primeKokoroRuntime() {
  await getKokoroTts();
}
