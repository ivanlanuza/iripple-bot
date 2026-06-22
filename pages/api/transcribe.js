import fs from "fs/promises";
import formidable from "formidable";

import {
  createTempPath,
  ensureRuntimeDirs,
  getWhisperEnv,
  resolveWhisperModelPath,
  runCommand,
  safeUnlink,
} from "@/lib/server/offline";
import { createTimingTracker } from "@/lib/server/timing";

export const config = { api: { bodyParser: false } };

function parseForm(req) {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  const tracker = createTimingTracker("transcribe");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const inputPath = createTempPath("input", "webm");
  const outputPath = createTempPath("input", "wav");

  try {
    await ensureRuntimeDirs();
    tracker.mark("runtimeReadyMs");

    const { files } = await parseForm(req);
    tracker.mark("formParsedMs");
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;

    if (!audioFile?.filepath) {
      res.status(400).json({ error: "Audio file is required" });
      return;
    }

    await fs.rename(audioFile.filepath, inputPath);
    tracker.mark("uploadPreparedMs");

    await runCommand("ffmpeg", [
      "-loglevel",
      "error",
      "-nostdin",
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outputPath,
      "-y",
    ]);
    tracker.mark("ffmpegMs");

    const whisperEnv = await getWhisperEnv();
    const whisperModelPath = await resolveWhisperModelPath();
    tracker.mark("whisperSetupMs");
    const whisperBinary = process.env.WHISPER_BIN || "whisper-cli";
    const whisperThreads = String(process.env.WHISPER_THREADS || "8");
    const { stdout } = await runCommand(
      whisperBinary,
      [
        "-m",
        whisperModelPath,
        "-f",
        outputPath,
        "-l",
        "en",
        "-nt",
        "-np",
        "-t",
        whisperThreads,
      ],
      { env: whisperEnv },
    );
    tracker.mark("whisperMs");

    const cleanText = stdout
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const timings = tracker.snapshot({
      whisperModelPath,
      whisperBinary,
      whisperThreads: Number(whisperThreads),
    });
    tracker.log(timings);

    res.status(200).json({ text: cleanText, timings });
    return;
  } catch (error) {
    tracker.log({ error: error.message || "Whisper failed" });
    res.status(500).json({
      error: error.message || "Whisper failed",
      timings: tracker.snapshot(),
    });
    return;
  } finally {
    await safeUnlink([inputPath, outputPath]);
  }
}
