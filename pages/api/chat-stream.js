import {
  createSystemPrompt,
  createUserPrompt,
} from "@/lib/server/chat-prompt";
import {
  buildKnowledgeUnavailableReply,
  buildStaleEmbeddingsReply,
  collectCompletedSentences,
  finalizeTrailingSentence,
  hasKeywordSupport,
  isConnectionError,
  isFaqStructuredChunk,
  isRetailContextQuestion,
  isShortFaqQuestion,
  parseReplyParts,
} from "@/lib/server/chat-helpers";
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
  loadKnowledgeDocument,
  normalizeRobotReply,
  selectBestChunks,
} from "@/lib/server/rag";
import { createTimingTracker } from "@/lib/server/timing";
import {
  KNOWLEDGE_MODE_RAW,
  normalizeKnowledgeMode,
} from "@/lib/knowledge-mode";

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
const CHAT_CACHE_VERSION = "stream-v5";
const responseCache = new Map();
const CHAT_OPTIONS_BY_MODE = {
  rag: {
    temperature: 0.1,
    top_p: 0.9,
    repeat_penalty: 1.05,
    num_predict: 140,
    cache_prompt: true,
  },
  raw: {
    temperature: 0.05,
    top_p: 0.82,
    repeat_penalty: 1.08,
    num_predict: 160,
    cache_prompt: true,
  },
};

export const config = {
  api: {
    responseLimit: false,
  },
};

function roundDuration(ms) {
  return Math.round(ms * 10) / 10;
}

function trimCache(cache, maxSize) {
  while (cache.size > maxSize) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

function buildCacheKey({ text, knowledgeMode, sourceVersion }) {
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
  return `${CHAT_CACHE_VERSION}::${knowledgeMode}::${sourceVersion}::${normalizedText}`;
}

function getChatOptions(knowledgeMode) {
  return CHAT_OPTIONS_BY_MODE[knowledgeMode] || CHAT_OPTIONS_BY_MODE.rag;
}

function deriveDuration(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  return roundDuration(endMs - startMs);
}

function buildTimingPayload(tracker, extra = {}) {
  const snapshot = tracker.snapshot(extra);

  return {
    ...snapshot,
    questionToAnswerStartMs: snapshot.llmFirstTokenMs ?? null,
    answerGenerationMs: deriveDuration(
      snapshot.llmFirstTokenMs,
      snapshot.llmDoneMs,
    ),
    ragLookupMs: deriveDuration(
      snapshot.embedModelResolvedMs,
      snapshot.ragSelectedMs,
    ),
  };
}

function writeJsonLine(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
}

function buildContextPayload(contextMatches) {
  return contextMatches.map(({ id, score, text }) => ({
    id,
    score,
    text,
  }));
}

async function streamReply({
  res,
  tracker,
  text,
  knowledgeMode,
  knowledgeText = "",
  contextMatches = [],
  embedModel = null,
  cacheKey,
}) {
  const chatModel = await resolveChatModel(CHAT_MODEL_OVERRIDE);
  tracker.mark("chatModelResolvedMs");

  const systemPrompt = createSystemPrompt({
    knowledgeMode,
    knowledgeText,
  });
  const userPrompt = createUserPrompt({
    text,
    matches: contextMatches,
    knowledgeMode,
  });
  tracker.mark("promptBuiltMs");

  let rawReply = "";
  let consumedLength = 0;
  let detectedMood = null;
  let metaSent = false;
  let firstTokenSeen = false;
  const spokenSentences = [];
  const ragUsed = knowledgeMode !== KNOWLEDGE_MODE_RAW;
  const chatOptions = getChatOptions(knowledgeMode);

  for await (const chunk of generateTextStream({
    model: chatModel,
    system: systemPrompt,
    prompt: userPrompt,
    keepAlive: MODEL_KEEP_ALIVE,
    options: chatOptions,
  })) {
    if (chunk.response) {
      rawReply += chunk.response;

      if (!firstTokenSeen) {
        firstTokenSeen = true;
        tracker.mark("llmFirstTokenMs");
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
          ragUsed,
          cached: false,
          knowledgeMode,
          timings: buildTimingPayload(tracker, {
            ragUsed,
            knowledgeMode,
            chatModel,
            embedModel,
            cachePrompt: chatOptions.cache_prompt,
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
        ragUsed,
        cached: false,
        knowledgeMode,
        timings: buildTimingPayload(tracker, {
          ragUsed,
          knowledgeMode,
          chatModel,
          embedModel,
          cachePrompt: chatOptions.cache_prompt,
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
    ragUsed,
    knowledgeMode,
    chatModel,
    embedModel,
  };

  responseCache.set(cacheKey, payload);
  trimCache(responseCache, 200);

  writeJsonLine(res, {
    type: "done",
    ...payload,
    cached: false,
    timings: buildTimingPayload(tracker, {
      ragUsed,
      knowledgeMode,
      chatModel,
      embedModel,
      cachePrompt: chatOptions.cache_prompt,
    }),
  });
  res.end();
  tracker.log({
    cached: false,
    ragUsed,
    knowledgeMode,
    chatModel,
    embedModel,
    cachePrompt: chatOptions.cache_prompt,
  });
}

export default async function handler(req, res) {
  const tracker = createTimingTracker("chat-stream");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const text = String(req.body?.text || "").trim();
  const knowledgeMode = normalizeKnowledgeMode(req.body?.knowledgeMode);
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
    let sourceVersion = "none";
    let knowledgeText = "";
    let store = null;

    if (knowledgeMode === KNOWLEDGE_MODE_RAW) {
      const knowledgeDocument = await loadKnowledgeDocument();
      tracker.mark("knowledgeLoadedMs");
      knowledgeText = String(knowledgeDocument.text || "").trim();
      sourceVersion = `knowledge-${knowledgeDocument.mtimeMs || "missing"}`;
    } else {
      store = await loadEmbeddingStore();
      tracker.mark("storeLoadedMs");
      sourceVersion = `embeddings-${store.createdAt || "no-store"}`;
    }

    const cacheKey = buildCacheKey({
      text,
      knowledgeMode,
      sourceVersion,
    });
    const cachedResponse = responseCache.get(cacheKey);
    const canServeCachedResponse =
      cachedResponse &&
      (
        cachedResponse.ragUsed ||
        cachedResponse.knowledgeMode === KNOWLEDGE_MODE_RAW
      );

    if (canServeCachedResponse) {
      const sentences = cachedResponse.text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      const timingPayload = buildTimingPayload(tracker, {
        cached: true,
        ragUsed: cachedResponse.ragUsed,
        knowledgeMode: cachedResponse.knowledgeMode || knowledgeMode,
        chatModel: cachedResponse.chatModel || null,
        embedModel: cachedResponse.embedModel || null,
      });

      writeJsonLine(res, {
        type: "meta",
        mood: cachedResponse.mood,
        ragUsed: cachedResponse.ragUsed,
        cached: true,
        knowledgeMode: cachedResponse.knowledgeMode || knowledgeMode,
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
        timings: timingPayload,
      });
      res.end();
      tracker.log({
        cached: true,
        ragUsed: cachedResponse.ragUsed,
        knowledgeMode: cachedResponse.knowledgeMode || knowledgeMode,
        chatModel: cachedResponse.chatModel || null,
        embedModel: cachedResponse.embedModel || null,
      });
      return;
    }

    if (knowledgeMode === KNOWLEDGE_MODE_RAW) {
      if (!knowledgeText) {
        const noKnowledgePayload = {
          ...buildKnowledgeUnavailableReply(knowledgeMode),
          context: [],
          ragUsed: false,
          knowledgeMode,
          chatModel: null,
          embedModel: null,
        };

        writeJsonLine(res, {
          type: "meta",
          mood: noKnowledgePayload.mood,
          ragUsed: false,
          cached: false,
          knowledgeMode,
          timings: buildTimingPayload(tracker, {
            ragUsed: false,
            knowledgeMode,
            chatModel: null,
            embedModel: null,
          }),
        });
        writeJsonLine(res, {
          type: "sentence",
          text: noKnowledgePayload.text,
          mood: noKnowledgePayload.mood,
          reply: noKnowledgePayload.reply,
          replyText: noKnowledgePayload.text,
          cached: false,
        });
        writeJsonLine(res, {
          type: "done",
          ...noKnowledgePayload,
          cached: false,
          timings: buildTimingPayload(tracker, {
            ragUsed: false,
            knowledgeMode,
            chatModel: null,
            embedModel: null,
          }),
        });
        res.end();
        tracker.log({
          cached: false,
          ragUsed: false,
          knowledgeMode,
          chatModel: null,
          embedModel: null,
          reason: "empty-knowledge",
        });
        return;
      }

      await streamReply({
        res,
        tracker,
        text,
        knowledgeMode,
        knowledgeText,
        contextMatches: [],
        embedModel: null,
        cacheKey,
      });
      return;
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
            knowledgeMode,
            chatModel: null,
            embedModel,
          };

          writeJsonLine(res, {
            type: "meta",
            mood: stalePayload.mood,
            ragUsed: false,
            cached: false,
            knowledgeMode,
            timings: buildTimingPayload(tracker, {
              ragUsed: false,
              knowledgeMode,
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
            timings: buildTimingPayload(tracker, {
              ragUsed: false,
              knowledgeMode,
              chatModel: null,
              embedModel,
            }),
          });
          res.end();
          tracker.log({
            cached: false,
            ragUsed: false,
            knowledgeMode,
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
        timings: buildTimingPayload(tracker, {
          knowledgeMode,
          embedModel,
        }),
      });
      res.end();
      tracker.log({
        error: "llama.cpp unavailable",
        knowledgeMode,
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
        ...buildKnowledgeUnavailableReply(knowledgeMode, store),
        context: [],
        ragUsed: false,
        knowledgeMode,
        chatModel: null,
        embedModel,
      };

      writeJsonLine(res, {
        type: "meta",
        mood: noRagPayload.mood,
        ragUsed: false,
        cached: false,
        knowledgeMode,
        timings: buildTimingPayload(tracker, {
          ragUsed: false,
          knowledgeMode,
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
        timings: buildTimingPayload(tracker, {
          ragUsed: false,
          knowledgeMode,
          chatModel: null,
          embedModel,
        }),
      });
      res.end();
      tracker.log({
        cached: false,
        ragUsed: false,
        knowledgeMode,
        chatModel: null,
        embedModel,
      });
      return;
    }

    await streamReply({
      res,
      tracker,
      text,
      knowledgeMode,
      knowledgeText: "",
      contextMatches,
      embedModel,
      cacheKey,
    });
  } catch (error) {
    tracker.log({
      error: error.message || "llama.cpp unavailable",
      knowledgeMode,
    });
    res.status(500).json({
      error: error.message || "llama.cpp unavailable",
      timings: buildTimingPayload(tracker, {
        knowledgeMode,
      }),
    });
  }
}
