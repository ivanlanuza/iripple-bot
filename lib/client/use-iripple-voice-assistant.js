import { useEffect, useEffectEvent, useRef, useState } from "react";

const BASE_MOUTH_MOTION = {
  openness: 0.14,
  width: 1.02,
  smile: 0.18,
  lift: -2,
};

function roundDuration(ms) {
  return Math.round(ms * 10) / 10;
}

function isUnsupportedReplyText(text) {
  return /\b(sorry, i don't know|i don't know|i do not know|cannot answer|can't answer|i only answer|local booth knowledge|not supported|outside the booth knowledge|not in my local knowledge)\b/i.test(
    String(text || "").toLowerCase(),
  );
}

function stripMoodTag(text) {
  return String(text || "")
    .replace(/^\s*\[(HAPPY|SURPRISED|THINKING)\]\s*/i, "")
    .trim();
}

export function useIrippleVoiceAssistant({
  knowledgeMode,
  useFillerSpeech,
} = {}) {
  const [stage, setStage] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [mood, setMood] = useState("HAPPY");
  const [error, setError] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [mouthMotion, setMouthMotion] = useState(BASE_MOUTH_MOTION);
  const [irrelevantQuestionStreak, setIrrelevantQuestionStreak] = useState(0);
  const [timings, setTimings] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mouthAnimationActiveRef = useRef(false);
  const interactionIdRef = useRef(0);
  const playbackInteractionIdRef = useRef(null);
  const recordingRequestedRef = useRef(false);
  const microphoneStreamPromiseRef = useRef(null);
  const transcribeAbortControllerRef = useRef(null);
  const chatAbortControllerRef = useRef(null);
  const speechAbortControllersRef = useRef(new Set());
  const playbackQueueRef = useRef([]);
  const playbackActiveRef = useRef(false);
  const pendingSpeechStreamsRef = useRef(0);
  const currentAudioUrlRef = useRef(null);
  const speechRequestQueueRef = useRef([]);
  const speechQueueActiveRef = useRef(false);
  const voiceInputEndedAtRef = useRef(0);
  const transcriptReadyAtRef = useRef(0);
  const answerGenerationStartedAtRef = useRef(0);
  const firstAnswerSpeechRequestAtRef = useRef(0);
  const firstSpeechChunkMsRef = useRef(null);
  const firstAudioPlaybackMsRef = useRef(null);
  const firstKokoroStartMsRef = useRef(null);
  const irrelevantReplyCountedRef = useRef(false);

  function logClientPerf(label, payload) {
    console.info(`[perf][client] ${label} ${JSON.stringify(payload)}`);
  }

  function isCurrentInteraction(interactionId) {
    return interactionId === interactionIdRef.current;
  }

  function cancelCurrentInteraction() {
    interactionIdRef.current += 1;
    recordingRequestedRef.current = false;
    transcribeAbortControllerRef.current?.abort();
    chatAbortControllerRef.current?.abort();
    speechAbortControllersRef.current.forEach((controller) => controller.abort());
    speechAbortControllersRef.current.clear();
    transcribeAbortControllerRef.current = null;
    chatAbortControllerRef.current = null;
    resetPlayback();
  }

  function getMicrophoneStream() {
    if (streamRef.current?.active) {
      return Promise.resolve(streamRef.current);
    }

    if (!microphoneStreamPromiseRef.current) {
      microphoneStreamPromiseRef.current = navigator.mediaDevices
        .getUserMedia({
          audio: {
            channelCount: 1,
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
          },
        })
        .then((stream) => {
          streamRef.current = stream;
          return stream;
        })
        .finally(() => {
          microphoneStreamPromiseRef.current = null;
        });
    }

    return microphoneStreamPromiseRef.current;
  }

  function mergeTimings(nextValues) {
    if (!nextValues) {
      return;
    }

    setTimings((current) => {
      const merged = { ...(current || {}) };

      Object.entries(nextValues).forEach(([key, value]) => {
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          merged[key] &&
          typeof merged[key] === "object" &&
          !Array.isArray(merged[key])
        ) {
          merged[key] = {
            ...merged[key],
            ...value,
          };
          return;
        }

        merged[key] = value;
      });

      return merged;
    });
  }

  function hasPendingPipelineWork() {
    return (
      pendingSpeechStreamsRef.current > 0 ||
      speechQueueActiveRef.current ||
      speechRequestQueueRef.current.length > 0
    );
  }

  function updateIrrelevantQuestionStreak(nextReply) {
    const normalizedReply = String(nextReply || "").trim();
    if (!normalizedReply) {
      return;
    }

    if (isUnsupportedReplyText(normalizedReply)) {
      if (!irrelevantReplyCountedRef.current) {
        irrelevantReplyCountedRef.current = true;
        setIrrelevantQuestionStreak((current) => current + 1);
      }
      return;
    }

    irrelevantReplyCountedRef.current = true;
    setIrrelevantQuestionStreak(0);
  }

  function resetInteractionTimingRefs() {
    transcriptReadyAtRef.current = 0;
    answerGenerationStartedAtRef.current = 0;
    firstAnswerSpeechRequestAtRef.current = 0;
    firstSpeechChunkMsRef.current = null;
    firstAudioPlaybackMsRef.current = null;
    firstKokoroStartMsRef.current = null;
  }

  function getBaseMouthMotion(nextMood = mood) {
    if (nextMood === "SURPRISED") {
      return {
        openness: 0.34,
        width: 0.8,
        smile: 0.02,
        lift: -4,
      };
    }

    if (nextMood === "THINKING") {
      return {
        openness: 0.16,
        width: 0.92,
        smile: -0.05,
        lift: 3,
      };
    }

    return BASE_MOUTH_MOTION;
  }

  function stopMouthAnimation() {
    mouthAnimationActiveRef.current = false;
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }

  function updateMouthFromAnalyser() {
    if (!mouthAnimationActiveRef.current) {
      return;
    }

    if (!analyserRef.current) {
      mouthAnimationActiveRef.current = false;
      return;
    }

    const waveform = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(waveform);

    let sumSquares = 0;
    for (let index = 0; index < waveform.length; index += 1) {
      const normalized = (waveform[index] - 128) / 128;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / waveform.length);
    const activity = Math.min(1, rms * 8.5);
    const base = getBaseMouthMotion();

    setMouthMotion({
      openness: Math.min(1, base.openness + activity * 0.95),
      width:
        mood === "SURPRISED"
          ? Math.max(0.72, base.width - activity * 0.08)
          : Math.min(1.18, base.width + activity * 0.08),
      smile:
        mood === "THINKING"
          ? Math.max(-0.2, base.smile - activity * 0.05)
          : Math.min(0.42, base.smile + activity * 0.08),
      lift: base.lift - activity * 2,
    });

    animationFrameRef.current = requestAnimationFrame(updateMouthFromAnalyser);
  }

  function startMouthAnimation() {
    if (!analyserRef.current || mouthAnimationActiveRef.current) {
      return;
    }

    mouthAnimationActiveRef.current = true;
    updateMouthFromAnalyser();
  }

  function resetPlayback() {
    stopMouthAnimation();
    playbackInteractionIdRef.current = null;
    playbackQueueRef.current = [];
    playbackActiveRef.current = false;
    pendingSpeechStreamsRef.current = 0;
    speechRequestQueueRef.current = [];
    speechQueueActiveRef.current = false;
    resetInteractionTimingRefs();
    voiceInputEndedAtRef.current = 0;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }

    setMouthMotion(getBaseMouthMotion());
    setStage("idle");
  }

  function decodeBase64Audio(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function playNextQueuedChunk(interactionId = interactionIdRef.current) {
    if (!audioRef.current || !isCurrentInteraction(interactionId)) {
      return;
    }

    const nextChunk = playbackQueueRef.current.shift();
    if (!nextChunk) {
      playbackActiveRef.current = false;
      stopMouthAnimation();
      if (!hasPendingPipelineWork()) {
        resetPlayback();
      } else {
        setStage("processing");
        setMouthMotion(getBaseMouthMotion());
      }
      return;
    }

    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }

    if (!isCurrentInteraction(interactionId)) {
      return;
    }

    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }

    const chunkBlob = new Blob([nextChunk.bytes], { type: nextChunk.mimeType });
    const objectUrl = URL.createObjectURL(chunkBlob);
    currentAudioUrlRef.current = objectUrl;

    playbackActiveRef.current = true;
    playbackInteractionIdRef.current = interactionId;
    audioRef.current.src = objectUrl;
    audioRef.current.currentTime = 0;
    setStage("speaking");
    try {
      await audioRef.current.play();
    } catch (error) {
      playbackActiveRef.current = false;
      stopMouthAnimation();

      if (currentAudioUrlRef.current === objectUrl) {
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
        URL.revokeObjectURL(objectUrl);
        currentAudioUrlRef.current = null;
      }

      throw error;
    }

    if (!isCurrentInteraction(interactionId)) {
      return;
    }

    if (firstAudioPlaybackMsRef.current == null && voiceInputEndedAtRef.current) {
      firstAudioPlaybackMsRef.current = roundDuration(
        performance.now() - voiceInputEndedAtRef.current,
      );
      mergeTimings({
        summary: {
          voiceEndToFirstAudioMs: firstAudioPlaybackMsRef.current,
        },
      });
      logClientPerf("first-audio", {
        voiceEndToFirstAudioMs: firstAudioPlaybackMsRef.current,
      });
    }

    startMouthAnimation();
  }

  async function drainSpeechQueue(interactionId = interactionIdRef.current) {
    if (
      !isCurrentInteraction(interactionId) ||
      speechQueueActiveRef.current
    ) {
      return;
    }

    speechQueueActiveRef.current = true;

    try {
      while (
        isCurrentInteraction(interactionId) &&
        speechRequestQueueRef.current.length > 0
      ) {
        const sentence = speechRequestQueueRef.current.shift();
        if (!sentence) {
          continue;
        }

        await playReplyStream(sentence, {
          append: true,
          interactionId,
          onFirstChunk: () => {
            if (firstSpeechChunkMsRef.current == null && voiceInputEndedAtRef.current) {
              firstSpeechChunkMsRef.current = roundDuration(
                performance.now() - voiceInputEndedAtRef.current,
              );
              mergeTimings({
                summary: {
                  voiceEndToFirstSpeechChunkMs: firstSpeechChunkMsRef.current,
                },
              });
            }
          },
        });
      }
    } finally {
      if (!isCurrentInteraction(interactionId)) {
        return;
      }

      speechQueueActiveRef.current = false;

      if (!playbackActiveRef.current && playbackQueueRef.current.length === 0) {
        if (!hasPendingPipelineWork()) {
          resetPlayback();
        } else {
          setStage("processing");
          setMouthMotion(getBaseMouthMotion());
        }
      }
    }
  }

  function enqueueSpeechText(sentence, interactionId = interactionIdRef.current) {
    // Mood tags drive the face and UI state; they are never visitor-facing
    // speech, even if an endpoint includes one in a sentence payload.
    const spokenSentence = stripMoodTag(sentence);
    if (!spokenSentence || !isCurrentInteraction(interactionId)) {
      return;
    }

    speechRequestQueueRef.current.push(spokenSentence);
    drainSpeechQueue(interactionId).catch((playbackError) => {
      if (!isCurrentInteraction(interactionId)) {
        return;
      }

      setError(playbackError.message || "Speech playback failed");
      setStage("error");
    });
  }

  // Each speech request returns chunked NDJSON so the browser can start playback
  // before the full sentence has finished synthesizing.
  async function playReplyStream(spokenText, options = {}) {
    const interactionId = options.interactionId ?? interactionIdRef.current;
    if (!audioRef.current || !isCurrentInteraction(interactionId)) {
      return;
    }

    if (!options.append) {
      playbackQueueRef.current = [];
      playbackActiveRef.current = false;
    }

    pendingSpeechStreamsRef.current += 1;

    const isAnswerSpeech = !options.fillerOnly;
    const abortController = new AbortController();
    speechAbortControllersRef.current.add(abortController);
    const speechRequestStartedAt = performance.now();
    if (isAnswerSpeech && !firstAnswerSpeechRequestAtRef.current) {
      firstAnswerSpeechRequestAtRef.current = speechRequestStartedAt;

      if (answerGenerationStartedAtRef.current) {
        mergeTimings({
          summary: {
            answerStartToSpeechRequestMs: roundDuration(
              speechRequestStartedAt - answerGenerationStartedAtRef.current,
            ),
          },
        });
      }
    }

    try {
      const speechResponse = await fetch("/api/speak-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          text: spokenText,
          fillerOnly: Boolean(options.fillerOnly),
          useFiller: Boolean(options.useFiller),
        }),
      });

      if (!speechResponse.ok) {
        const details = await speechResponse.json().catch(() => ({}));
        throw new Error(details.error || "Speech playback failed");
      }

      const reader = speechResponse.body?.getReader();
      if (!reader) {
        throw new Error("Speech stream reader unavailable");
      }

      let buffer = "";
      const decoder = new TextDecoder();
      let firstChunkSeen = false;

      while (true) {
        const { value, done } = await reader.read();
        if (!isCurrentInteraction(interactionId)) {
          return;
        }

        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line) {
            const message = JSON.parse(line);

            if (message.type === "error") {
              throw new Error(message.error || "Speech streaming failed");
            }

            if (message.type === "chunk") {
              if (message.timings) {
                mergeTimings({
                  speech: message.timings,
                });
              }

              if (
                isAnswerSpeech &&
                firstKokoroStartMsRef.current == null &&
                firstAnswerSpeechRequestAtRef.current &&
                answerGenerationStartedAtRef.current &&
                Number.isFinite(message.timings?.speechRequestToKokoroStartMs)
              ) {
                firstKokoroStartMsRef.current = roundDuration(
                  firstAnswerSpeechRequestAtRef.current -
                    answerGenerationStartedAtRef.current +
                    message.timings.speechRequestToKokoroStartMs,
                );
                mergeTimings({
                  summary: {
                    answerStartToKokoroStartMs:
                      firstKokoroStartMsRef.current,
                  },
                });
                logClientPerf("kokoro-start", {
                  answerStartToKokoroStartMs:
                    firstKokoroStartMsRef.current,
                });
              }

              if (!firstChunkSeen) {
                firstChunkSeen = true;
                options.onFirstChunk?.();
              }

              playbackQueueRef.current.push({
                bytes: decodeBase64Audio(message.audio),
                mimeType: message.mimeType || "audio/wav",
              });

              if (!playbackActiveRef.current) {
                await playNextQueuedChunk(interactionId);
              }
            }

            if (message.type === "done" && message.timings) {
              mergeTimings({
                speech: message.timings,
              });
            }
          }

          newlineIndex = buffer.indexOf("\n");
        }

        if (done) {
          break;
        }
      }
    } finally {
      speechAbortControllersRef.current.delete(abortController);
      if (!isCurrentInteraction(interactionId)) {
        return;
      }

      pendingSpeechStreamsRef.current = Math.max(
        0,
        pendingSpeechStreamsRef.current - 1,
      );

      if (!playbackActiveRef.current && playbackQueueRef.current.length === 0) {
        if (!hasPendingPipelineWork()) {
          resetPlayback();
        } else {
          setStage("processing");
          setMouthMotion(getBaseMouthMotion());
        }
      }
    }
  }

  // Chat replies are consumed sentence-by-sentence so the UI can start speaking
  // before the full answer is complete.
  async function streamChatReply(
    cleanTranscript,
    nextKnowledgeMode,
    interactionId = interactionIdRef.current,
  ) {
    if (!isCurrentInteraction(interactionId)) {
      return;
    }

    pendingSpeechStreamsRef.current += 1;
    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;

    try {
      const chatResponse = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          text: cleanTranscript,
          knowledgeMode: nextKnowledgeMode,
        }),
      });

      if (!chatResponse.ok) {
        const details = await chatResponse.json().catch(() => ({}));
        throw new Error(details.error || "Chat streaming failed");
      }

      const reader = chatResponse.body?.getReader();
      if (!reader) {
        throw new Error("Chat stream reader unavailable");
      }

      let buffer = "";
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (!isCurrentInteraction(interactionId)) {
          return;
        }

        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line) {
            const message = JSON.parse(line);

            if (message.type === "error") {
              throw new Error(message.error || "Chat streaming failed");
            }

            if (message.type === "meta") {
              if (!answerGenerationStartedAtRef.current) {
                answerGenerationStartedAtRef.current =
                  transcriptReadyAtRef.current &&
                  Number.isFinite(message.timings?.questionToAnswerStartMs)
                    ? transcriptReadyAtRef.current +
                      message.timings.questionToAnswerStartMs
                    : performance.now();
                logClientPerf("answer-start", {
                  questionToAnswerStartMs:
                    message.timings?.questionToAnswerStartMs ?? null,
                  knowledgeMode:
                    message.knowledgeMode || nextKnowledgeMode,
                });
              }

              const nextMood = message.mood || "THINKING";
              setMood(nextMood);
              setMouthMotion(getBaseMouthMotion(nextMood));
              mergeTimings({
                chat: message.timings || undefined,
                summary: {
                  questionToAnswerStartMs:
                    message.timings?.questionToAnswerStartMs ?? null,
                },
                request: {
                  knowledgeMode:
                    message.knowledgeMode || nextKnowledgeMode,
                },
              });
            }

            if (message.type === "delta") {
              const nextMood = message.mood || "THINKING";
              const nextReply =
                message.reply ||
                `[${nextMood}] ${message.replyText || ""}`.trim();
              setMood(nextMood);
              setReply(nextReply);
            }

            if (message.type === "sentence") {
              const nextMood = message.mood || "THINKING";
              const nextReply =
                message.reply ||
                `[${nextMood}] ${message.replyText || message.text || ""}`.trim();
              setMood(nextMood);
              setReply(nextReply);
              updateIrrelevantQuestionStreak(nextReply);
              enqueueSpeechText(message.text, interactionId);
            }

            if (message.type === "done") {
              setMood(message.mood || "THINKING");
              setReply(message.reply || "");
              updateIrrelevantQuestionStreak(message.reply || "");
              mergeTimings({
                chat: message.timings || undefined,
                summary: {
                  answerGenerationMs:
                    message.timings?.answerGenerationMs ?? null,
                },
                request: {
                  knowledgeMode:
                    message.knowledgeMode || nextKnowledgeMode,
                },
              });
              logClientPerf("answer-done", {
                answerGenerationMs:
                  message.timings?.answerGenerationMs ?? null,
                knowledgeMode:
                  message.knowledgeMode || nextKnowledgeMode,
              });
            }
          }

          newlineIndex = buffer.indexOf("\n");
        }

        if (done) {
          break;
        }
      }
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }

      if (!isCurrentInteraction(interactionId)) {
        return;
      }

      pendingSpeechStreamsRef.current = Math.max(
        0,
        pendingSpeechStreamsRef.current - 1,
      );

      if (!playbackActiveRef.current && playbackQueueRef.current.length === 0) {
        if (!hasPendingPipelineWork()) {
          resetPlayback();
        } else {
          setStage("processing");
          setMouthMotion(getBaseMouthMotion());
        }
      }
    }
  }

  async function sendAudioToBackend(interactionId) {
    if (!isCurrentInteraction(interactionId)) {
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", audioBlob, "input.webm");
    const abortController = new AbortController();
    transcribeAbortControllerRef.current = abortController;

    try {
      resetInteractionTimingRefs();
      setTimings(null);

      const transcriptionResponse = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      });
      const transcriptionData = await transcriptionResponse.json();

      if (!isCurrentInteraction(interactionId)) {
        return;
      }

      if (!transcriptionResponse.ok) {
        throw new Error(transcriptionData.error || "Transcription failed");
      }

      const cleanTranscript = String(transcriptionData.text || "").trim();
      transcriptReadyAtRef.current = performance.now();
      setTranscript(cleanTranscript);
      const voiceEndToTranscriptionDoneMs = voiceInputEndedAtRef.current
        ? roundDuration(transcriptReadyAtRef.current - voiceInputEndedAtRef.current)
        : null;
      mergeTimings({
        transcribe: transcriptionData.timings || undefined,
        summary: {
          voiceEndToTranscriptionDoneMs,
        },
        request: {
          knowledgeMode,
        },
      });
      logClientPerf("transcription-done", {
        voiceEndToTranscriptionDoneMs,
        knowledgeMode,
      });

      if (!cleanTranscript) {
        irrelevantReplyCountedRef.current = false;
        setIrrelevantQuestionStreak(0);
        setReply("[THINKING] I did not catch that over the expo noise.");
        setMood("THINKING");
        setMouthMotion(getBaseMouthMotion("THINKING"));
        setStage("idle");
        return;
      }

      irrelevantReplyCountedRef.current = false;
      setMood("THINKING");
      setMouthMotion(getBaseMouthMotion("THINKING"));
      speechRequestQueueRef.current = [];
      speechQueueActiveRef.current = false;

      let resolveFillerStart;
      const fillerStarted = new Promise((resolve) => {
        resolveFillerStart = resolve;
      });

      const fillerPromise = useFillerSpeech
        ? playReplyStream("", {
            fillerOnly: true,
            interactionId,
            onFirstChunk: () => resolveFillerStart?.(),
          }).catch(() => {
            resolveFillerStart?.();
          })
        : Promise.resolve().then(() => {
            resolveFillerStart?.();
          });
      const chatStreamPromise = streamChatReply(
        cleanTranscript,
        knowledgeMode,
        interactionId,
      );

      await Promise.race([
        fillerStarted,
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
      await Promise.all([fillerPromise, chatStreamPromise]);
    } catch (requestError) {
      if (!isCurrentInteraction(interactionId)) {
        return;
      }

      resetPlayback();
      irrelevantReplyCountedRef.current = false;
      setIrrelevantQuestionStreak(0);
      setError(requestError.message || "Offline pipeline failure");
      setReply("[THINKING] I hit a local pipeline snag and need a quick reset.");
      setMood("THINKING");
      setMouthMotion(getBaseMouthMotion("THINKING"));
      setStage("error");
    } finally {
      if (transcribeAbortControllerRef.current === abortController) {
        transcribeAbortControllerRef.current = null;
      }
    }
  }

  async function startRecording() {
    const interactionId = interactionIdRef.current + 1;
    interactionIdRef.current = interactionId;
    recordingRequestedRef.current = true;
    setError("");
    setStage("listening");
    resetInteractionTimingRefs();
    setMouthMotion({
      openness: 0.2,
      width: 1.06,
      smile: 0.08,
      lift: 0,
    });
    audioChunksRef.current = [];

    // Start the audio graph within the Space-key user gesture. Waiting until a
    // streamed reply arrives can cause the browser to delay first playback.
    if (audioContextRef.current?.state === "suspended") {
      void audioContextRef.current.resume().catch(() => {});
    }

    try {
      const stream = await getMicrophoneStream();

      if (
        !isCurrentInteraction(interactionId) ||
        !recordingRequestedRef.current
      ) {
        if (isCurrentInteraction(interactionId)) {
          setStage("idle");
          setMouthMotion(getBaseMouthMotion());
        }
        return;
      }

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => sendAudioToBackend(interactionId);
      recorder.start();
    } catch {
      if (!isCurrentInteraction(interactionId)) {
        return;
      }

      recordingRequestedRef.current = false;
      setError("Microphone access failed. Check the wired USB input.");
      setStage("error");
    }
  }

  function stopRecording() {
    recordingRequestedRef.current = false;

    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return;
    }

    voiceInputEndedAtRef.current = performance.now();
    mediaRecorderRef.current.stop();
    setStage("processing");
    setMouthMotion({
      openness: 0.1,
      width: 0.86,
      smile: -0.06,
      lift: 2,
    });
  }

  const onSpaceDown = useEffectEvent(() => {
    startRecording();
  });

  const onSpaceUp = useEffectEvent(() => {
    stopRecording();
  });

  const onInterruptCurrentInteraction = useEffectEvent(() => {
    cancelCurrentInteraction();
  });

  const onWarmMicrophone = useEffectEvent(() => {
    // Keeping the input stream ready avoids losing the opening words while a
    // new microphone session initializes after the button is pressed.
    getMicrophoneStream().catch(() => {});
  });

  useEffect(() => {
    fetch("/api/warmup", {
      method: "POST",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    onWarmMicrophone();
  }, []);

  useEffect(() => {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    const audioElement = audioRef.current;

    if (!audioElement || !AudioContextClass || sourceNodeRef.current) {
      return undefined;
    }

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;

    const source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceNodeRef.current = source;

    return () => {
      stopMouthAnimation();
      audioContext.close().catch(() => {});
      source.disconnect();
      analyser.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.code === "KeyD") {
        event.preventDefault();
        setDebugMode((current) => !current);
        return;
      }

      if (event.code !== "Space" || event.repeat) {
        return;
      }

      if (stage === "listening") {
        return;
      }

      event.preventDefault();
      if (stage === "processing" || stage === "speaking") {
        onInterruptCurrentInteraction();
      }
      onSpaceDown();
    };

    const handleKeyUp = (event) => {
      if (event.code !== "Space") {
        return;
      }

      event.preventDefault();
      onSpaceUp();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [stage]);

  useEffect(() => {
    const audioElement = audioRef.current;
    const speechAbortControllers = speechAbortControllersRef.current;

    return () => {
      interactionIdRef.current += 1;
      transcribeAbortControllerRef.current?.abort();
      chatAbortControllerRef.current?.abort();
      speechAbortControllers.forEach((controller) => controller.abort());
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (audioElement) {
        audioElement.pause();
        audioElement.src = "";
      }

      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
    };
  }, []);

  function handleAudioEnded() {
    const interactionId = playbackInteractionIdRef.current;
    if (!isCurrentInteraction(interactionId)) {
      return;
    }

    playNextQueuedChunk(interactionId).catch((playbackError) => {
      if (!isCurrentInteraction(interactionId)) {
        return;
      }

      setError(playbackError.message || "Speech playback failed");
      setStage("error");
    });
  }

  return {
    audioRef,
    debugMode,
    error,
    handleAudioEnded,
    irrelevantQuestionStreak,
    mood,
    mouthMotion,
    reply,
    stage,
    timings,
    transcript,
  };
}
