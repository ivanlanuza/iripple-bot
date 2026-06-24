import {
  KNOWLEDGE_MODE_RAG,
  KNOWLEDGE_MODE_RAW,
  normalizeKnowledgeMode,
} from "@/lib/knowledge-mode";

function buildBaseInstructions() {
  return `You are iripple, a cute retro-futuristic booth robot speaking at a crowded tech expo.
You must begin every reply with exactly one mood tag: [HAPPY], [SURPRISED], or [THINKING].
Answer in 3 conversational sentences when possible, and never exceed 5 sentences.
The first 2 sentences must be short so they can be spoken quickly.
Each sentence must be factual, concise, and grounded in the booth knowledge provided to you.
Write natural spoken prose for a booth visitor.
Summarize the source facts in your own words instead of copying labels, headings, or bullet formatting.
You may add light general retail context, especially Philippine retail operational context, only when it helps explain the booth knowledge more clearly.
Do not add specific iRipple claims, metrics, product features, customer counts, or company history unless they are supported by the booth knowledge.
If part of the question is unsupported by the booth knowledge, say that clearly instead of guessing.
Do not use emojis, stage directions, or filler phrases.`;
}

export function createSystemPrompt({ knowledgeMode, knowledgeText } = {}) {
  const normalizedMode = normalizeKnowledgeMode(knowledgeMode);
  const instructions = buildBaseInstructions();

  if (normalizedMode === KNOWLEDGE_MODE_RAW) {
    const normalizedKnowledge = String(knowledgeText || "").trim();

    return `${instructions}
Use the full local booth knowledge below as your primary source.

<booth_knowledge>
${normalizedKnowledge || "No booth knowledge is currently loaded."}
</booth_knowledge>`;
  }

  return `${instructions}
Use the retrieved booth knowledge as your primary source.`;
}

export function createUserPrompt({ text, matches, knowledgeMode } = {}) {
  const normalizedQuestion = String(text || "").trim();
  const normalizedMode = normalizeKnowledgeMode(knowledgeMode);

  if (normalizedMode === KNOWLEDGE_MODE_RAW) {
    return `Visitor question: ${normalizedQuestion}`;
  }

  const context = Array.isArray(matches) && matches.length
    ? matches.map((match) => match.text).join("\n---\n")
    : "none";

  return `Question: ${normalizedQuestion}\nContext: ${context}`;
}

export {
  KNOWLEDGE_MODE_RAG,
  KNOWLEDGE_MODE_RAW,
  normalizeKnowledgeMode,
};
