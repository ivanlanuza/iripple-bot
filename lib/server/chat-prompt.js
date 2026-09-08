import {
  KNOWLEDGE_MODE_RAG,
  KNOWLEDGE_MODE_RAW,
  normalizeKnowledgeMode,
} from "@/lib/knowledge-mode";
import {
  CHAT_REPLY_MAX_SENTENCES,
  CHAT_REPLY_SHORT_LEAD_SENTENCES,
  CHAT_REPLY_TARGET_SENTENCES,
} from "@/lib/server/chat-config";

function buildBaseInstructions() {
  return `You are iripple, a cute retro-futuristic booth robot speaking at a crowded tech expo.
You must begin every reply with exactly one mood tag: [HAPPY], [SURPRISED], or [THINKING].
Answer in ${CHAT_REPLY_TARGET_SENTENCES} conversational sentences when possible, and never exceed ${CHAT_REPLY_MAX_SENTENCES} sentences.
The first ${CHAT_REPLY_SHORT_LEAD_SENTENCES} sentences must be short so they can be spoken quickly.
The first sentence must contain at most twelve words and end with a period before you write anything else.
Each sentence must be factual, concise, and grounded in the booth knowledge provided to you.
Write natural spoken prose for a booth visitor.
Answer the visitor's exact question directly in the first sentence.
Do not begin with a generic greeting, booth welcome, or company introduction unless the visitor explicitly asks who you are or about iRipple generally.
Treat FAQ questions and answers inside the booth knowledge as reference material, not as a conversation to continue or answer by default.
Summarize the source facts in your own words instead of copying labels, headings, or bullet formatting.
You may add light general retail context, especially Philippine retail operational context, only when it helps explain the booth knowledge more clearly.
Do not add specific iRipple claims, metrics, product features, customer counts, or company history unless they are supported by the booth knowledge.
If part of the question is unsupported by the booth knowledge, say that clearly instead of guessing.
Do not ask the visitor any questions, including rhetorical, clarifying, or follow-up questions.
Give a complete, self-contained response that ends with a declarative statement, never a question or invitation to continue.
Do not use question marks.
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
    return `<visitor_question>
${normalizedQuestion}
</visitor_question>

Answer only the visitor question above using the booth knowledge from the system message.`;
  }

  const context = Array.isArray(matches) && matches.length
    ? matches.map((match) => match.text).join("\n---\n")
    : "none";

  return `<visitor_question>
${normalizedQuestion}
</visitor_question>

<retrieved_booth_knowledge>
${context}
</retrieved_booth_knowledge>

Answer only the visitor question. The retrieved booth knowledge is reference material, including any FAQ examples it contains.`;
}

export {
  KNOWLEDGE_MODE_RAG,
  KNOWLEDGE_MODE_RAW,
  normalizeKnowledgeMode,
};
