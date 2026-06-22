import fs from "fs/promises";

import {
  EMBEDDINGS_FILE,
  KNOWLEDGE_FILE,
  ensureDataFiles,
} from "@/lib/server/offline";

let cachedEmbeddingStore = null;
let cachedEmbeddingStoreMtimeMs = null;

export async function readKnowledgeText() {
  await ensureDataFiles();
  return fs.readFile(KNOWLEDGE_FILE, "utf8");
}

export async function writeKnowledgeText(text) {
  await ensureDataFiles();
  await fs.writeFile(KNOWLEDGE_FILE, text.trim() ? text : "", "utf8");
}

export async function loadEmbeddingStore() {
  await ensureDataFiles();

  try {
    const stats = await fs.stat(EMBEDDINGS_FILE);
    if (
      cachedEmbeddingStore &&
      cachedEmbeddingStoreMtimeMs === stats.mtimeMs
    ) {
      return cachedEmbeddingStore;
    }

    const raw = await fs.readFile(EMBEDDINGS_FILE, "utf8");
    const data = JSON.parse(raw);
    const store = {
      version: data.version || 1,
      createdAt: data.createdAt || null,
      embedModel: data.embedModel || null,
      chunkSize: data.chunkSize || null,
      overlap: data.overlap || null,
      chunks: Array.isArray(data.chunks) ? data.chunks : [],
    };

    cachedEmbeddingStore = store;
    cachedEmbeddingStoreMtimeMs = stats.mtimeMs;
    return store;
  } catch {
    return {
      version: 1,
      createdAt: null,
      embedModel: null,
      chunkSize: null,
      overlap: null,
      chunks: [],
    };
  }
}

export async function writeEmbeddingStore(store) {
  await ensureDataFiles();
  await fs.writeFile(EMBEDDINGS_FILE, JSON.stringify(store, null, 2), "utf8");
  const stats = await fs.stat(EMBEDDINGS_FILE);
  cachedEmbeddingStore = store;
  cachedEmbeddingStoreMtimeMs = stats.mtimeMs;
}

export function chunkKnowledge(text, chunkSize = 700, overlap = 120) {
  const normalized = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) {
    return [];
  }

  const safeChunkSize = Math.max(250, Number(chunkSize) || 700);
  const safeOverlap = Math.min(
    Math.max(40, Number(overlap) || 120),
    safeChunkSize - 40,
  );

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + safeChunkSize);

    if (end < normalized.length) {
      const windowText = normalized.slice(start, end);
      const splitAt = Math.max(
        windowText.lastIndexOf("\n"),
        windowText.lastIndexOf(". "),
        windowText.lastIndexOf(" "),
      );

      if (splitAt > safeChunkSize * 0.55) {
        end = start + splitAt + 1;
      }
    }

    const content = normalized.slice(start, end).trim();
    if (content) {
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        text: content,
      });
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - safeOverlap, start + 1);
  }

  return chunks;
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function selectBestChunks(queryEmbedding, store, limit = 3) {
  const chunks = Array.isArray(store?.chunks) ? store.chunks : [];

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter((chunk) => Number.isFinite(chunk.score) && chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function normalizeRobotReply(rawReply) {
  const compact = String(rawReply || "")
    .replace(/\s+/g, " ")
    .trim();
  const match = compact.match(/^\[(HAPPY|SURPRISED|THINKING)\]\s*/i);
  const mood = match?.[1]?.toUpperCase() || "THINKING";
  const withoutTag = compact.replace(/^\[(HAPPY|SURPRISED|THINKING)\]\s*/i, "").trim();
  const sentences = withoutTag
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 4);
  const text = sentences.length
    ? sentences.join(" ")
    : "I am still processing that question.";
  const normalizedText = /[.!?]$/.test(text) ? text : `${text}.`;

  return {
    mood,
    text: normalizedText,
    reply: `[${mood}] ${normalizedText}`,
  };
}
