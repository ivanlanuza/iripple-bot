import { writeKnowledgeText } from "@/lib/server/rag";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const text = String(req.body?.text || "");

  try {
    await writeKnowledgeText(text);
    res.status(200).json({ ok: true });
    return;
  } catch (error) {
    res.status(500).json({
      error: error.message || "Unable to save knowledge file",
    });
    return;
  }
}
