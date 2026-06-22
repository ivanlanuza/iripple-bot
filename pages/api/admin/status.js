import { EMBEDDINGS_FILE, KNOWLEDGE_FILE } from "@/lib/server/offline";
import { loadEmbeddingStore, readKnowledgeText } from "@/lib/server/rag";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const [knowledgeText, store] = await Promise.all([
      readKnowledgeText(),
      loadEmbeddingStore(),
    ]);

    res.status(200).json({
      knowledgePath: KNOWLEDGE_FILE,
      embeddingsPath: EMBEDDINGS_FILE,
      knowledgeText,
      chunkCount: store.chunks.length,
      createdAt: store.createdAt,
      embedModel: store.embedModel,
      chunkSize: store.chunkSize,
      overlap: store.overlap,
    });
    return;
  } catch (error) {
    res.status(500).json({
      error: error.message || "Unable to load admin status",
    });
    return;
  }
}
