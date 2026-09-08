function isCompliment(text) {
  return /\b(thank you|thanks|good job|great job|nice job|well done|awesome|amazing|love you|love this|love iripple|great work|nice work|beautiful|cool robot|smart robot)\b/i.test(
    String(text || ""),
  );
}

export function getFaceExpression({
  mood,
  stage,
  transcript,
  idleExpression,
}) {
  const compliment = isCompliment(transcript);

  if (stage === "idle") {
    return idleExpression;
  }

  if (compliment) {
    return "heartEyes";
  }

  if (stage === "processing" || stage === "error" || mood === "THINKING") {
    return "kawaii";
  }

  if (stage === "listening") {
    return mood === "THINKING" ? "thinking" : "curious";
  }

  if (mood === "SURPRISED") {
    return "sparkle";
  }

  if (stage === "speaking") {
    return "happy";
  }

  return "happy";
}
