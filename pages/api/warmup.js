import {
  warmModels,
  resolveChatModel,
  resolveEmbedModel,
} from "@/lib/server/llama";
import { loadEmbeddingStore } from "@/lib/server/rag";
import { primeSpeechCache } from "@/lib/server/speech";
import { createTimingTracker } from "@/lib/server/timing";

const CHAT_MODEL_OVERRIDE = process.env.IRIPPLE_CHAT_MODEL;
const EMBED_MODEL_OVERRIDE = process.env.IRIPPLE_EMBED_MODEL;

export default async function handler(req, res) {
  const tracker = createTimingTracker("warmup");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const [chatModel, embedModel] = await Promise.all([
      resolveChatModel(CHAT_MODEL_OVERRIDE),
      resolveEmbedModel(EMBED_MODEL_OVERRIDE),
    ]);
    tracker.mark("modelsResolvedMs");

    await Promise.all([
      warmModels({
        chatModel,
        embedModel,
      }),
      loadEmbeddingStore(),
    ]);
    tracker.mark("coreWarmMs");

    await primeSpeechCache();
    tracker.mark("speechPrimeMs");

    const responseTimings = tracker.snapshot({
      chatModel,
      embedModel,
      speechPrimed: true,
    });

    res.status(200).json({
      ok: true,
      timings: responseTimings,
    });
    tracker.log(responseTimings);
    return;
  } catch (error) {
    tracker.log({ error: error.message || "Warmup failed" });
    res.status(500).json({
      error: error.message || "Warmup failed",
      timings: tracker.snapshot(),
    });
    return;
  }
}
