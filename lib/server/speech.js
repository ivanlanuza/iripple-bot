import {
  getKokoroDefaults,
  primeKokoroRuntime,
  synthesizeKokoroAudio,
} from "@/lib/server/kokoro-node";

const speechCache = new Map();
const pendingSpeechCache = new Map();
const DEFAULT_VOICE = process.env.IRIPPLE_KOKORO_VOICE || "af_sarah";
const DEFAULT_SPEED = getKokoroDefaults().speed;
const MIN_CHUNK_LENGTH = Number(process.env.IRIPPLE_SPEECH_MIN_CHARS || "72");
const MAX_CHUNK_LENGTH = Number(process.env.IRIPPLE_SPEECH_MAX_CHARS || "180");
const FILLER_PHRASES = [
  "That is a great question. Hold on while I think that through.",
  "Hmm, interesting one. Give me a moment to think.",
  "Let me pull that together for you. Hold on while I retrieve the answer.",
  "I have something for that. Give me a minute to think it through.",
];
let lastFillerIndex = -1;

function trimCache(cache, maxSize) {
  while (cache.size > maxSize) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

function getSpeechCacheKey(text, voice, speed) {
  return `${voice}::${speed}::${text}`;
}

export function getSpeechDefaults() {
  return {
    voice: DEFAULT_VOICE,
    speed: DEFAULT_SPEED,
  };
}

export function getFillerPhrase() {
  const cachedPhrase = FILLER_PHRASES.find(
    (phrase) => !!getCachedSpeechBuffer(phrase, DEFAULT_VOICE),
  );
  if (cachedPhrase) {
    return cachedPhrase;
  }

  if (FILLER_PHRASES.length === 1) {
    return FILLER_PHRASES[0];
  }

  let nextIndex = Math.floor(Math.random() * FILLER_PHRASES.length);
  if (nextIndex === lastFillerIndex) {
    nextIndex = (nextIndex + 1) % FILLER_PHRASES.length;
  }

  lastFillerIndex = nextIndex;
  return FILLER_PHRASES[nextIndex];
}

export function splitSpeechText(text) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }

  const fragments = normalized
    .replace(/([.]+)\s+/g, "$1|")
    .replace(/\s+--\s+/g, "|")
    .replace(/\s+[–—-]\s+/g, "|")
    .replace(/[–—]/g, "|")
    .split("|")
    .map((piece) => piece.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks = [];
  let currentChunk = "";

  for (const fragment of fragments) {
    if (!currentChunk) {
      currentChunk = fragment;
      continue;
    }

    if (
      currentChunk.length < MIN_CHUNK_LENGTH ||
      currentChunk.length + 1 + fragment.length <= MAX_CHUNK_LENGTH
    ) {
      currentChunk = `${currentChunk} ${fragment}`.trim();
      continue;
    }

    chunks.push(currentChunk);
    currentChunk = fragment;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function getCachedSpeechBuffer(
  text,
  voice = DEFAULT_VOICE,
  speed = DEFAULT_SPEED,
) {
  const cacheKey = getSpeechCacheKey(text, voice, speed);
  const cachedAudio = speechCache.get(cacheKey);

  if (!cachedAudio) {
    return null;
  }

  speechCache.delete(cacheKey);
  speechCache.set(cacheKey, cachedAudio);
  return cachedAudio;
}

export async function synthesizeSpeechBuffer(
  text,
  voice = DEFAULT_VOICE,
  speed = DEFAULT_SPEED,
) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    throw new Error("Speech text is required");
  }

  const cachedAudio = getCachedSpeechBuffer(normalizedText, voice, speed);
  if (cachedAudio) {
    return cachedAudio;
  }

  const cacheKey = getSpeechCacheKey(normalizedText, voice, speed);
  const pendingAudio = pendingSpeechCache.get(cacheKey);
  if (pendingAudio) {
    return pendingAudio;
  }

  const synthesisPromise = synthesizeKokoroAudio(normalizedText, voice, speed)
    .then((audio) => {
      speechCache.set(cacheKey, audio);
      trimCache(speechCache, 256);
      return audio;
    })
    .finally(() => {
      pendingSpeechCache.delete(cacheKey);
    });

  pendingSpeechCache.set(cacheKey, synthesisPromise);
  return synthesisPromise;
}

export async function primeSpeechCache() {
  await primeKokoroRuntime();
  await synthesizeSpeechBuffer(FILLER_PHRASES[0], DEFAULT_VOICE, DEFAULT_SPEED);
}

export function areSpeechChunksCached(
  text,
  voice = DEFAULT_VOICE,
  speed = DEFAULT_SPEED,
) {
  const chunks = splitSpeechText(text);
  if (!chunks.length) {
    return false;
  }

  return chunks.every((chunk) => !!getCachedSpeechBuffer(chunk, voice, speed));
}
