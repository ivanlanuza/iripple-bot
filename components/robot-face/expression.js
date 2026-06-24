import { IRRELEVANT_STREAK_THRESHOLD } from "@/components/robot-face/constants";

function isCompliment(text) {
  return /\b(thank you|thanks|good job|great job|nice job|well done|awesome|amazing|love you|love this|love iripple|great work|nice work|beautiful|cool robot|smart robot)\b/i.test(
    String(text || ""),
  );
}

function isUnsupportedReply(text) {
  return /\b(sorry, i don't know|i don't know|i do not know|cannot answer|can't answer|i only answer|local booth knowledge|not supported|outside the booth knowledge|not in my local knowledge)\b/i.test(
    String(text || "").toLowerCase(),
  );
}

export function getFaceExpression({
  mood,
  stage,
  reply,
  transcript,
  irrelevantQuestionStreak,
  idleExpression,
}) {
  const unsupportedReply = isUnsupportedReply(reply);
  const compliment = isCompliment(transcript);

  if (stage === "error") {
    return "sad";
  }

  if (stage === "idle") {
    return idleExpression;
  }

  if (compliment) {
    return "heartEyes";
  }

  if (unsupportedReply && irrelevantQuestionStreak >= IRRELEVANT_STREAK_THRESHOLD) {
    return "mad";
  }

  if (unsupportedReply) {
    return "apologetic";
  }

  if (stage === "processing" || mood === "THINKING") {
    return "thinking";
  }

  if (stage === "listening") {
    return mood === "THINKING" ? "thinking" : "curious";
  }

  if (mood === "SURPRISED") {
    return "surprised";
  }

  if (stage === "speaking") {
    return "happy";
  }

  return "happy";
}
