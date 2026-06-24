import { KNOWLEDGE_MODE_RAW } from "@/lib/knowledge-mode";
import { normalizeRobotReply } from "@/lib/server/rag";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "not",
  "but",
  "can",
  "our",
  "you",
  "about",
  "after",
  "also",
  "been",
  "does",
  "from",
  "have",
  "into",
  "that",
  "their",
  "them",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
  "tell",
  "please",
  "won",
  "finals",
  "who",
  "how",
  "why",
]);

export function buildKnowledgeUnavailableReply(knowledgeMode, store) {
  if (knowledgeMode === KNOWLEDGE_MODE_RAW) {
    return normalizeRobotReply(
      "[THINKING] I cannot answer that yet because my local booth knowledge file is empty. Please update data knowledge before asking again.",
    );
  }

  if (!store?.chunks?.length) {
    return normalizeRobotReply(
      "[THINKING] I cannot answer that yet because my local booth knowledge has not been embedded. Please open the hidden admin panel and rebuild the embeddings. After that, ask me again and I will answer from the local RAG source only.",
    );
  }

  return normalizeRobotReply(
    "[THINKING] Sorry, I don't know the answer to that.",
  );
}

export function buildStaleEmbeddingsReply() {
  return normalizeRobotReply(
    "[THINKING] My local knowledge embeddings were built with a different embedding model. Open the hidden admin panel and rebuild embeddings for the current llama.cpp configuration.",
  );
}

function getQueryKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        (token.length >= 4 || token === "pos") && !STOP_WORDS.has(token),
    );
}

export function hasKeywordSupport(text, matches) {
  const keywords = getQueryKeywords(text);
  if (!keywords.length) {
    return false;
  }

  const contextTokens = new Set(
    matches
      .map((match) => match.text.toLowerCase())
      .join(" ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );

  return keywords.some((keyword) => contextTokens.has(keyword));
}

export function isRetailContextQuestion(text) {
  return /\b(iripple|barter|nrce|pra|retail|retailer|store|stores|checkout|inventory|shrinkage|stock|branch|branches|loyalty|pos|philippine|philippines)\b/i.test(
    text,
  );
}

export function isFaqStructuredChunk(text) {
  return /(frequently asked questions|(^|\n)\s*q:\s|(^|\n)\s*a:\s)/i.test(
    text || "",
  );
}

export function isShortFaqQuestion(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  const words = normalized.split(" ").filter(Boolean);
  return words.length <= 6 && text.includes("?");
}

export function isConnectionError(error) {
  return (
    error?.cause?.code === "ECONNREFUSED" ||
    error?.cause?.code === "ECONNRESET" ||
    error?.cause?.code === "ETIMEDOUT" ||
    /fetch failed/i.test(error?.message || "")
  );
}

export function parseReplyParts(rawReply) {
  const trimmed = String(rawReply || "");
  const match = trimmed.match(/^\[(HAPPY|SURPRISED|THINKING)\]\s*/i);

  if (match) {
    return {
      mood: match[1].toUpperCase(),
      text: trimmed.slice(match[0].length),
      hasExplicitMood: true,
    };
  }

  if (trimmed.startsWith("[")) {
    return {
      mood: null,
      text: "",
      hasExplicitMood: false,
    };
  }

  return {
    mood: "THINKING",
    text: trimmed,
    hasExplicitMood: false,
  };
}

export function collectCompletedSentences(fullText, consumedLength) {
  const sentences = [];
  let nextConsumedLength = consumedLength;

  while (true) {
    const remaining = fullText.slice(nextConsumedLength);
    const match = remaining.match(/^\s*(.+?[.!?])(?=\s|$)/);
    if (!match) {
      break;
    }

    const sentence = match[1].replace(/\s+/g, " ").trim();
    if (sentence) {
      sentences.push(sentence);
    }
    nextConsumedLength += match[0].length;
  }

  return {
    sentences,
    consumedLength: nextConsumedLength,
  };
}

export function finalizeTrailingSentence(fullText, consumedLength) {
  const trailing = fullText
    .slice(consumedLength)
    .replace(/\s+/g, " ")
    .trim();

  if (!trailing) {
    return null;
  }

  return /[.!?]$/.test(trailing) ? trailing : `${trailing}.`;
}
