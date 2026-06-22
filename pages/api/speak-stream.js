import {
  areSpeechChunksCached,
  getFillerPhrase,
  getSpeechDefaults,
  splitSpeechText,
  synthesizeSpeechBuffer,
} from "@/lib/server/speech";
import { createTimingTracker } from "@/lib/server/timing";

export const config = {
  api: {
    responseLimit: false,
  },
};

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
    if (fillerOnly) {
      const fillerText = getFillerPhrase();
      const fillerAudio = await synthesizeSpeechBuffer(fillerText, voice);
      tracker.mark("fillerReadyMs");
      writeJsonLine(res, {
        type: "chunk",
        text: fillerText,
        isFiller: true,
        mimeType: "audio/wav",
        audio: fillerAudio.toString("base64"),
      });
      writeJsonLine(res, {
        type: "done",
      });
      res.end();
      tracker.log({
        fillerOnly: true,
        voice,
        cached: true,
      });
      return;
    }

    const chunks = splitSpeechText(text);
    const allChunksCached = areSpeechChunksCached(text, voice);
    tracker.mark("chunksPreparedMs");

    if (useFiller && !allChunksCached) {
      const fillerText = getFillerPhrase();
      const fillerAudio = await synthesizeSpeechBuffer(fillerText, voice);
      tracker.mark("fillerReadyMs");
      writeJsonLine(res, {
        type: "chunk",
        text: fillerText,
        isFiller: true,
        mimeType: "audio/wav",
        audio: fillerAudio.toString("base64"),
      });
    }

    for (const [index, chunkText] of chunks.entries()) {
      const chunkAudio = await synthesizeSpeechBuffer(chunkText, voice);
      tracker.mark(`chunk${index + 1}ReadyMs`);
      writeJsonLine(res, {
        type: "chunk",
        text: chunkText,
        isFiller: false,
        mimeType: "audio/wav",
        audio: chunkAudio.toString("base64"),
      });
    }

    writeJsonLine(res, {
      type: "done",
    });
    res.end();
    tracker.log({
      fillerOnly: false,
      voice,
      chunkCount: chunks.length,
      cached: allChunksCached,
    });
    return;
  } catch (error) {
    tracker.log({ error: error.message || "Speech streaming failed" });
    writeJsonLine(res, {
      type: "error",
      error: error.message || "Speech streaming failed",
    });
    res.end();
    return;
  }
}
