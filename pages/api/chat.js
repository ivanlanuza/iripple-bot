import { createSystemPrompt } from "@/lib/server/chat-prompt";
import {
  DEFAULT_KEEP_ALIVE,
  embedText,
  generateText,
  resolveChatModel,
  resolveEmbedModel,
} from "@/lib/server/ollama";
import {
  loadEmbeddingStore,
  normalizeRobotReply,
  selectBestChunks,
} from "@/lib/server/rag";
import { createTimingTracker } from "@/lib/server/timing";

const CHAT_MODEL_OVERRIDE = process.env.IRIPPLE_CHAT_MODEL;
const EMBED_MODEL_OVERRIDE = process.env.IRIPPLE_EMBED_MODEL;
const MODEL_KEEP_ALIVE = DEFAULT_KEEP_ALIVE;
const MIN_RAG_SCORE = Number(process.env.IRIPPLE_MIN_RAG_SCORE || "0.22");
const MIN_RAG_TOP_SCORE = Number(
  process.env.IRIPPLE_MIN_RAG_TOP_SCORE || "0.4",
);
const FAQ_RAG_TOP_SCORE = Number(
  process.env.IRIPPLE_FAQ_TOP_SCORE || "0.45",
);
const CHAT_CACHE_VERSION = "v6";
const responseCache = new Map();
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

function trimCache(cache, maxSize) {
  while (cache.size > maxSize) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

function normalizeCacheKey(text, store) {
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
  const storeVersion = store?.createdAt || "no-store";
  return `${CHAT_CACHE_VERSION}::${storeVersion}::${normalizedText}`;
}

function buildPrompt(text, matches) {
  const context = matches.length
    ? matches.map((match) => match.text).join("\n---\n")
    : "none";

  return `Question: ${text}\nContext: ${context}`;
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

function hasKeywordSupport(text, matches) {
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

function isRetailContextQuestion(text) {
  return /\b(iripple|barter|nrce|pra|retail|retailer|store|stores|checkout|inventory|shrinkage|stock|branch|branches|loyalty|pos|philippine|philippines)\b/i.test(
    text,
  );
}

function isFaqStructuredChunk(text) {
  return /(frequently asked questions|(^|\n)\s*q:\s|(^|\n)\s*a:\s)/i.test(
    text || "",
  );
}

function isShortFaqQuestion(text) {
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

function buildNoRagReply(store) {
  if (!store?.chunks?.length) {
    return normalizeRobotReply(
      "[THINKING] I cannot answer that yet because my local booth knowledge has not been embedded. Please open the hidden admin panel and rebuild the embeddings. After that, ask me again and I will answer from the local RAG source only.",
    );
  }

  return normalizeRobotReply(
    "[THINKING] Sorry, I don't know the answer to that.",
  );
}

function isConnectionError(error) {
  return (
    error?.cause?.code === "ECONNREFUSED" ||
    error?.cause?.code === "ECONNRESET" ||
    error?.cause?.code === "ETIMEDOUT" ||
    /fetch failed/i.test(error?.message || "")
  );
}

export default async function handler(req, res) {
  const tracker = createTimingTracker("chat");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const text = String(req.body?.text || "").trim();

  if (!text) {
    res.status(400).json({ error: "Text is required" });
    return;
  }

  try {
    const store = await loadEmbeddingStore();
    tracker.mark("storeLoadedMs");
    const cacheKey = normalizeCacheKey(text, store);
    const cachedResponse = responseCache.get(cacheKey);
    if (cachedResponse) {
      if (!cachedResponse.ragUsed) {
        responseCache.delete(cacheKey);
      } else {
      responseCache.delete(cacheKey);
      responseCache.set(cacheKey, cachedResponse);
      res.status(200).json({
        ...cachedResponse,
        cached: true,
        timings: tracker.snapshot({
          cached: true,
          ragUsed: cachedResponse.ragUsed,
          chatModel: cachedResponse.chatModel || null,
          embedModel: cachedResponse.embedModel || null,
        }),
      });
      tracker.log({
        cached: true,
        ragUsed: cachedResponse.ragUsed,
        chatModel: cachedResponse.chatModel || null,
        embedModel: cachedResponse.embedModel || null,
      });
      return;
      }
    }

    let contextMatches = [];
    let embedModel = null;
    let ragError = null;

    if (store.chunks.length) {
      try {
        embedModel = await resolveEmbedModel(EMBED_MODEL_OVERRIDE);
        tracker.mark("embedModelResolvedMs");
        const queryEmbedding = await embedText(
          text,
          embedModel,
          MODEL_KEEP_ALIVE,
        );
        tracker.mark("queryEmbeddedMs");

        contextMatches = selectBestChunks(queryEmbedding, store, 3).filter(
          (match) => match.score >= MIN_RAG_SCORE,
        );
        tracker.mark("ragSelectedMs");
      } catch (error) {
        ragError = error;
      }
    }

    if (ragError && store.chunks.length && isConnectionError(ragError)) {
      tracker.log({ error: "Ollama offline", embedModel });
      res.status(503).json({
        error: "Ollama offline",
        timings: tracker.snapshot({
          embedModel,
        }),
      });
      return;
    }

    const topMatchScore = contextMatches[0]?.score || 0;
    const keywordSupported = hasKeywordSupport(text, contextMatches);
    const retailContextQuestion = isRetailContextQuestion(text);
    const faqSemanticHit =
      isShortFaqQuestion(text) &&
      topMatchScore >= FAQ_RAG_TOP_SCORE &&
      isFaqStructuredChunk(contextMatches[0]?.text);
    const ragConfidenceOk =
      contextMatches.length > 0 &&
      (
        (topMatchScore >= MIN_RAG_TOP_SCORE || keywordSupported) &&
        (keywordSupported || retailContextQuestion)
      ||
        faqSemanticHit
      );

    if (!ragConfidenceOk) {
      const noRagPayload = {
        ...buildNoRagReply(store),
        context: [],
        ragUsed: false,
        chatModel: null,
        embedModel,
      };

      res.status(200).json({
        ...noRagPayload,
        timings: tracker.snapshot({
          ragUsed: false,
          chatModel: null,
          embedModel,
        }),
      });
      tracker.log({
        cached: false,
        ragUsed: false,
        chatModel: null,
        embedModel,
      });
      return;
    }

    const chatModel = await resolveChatModel(CHAT_MODEL_OVERRIDE);
    tracker.mark("chatModelResolvedMs");

    const rawReply = await generateText({
      model: chatModel,
      system: createSystemPrompt(),
      prompt: buildPrompt(text, contextMatches),
      keepAlive: MODEL_KEEP_ALIVE,
      options: {
        temperature: 0.1,
        num_predict: 140,
        num_ctx: 1024,
      },
    });
    tracker.mark("llmDoneMs");

    const normalized = normalizeRobotReply(rawReply);
    const payload = {
      ...normalized,
      context: contextMatches.map(({ id, score, text: chunkText }) => ({
        id,
        score,
        text: chunkText,
      })),
      ragUsed: true,
      chatModel,
      embedModel,
    };

    responseCache.set(cacheKey, payload);
    trimCache(responseCache, 200);

    res.status(200).json({
      ...payload,
      timings: tracker.snapshot({
        ragUsed: true,
        chatModel,
        embedModel,
      }),
    });
    tracker.log({
      cached: false,
      ragUsed: true,
      chatModel,
      embedModel,
    });
    return;
  } catch (error) {
    tracker.log({ error: error.message || "Ollama offline" });
    res.status(500).json({
      error: error.message || "Ollama offline",
      timings: tracker.snapshot(),
    });
    return;
  }
}
