import {
  areSpeechChunksCached,
  getFillerPhrase,
  getSpeechDefaults,
  isSpeechChunkCached,
  splitSpeechText,
  synthesizeSpeechBuffer,
} from "@/lib/server/speech";
import { createTimingTracker } from "@/lib/server/timing";

export const config = {
  api: {
    responseLimit: false,
  },
};

function roundDuration(ms) {
  return Math.round(ms * 10) / 10;
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
    speechRequestToKokoroStartMs: snapshot.kokoroStartMs ?? null,
    speechGenerationMs: deriveDuration(
      snapshot.kokoroStartMs,
      snapshot.finalChunkReadyMs,
    ),
    speechRequestToFirstAudioChunkMs: snapshot.firstAudioChunkReadyMs ?? null,
  };
}

function writeJsonLine(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
}

export default async function handler(req, res) {
  const tracker = createTimingTracker("speak-stream");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const text = String(req.body?.text || "").trim();
  const fillerOnly = Boolean(req.body?.fillerOnly);
  const useFiller = Boolean(req.body?.useFiller);
  const defaults = getSpeechDefaults();
  const voice = String(req.body?.voice || defaults.voice).trim() || defaults.voice;

  if (!text && !fillerOnly) {
    res.status(400).json({ error: "Speech text is required" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    let firstChunkSent = false;

    const markKokoroStart = () => {
      const snapshot = tracker.snapshot();
      if (snapshot.kokoroStartMs === undefined) {
        tracker.mark("kokoroStartMs");
      }
    };

    const writeChunk = ({
      chunkText,
      audioBuffer,
      isFiller,
      cached,
      index,
    }) => {
      if (!firstChunkSent) {
        tracker.mark("firstAudioChunkReadyMs");
        firstChunkSent = true;
      }

      if (typeof index === "number") {
        tracker.mark(`chunk${index + 1}ReadyMs`);
      } else {
        tracker.mark("fillerReadyMs");
      }

      writeJsonLine(res, {
        type: "chunk",
        text: chunkText,
        isFiller,
        cached,
        mimeType: "audio/wav",
        audio: audioBuffer.toString("base64"),
        timings: buildTimingPayload(tracker, {
          fillerOnly,
          voice,
        }),
      });
    };

    if (fillerOnly) {
      const fillerText = getFillerPhrase();
      const cached = isSpeechChunkCached(fillerText, voice);
      if (!cached) {
        markKokoroStart();
      }

      const fillerAudio = await synthesizeSpeechBuffer(fillerText, voice);
      writeChunk({
        chunkText: fillerText,
        audioBuffer: fillerAudio,
        isFiller: true,
        cached,
      });
      tracker.mark("finalChunkReadyMs");
      writeJsonLine(res, {
        type: "done",
        timings: buildTimingPayload(tracker, {
          fillerOnly: true,
          voice,
          cached,
        }),
      });
      res.end();
      tracker.log({
        fillerOnly: true,
        voice,
        cached,
      });
      return;
    }

    const chunks = splitSpeechText(text);
    const allChunksCached = areSpeechChunksCached(text, voice);
    tracker.mark("chunksPreparedMs");

    if (useFiller && !allChunksCached) {
      const fillerText = getFillerPhrase();
      const fillerCached = isSpeechChunkCached(fillerText, voice);
      if (!fillerCached) {
        markKokoroStart();
      }

      const fillerAudio = await synthesizeSpeechBuffer(fillerText, voice);
      writeChunk({
        chunkText: fillerText,
        audioBuffer: fillerAudio,
        isFiller: true,
        cached: fillerCached,
      });
    }

    for (const [index, chunkText] of chunks.entries()) {
      const cached = isSpeechChunkCached(chunkText, voice);
      if (!cached) {
        markKokoroStart();
      }

      const chunkAudio = await synthesizeSpeechBuffer(chunkText, voice);
      writeChunk({
        chunkText,
        audioBuffer: chunkAudio,
        isFiller: false,
        cached,
        index,
      });
    }

    tracker.mark("finalChunkReadyMs");
    writeJsonLine(res, {
      type: "done",
      timings: buildTimingPayload(tracker, {
        fillerOnly: false,
        voice,
        chunkCount: chunks.length,
        cached: allChunksCached,
      }),
    });
    res.end();
    tracker.log({
      fillerOnly: false,
      voice,
      chunkCount: chunks.length,
      cached: allChunksCached,
    });
  } catch (error) {
    tracker.log({ error: error.message || "Speech streaming failed" });
    writeJsonLine(res, {
      type: "error",
      error: error.message || "Speech streaming failed",
    });
    res.end();
  }
}
