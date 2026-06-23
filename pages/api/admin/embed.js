import { embedMany, resolveEmbedModelPath } from "@/lib/server/llama";
import { chunkKnowledge, readKnowledgeText, writeEmbeddingStore } from "@/lib/server/rag";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const embedModel = String(req.body?.embedModel || "nomic-embed-text").trim();
  const chunkSize = Number(req.body?.chunkSize || 700);
  const overlap = Number(req.body?.overlap || 120);

  try {
    const embedModelPath = await resolveEmbedModelPath(embedModel);
    const knowledgeText = await readKnowledgeText();
    const chunks = chunkKnowledge(knowledgeText, chunkSize, overlap);

    if (!chunks.length) {
      res.status(400).json({
        error: "knowledge.txt is empty. Add local booth knowledge first.",
      });
      return;
    }

    const embeddings = await embedMany(
      chunks.map((chunk) => chunk.text),
      embedModel,
    );

    const store = {
      version: 2,
      createdAt: new Date().toISOString(),
      embedModel,
      embedModelPath,
      chunkSize,
      overlap,
      chunks: chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
      })),
    };

    await writeEmbeddingStore(store);

    res.status(200).json({
      ok: true,
      chunkCount: store.chunks.length,
      createdAt: store.createdAt,
      embedModel: store.embedModel,
    });
    return;
  } catch (error) {
    res.status(500).json({
      error: error.message || "Embedding build failed",
    });
    return;
  }
}
