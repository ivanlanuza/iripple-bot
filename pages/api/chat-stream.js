import { createSystemPrompt } from "@/lib/server/chat-prompt";
import {
  DEFAULT_KEEP_ALIVE,
  embedText,
  generateTextStream,
  resolveEmbedModelPath,
  resolveChatModel,
  resolveEmbedModel,
} from "@/lib/server/llama";
import {
  isEmbeddingStoreCompatible,
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
const CHAT_CACHE_VERSION = "stream-v4";
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

export const config = {
  api: {
    responseLimit: false,
  },
};

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

function buildStaleEmbeddingsReply() {
  return normalizeRobotReply(
    "[THINKING] My local knowledge embeddings were built with a different embedding model. Open the hidden admin panel and rebuild embeddings for the current llama.cpp configuration.",
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

function writeJsonLine(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
}

function parseReplyParts(rawReply) {
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

function collectCompletedSentences(fullText, consumedLength) {
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

function finalizeTrailingSentence(fullText, consumedLength) {
  const trailing = fullText
    .slice(consumedLength)
    .replace(/\s+/g, " ")
    .trim();

  if (!trailing) {
    return null;
  }

  return /[.!?]$/.test(trailing) ? trailing : `${trailing}.`;
}

function buildContextPayload(contextMatches) {
  return contextMatches.map(({ id, score, text }) => ({
    id,
    score,
    text,
  }));
}

export default async function handler(req, res) {
  const tracker = createTimingTracker("chat-stream");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const text = String(req.body?.text || "").trim();
  tracker.mark("requestParsedMs");

  if (!text) {
    res.status(400).json({ error: "Text is required" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "Transfer-Encoding": "chunked",
  });

  try {
    const store = await loadEmbeddingStore();
    tracker.mark("storeLoadedMs");

    const cacheKey = normalizeCacheKey(text, store);
    const cachedResponse = responseCache.get(cacheKey);
    if (cachedResponse) {
      if (!cachedResponse.ragUsed) {
        responseCache.delete(cacheKey);
      } else {
      const sentences = cachedResponse.text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      const timingPayload = tracker.snapshot({
        cached: true,
        ragUsed: cachedResponse.ragUsed,
        chatModel: cachedResponse.chatModel || null,
        embedModel: cachedResponse.embedModel || null,
      });

      writeJsonLine(res, {
        type: "meta",
        mood: cachedResponse.mood,
        ragUsed: cachedResponse.ragUsed,
        cached: true,
        timings: timingPayload,
      });

      let cumulativeText = "";
      for (const sentence of sentences) {
        cumulativeText = `${cumulativeText} ${sentence}`.trim();
        writeJsonLine(res, {
          type: "sentence",
          text: sentence,
          mood: cachedResponse.mood,
          reply: `[${cachedResponse.mood}] ${cumulativeText}`,
          replyText: cumulativeText,
          cached: true,
        });
      }

      writeJsonLine(res, {
        type: "done",
        ...cachedResponse,
        cached: true,
        timings: tracker.snapshot({
          cached: true,
          ragUsed: cachedResponse.ragUsed,
          chatModel: cachedResponse.chatModel || null,
          embedModel: cachedResponse.embedModel || null,
        }),
      });
      res.end();
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
        const embedModelPath = await resolveEmbedModelPath(EMBED_MODEL_OVERRIDE);
        tracker.mark("embedModelResolvedMs");

        if (
          !isEmbeddingStoreCompatible(store, {
            embedModel,
            embedModelPath,
          })
        ) {
          const stalePayload = {
            ...buildStaleEmbeddingsReply(),
            context: [],
            ragUsed: false,
            chatModel: null,
            embedModel,
          };

          writeJsonLine(res, {
            type: "meta",
            mood: stalePayload.mood,
            ragUsed: false,
            cached: false,
            timings: tracker.snapshot({
              ragUsed: false,
              chatModel: null,
              embedModel,
            }),
          });
          writeJsonLine(res, {
            type: "sentence",
            text: stalePayload.text,
            mood: stalePayload.mood,
            reply: stalePayload.reply,
            replyText: stalePayload.text,
            cached: false,
          });
          writeJsonLine(res, {
            type: "done",
            ...stalePayload,
            cached: false,
            timings: tracker.snapshot({
              ragUsed: false,
              chatModel: null,
              embedModel,
            }),
          });
          res.end();
          tracker.log({
            cached: false,
            ragUsed: false,
            chatModel: null,
            embedModel,
            reason: "stale-embeddings",
          });
          return;
        }

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
        tracker.mark("ragSelectionFailedMs");
      }
    }

    if (ragError && store.chunks.length && isConnectionError(ragError)) {
      writeJsonLine(res, {
        type: "error",
        error: "llama.cpp unavailable",
        timings: tracker.snapshot({
          embedModel,
        }),
      });
      res.end();
      tracker.log({
        error: "llama.cpp unavailable",
        embedModel,
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

      writeJsonLine(res, {
        type: "meta",
        mood: noRagPayload.mood,
        ragUsed: false,
        cached: false,
        timings: tracker.snapshot({
          ragUsed: false,
          chatModel: null,
          embedModel,
        }),
      });
      writeJsonLine(res, {
        type: "sentence",
        text: noRagPayload.text,
        mood: noRagPayload.mood,
        reply: noRagPayload.reply,
        replyText: noRagPayload.text,
        cached: false,
      });
      writeJsonLine(res, {
        type: "done",
        ...noRagPayload,
        cached: false,
        timings: tracker.snapshot({
          ragUsed: false,
          chatModel: null,
          embedModel,
        }),
      });
      res.end();
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

    let rawReply = "";
    let consumedLength = 0;
    let detectedMood = null;
    let metaSent = false;
    let firstTokenSeen = false;
    const spokenSentences = [];

    for await (const chunk of generateTextStream({
      model: chatModel,
      system: createSystemPrompt(),
      prompt: buildPrompt(text, contextMatches),
      keepAlive: MODEL_KEEP_ALIVE,
      options: {
        temperature: 0.1,
        num_predict: 140,
        num_ctx: 1024,
      },
    })) {
      if (chunk.response) {
        rawReply += chunk.response;

        if (!firstTokenSeen) {
          firstTokenSeen = true;
          tracker.mark("llmFirstChunkMs");
        }

        const replyParts = parseReplyParts(rawReply);
        if (!detectedMood && replyParts.mood) {
          detectedMood = replyParts.mood;
        }

        if (!metaSent && detectedMood) {
          metaSent = true;
          writeJsonLine(res, {
            type: "meta",
            mood: detectedMood,
            ragUsed: true,
            cached: false,
            timings: tracker.snapshot({
              ragUsed: true,
              chatModel,
              embedModel,
            }),
          });
        }

        const { sentences, consumedLength: nextConsumedLength } =
          collectCompletedSentences(replyParts.text, consumedLength);

        consumedLength = nextConsumedLength;

        for (const sentence of sentences) {
          spokenSentences.push(sentence);
          const replyText = spokenSentences.join(" ");
          writeJsonLine(res, {
            type: "sentence",
            text: sentence,
            mood: detectedMood || "THINKING",
            reply: `[${detectedMood || "THINKING"}] ${replyText}`,
            replyText,
            cached: false,
          });
        }
      }

      if (chunk.done) {
        tracker.mark("llmDoneMs");
        break;
      }
    }

    const replyParts = parseReplyParts(rawReply);
    if (!detectedMood) {
      detectedMood = replyParts.mood || "THINKING";
      if (!metaSent) {
        writeJsonLine(res, {
          type: "meta",
          mood: detectedMood,
          ragUsed: true,
          cached: false,
          timings: tracker.snapshot({
            ragUsed: true,
            chatModel,
            embedModel,
          }),
        });
      }
    }

    const trailingSentence = finalizeTrailingSentence(
      replyParts.text,
      consumedLength,
    );
    if (trailingSentence) {
      spokenSentences.push(trailingSentence);
      const replyText = spokenSentences.join(" ");
      writeJsonLine(res, {
        type: "sentence",
        text: trailingSentence,
        mood: detectedMood,
        reply: `[${detectedMood}] ${replyText}`,
        replyText,
        cached: false,
      });
    }

    const payload = {
      ...normalizeRobotReply(rawReply),
      context: buildContextPayload(contextMatches),
      ragUsed: true,
      chatModel,
      embedModel,
    };

    responseCache.set(cacheKey, payload);
    trimCache(responseCache, 200);

    writeJsonLine(res, {
      type: "done",
      ...payload,
      cached: false,
      timings: tracker.snapshot({
        ragUsed: true,
        chatModel,
        embedModel,
      }),
    });
    res.end();
    tracker.log({
      cached: false,
      ragUsed: true,
      chatModel,
      embedModel,
      sentences: spokenSentences.length,
    });
  } catch (error) {
    tracker.log({
      error: error.message || "Chat streaming failed",
    });
    writeJsonLine(res, {
      type: "error",
      error: error.message || "Chat streaming failed",
      timings: tracker.snapshot(),
    });
    res.end();
  }
}
