import Head from "next/head";

import RobotFace from "@/components/RobotFace";
import {
  KNOWLEDGE_MODE_RAG,
  KNOWLEDGE_MODE_RAW,
} from "@/lib/knowledge-mode";
import {
  FACE_STYLE_STORAGE_KEY,
  FILLER_SPEECH_STORAGE_KEY,
  KNOWLEDGE_MODE_STORAGE_KEY,
  updateStoredPreference,
  useStoredPreferences,
} from "@/lib/client/preferences";
import { useIrippleVoiceAssistant } from "@/lib/client/use-iripple-voice-assistant";

export default function IrippleHome() {
  const { useFillerSpeech, faceStyle, knowledgeMode } = useStoredPreferences();
  const {
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
  } = useIrippleVoiceAssistant({
    knowledgeMode,
    useFillerSpeech,
  });

  return (
    <>
      <Head>
        <title>iripple robot</title>
        <meta
          name="description"
          content="Offline retro-futuristic expo robot interface for iripple."
        />
      </Head>

      <RobotFace
        debugMode={debugMode}
        mood={mood}
        transcript={transcript}
        reply={reply}
        timings={timings}
        stage={stage}
        error={error}
        mouthMotion={mouthMotion}
        irrelevantQuestionStreak={irrelevantQuestionStreak}
        faceStyle={faceStyle}
        knowledgeMode={knowledgeMode}
        useFillerSpeech={useFillerSpeech}
        onToggleFaceStyle={() =>
          updateStoredPreference(
            FACE_STYLE_STORAGE_KEY,
            faceStyle === "rounded" ? "pixelized" : "rounded",
          )
        }
        onToggleFillerSpeech={() =>
          updateStoredPreference(
            FILLER_SPEECH_STORAGE_KEY,
            useFillerSpeech ? "0" : "1",
          )
        }
        onToggleKnowledgeMode={() =>
          updateStoredPreference(
            KNOWLEDGE_MODE_STORAGE_KEY,
            knowledgeMode === KNOWLEDGE_MODE_RAW
              ? KNOWLEDGE_MODE_RAG
              : KNOWLEDGE_MODE_RAW,
          )
        }
      />

      <audio
        ref={audioRef}
        className="hidden"
        onEnded={handleAudioEnded}
      />
    </>
  );
}
