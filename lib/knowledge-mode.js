export const KNOWLEDGE_MODE_RAG = "rag";
export const KNOWLEDGE_MODE_RAW = "raw";

export function normalizeKnowledgeMode(mode) {
  return mode === KNOWLEDGE_MODE_RAW ? KNOWLEDGE_MODE_RAW : KNOWLEDGE_MODE_RAG;
}
