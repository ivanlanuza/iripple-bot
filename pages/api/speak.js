import { getSpeechDefaults, synthesizeSpeechBuffer } from "@/lib/server/speech";

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const text = String(req.body?.text || "").trim();
  const defaults = getSpeechDefaults();
  const voice = String(req.body?.voice || defaults.voice).trim() || defaults.voice;

  if (!text) {
    res.status(400).json({ error: "Speech text is required" });
    return;
  }

  try {
    const audio = await synthesizeSpeechBuffer(text, voice);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", String(audio.byteLength));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(audio);
    return;
  } catch (error) {
    res.status(500).json({
      error: error.message || "Speech synthesis failed",
    });
    return;
  }
}
