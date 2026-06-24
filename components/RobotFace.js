import { KNOWLEDGE_MODE_RAW } from "@/lib/knowledge-mode";
import { DebugPanel } from "@/components/robot-face/DebugPanel";
import { getFaceExpression } from "@/components/robot-face/expression";
import { useFaceMotion, useIdleExpression } from "@/components/robot-face/hooks";
import { PixelFaceScreen } from "@/components/robot-face/PixelFaceScreen";
import { RoundedFaceScreen } from "@/components/robot-face/RoundedFaceScreen";

function FaceScreen(props) {
  if (props.faceStyle === "pixelized") {
    return <PixelFaceScreen {...props} />;
  }

  return <RoundedFaceScreen {...props} />;
}

export default function RobotFace({
  debugMode,
  mood,
  transcript,
  reply,
  timings,
  stage,
  error,
  mouthMotion,
  faceStyle,
  knowledgeMode,
  useFillerSpeech,
  onToggleFaceStyle,
  onToggleFillerSpeech,
  onToggleKnowledgeMode,
  irrelevantQuestionStreak = 0,
}) {
  const idleExpression = useIdleExpression(stage);
  const expression = getFaceExpression({
    mood,
    stage,
    reply,
    transcript,
    irrelevantQuestionStreak,
    idleExpression,
  });
  const { blinkLevel, motion } = useFaceMotion(stage);

  const stageLabel = {
    idle: "Ready for the next booth visitor",
    listening: "Listening on the arcade button channel",
    processing: "Checking the local booth brain",
    speaking: "Talking through the local speaker rig",
    error: "The offline booth stack needs attention",
  }[stage];

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#d6efe3_0%,#9ecbb9_35%,#5f8f7f_100%)] px-4 py-8 text-[#1a2f29]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.38),transparent_34%)]" />
      <div className="scanlines pointer-events-none absolute inset-0 opacity-20" />

      <div className="pointer-events-none absolute inset-x-6 top-5 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.4em] text-[#335c50]/70">
        <span>iripple-robot</span>
      </div>

      <section className="relative z-10 flex w-full max-w-3xl items-center justify-center">
        <div className="w-full">
          <FaceScreen
            stage={stage}
            mouthMotion={mouthMotion}
            expression={expression}
            blinkLevel={blinkLevel}
            motion={motion}
            faceStyle={faceStyle}
          />
        </div>
      </section>

      {debugMode ? (
        <>
          <div className="pointer-events-none absolute left-4 top-20 z-20 w-[18rem] max-w-[calc(100vw-2rem)]">
            <DebugPanel title="Status">
              <p className="font-mono text-sm leading-6 text-[#17342c]">
                {stageLabel}
              </p>
              <p className="mt-4 text-xs leading-5 text-[#33594d]/80">
                Hold the physical arcade button mapped to Spacebar to talk.
              </p>
            </DebugPanel>
          </div>

          <div className="pointer-events-none absolute right-4 top-20 z-20 w-[20rem] max-w-[calc(100vw-2rem)]">
            <DebugPanel title="Conversation">
              <p className="min-h-6 font-mono text-sm leading-6 text-[#41665a]">
                {transcript ? `Visitor: ${transcript}` : "Visitor: ..."}
              </p>
              <p className="mt-3 min-h-12 font-mono text-base leading-7 text-[#17342c]">
                {reply || "[HAPPY] Ready for the next curious attendee."}
              </p>
              {error ? (
                <p className="mt-3 text-xs leading-5 text-[#8e533e]">
                  {error}
                </p>
              ) : null}
            </DebugPanel>
          </div>

          <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex w-[min(92vw,38rem)] -translate-x-1/2 gap-3">
            <DebugPanel title="Debug" className="flex-1">
              <p className="text-sm leading-6 text-[#214238]">
                Friendly monochrome kiosk mode with local chunked speech playback.
              </p>
              {timings ? (
                <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[0.68rem] leading-5 text-[#33594d]">
                  {JSON.stringify(timings, null, 2)}
                </pre>
              ) : null}
            </DebugPanel>
            <div className="debug-panel flex flex-1 flex-col justify-center gap-3 text-[0.65rem] uppercase tracking-[0.32em] text-[#4b7868]/80">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="rounded-full border border-[#4c7768]/18 bg-[#effbf5]/58 px-3 py-2">
                  Offline
                </span>
                <span className="rounded-full border border-[#4c7768]/18 bg-[#effbf5]/58 px-3 py-2">
                  Sarah Voice
                </span>
                <span className="rounded-full border border-[#4c7768]/18 bg-[#effbf5]/58 px-3 py-2">
                  {faceStyle === "pixelized" ? "Pixelized Face" : "Rounded Face"}
                </span>
                <span className="rounded-full border border-[#4c7768]/18 bg-[#effbf5]/58 px-3 py-2">
                  {knowledgeMode === KNOWLEDGE_MODE_RAW ? "Raw Knowledge" : "RAG Knowledge"}
                </span>
              </div>
              <button
                type="button"
                onClick={onToggleFaceStyle}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 text-[0.68rem] font-semibold tracking-[0.26em] transition ${
                  faceStyle === "pixelized"
                    ? "border-[#325b4d] bg-[#dff6eb] text-[#17342c]"
                    : "border-[#4c7768]/18 bg-[#effbf5]/58 text-[#4b7868]"
                }`}
              >
                Face Style {faceStyle === "pixelized" ? "Pixelized" : "Rounded"}
              </button>
              <button
                type="button"
                onClick={onToggleFillerSpeech}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 text-[0.68rem] font-semibold tracking-[0.26em] transition ${
                  useFillerSpeech
                    ? "border-[#325b4d] bg-[#dff6eb] text-[#17342c]"
                    : "border-[#4c7768]/18 bg-[#effbf5]/58 text-[#4b7868]"
                }`}
              >
                Filler Phrase {useFillerSpeech ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={onToggleKnowledgeMode}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 text-[0.68rem] font-semibold tracking-[0.26em] transition ${
                  knowledgeMode === KNOWLEDGE_MODE_RAW
                    ? "border-[#325b4d] bg-[#dff6eb] text-[#17342c]"
                    : "border-[#4c7768]/18 bg-[#effbf5]/58 text-[#4b7868]"
                }`}
              >
                Knowledge {knowledgeMode === KNOWLEDGE_MODE_RAW ? "Raw" : "RAG"}
              </button>
              <span className="text-center text-[0.6rem] tracking-[0.22em] text-[#4b7868]/70">
                Defaults: filler off, knowledge RAG
              </span>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
