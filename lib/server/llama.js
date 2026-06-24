import {
  buildServerConfig,
  DEFAULT_EMBED_MODEL,
  DEFAULT_KEEP_ALIVE,
} from "@/lib/server/llama-config";
import { ensureServer } from "@/lib/server/llama-process";
import {
  buildChatCompletionPayload,
  getChatCompletionText,
  getEmbeddingVectors,
  iterateTextStream,
  postJson,
  postStream,
} from "@/lib/server/llama-transport";

export { DEFAULT_KEEP_ALIVE };

export async function listModels() {
  const configuredAliases = Object.keys(process.env)
    .filter((key) => /^IRIPPLE_MODEL_.+_PATH$/.test(key))
    .map((key) =>
      key
        .replace(/^IRIPPLE_MODEL_/, "")
        .replace(/_PATH$/, "")
        .toLowerCase(),
    );

  const aliases = new Set([
    process.env.IRIPPLE_CHAT_MODEL || "llama3.2:3b",
    process.env.IRIPPLE_EMBED_MODEL || DEFAULT_EMBED_MODEL,
    ...configuredAliases,
  ]);

  return Array.from(aliases)
    .filter(Boolean)
    .map((name) => ({ name }));
}

export async function resolveChatModel(preferredModel) {
  const config = await buildServerConfig("chat", preferredModel);
  return config.alias;
}

export async function resolveEmbedModel(preferredModel = DEFAULT_EMBED_MODEL) {
  const config = await buildServerConfig("embed", preferredModel);
  return config.alias;
}

export async function resolveEmbedModelPath(preferredModel = DEFAULT_EMBED_MODEL) {
  const config = await buildServerConfig("embed", preferredModel);
  return config.modelPath;
}

export async function embedText(
  text,
  model = DEFAULT_EMBED_MODEL,
) {
  const server = await ensureServer("embed", model);
  const data = await postJson(server.baseUrl, "/v1/embeddings", {
    model: server.alias,
    input: text,
    encoding_format: "float",
  });
  const embeddings = getEmbeddingVectors(data);

  if (Array.isArray(embeddings[0])) {
    return embeddings[0];
  }

  throw new Error("llama.cpp did not return an embedding");
}

export async function embedMany(
  texts,
  model = DEFAULT_EMBED_MODEL,
) {
  const server = await ensureServer("embed", model);
  const data = await postJson(server.baseUrl, "/v1/embeddings", {
    model: server.alias,
    input: texts,
    encoding_format: "float",
  });
  const embeddings = getEmbeddingVectors(data);

  if (embeddings.length === texts.length) {
    return embeddings;
  }

  throw new Error("llama.cpp did not return the expected embeddings");
}

export async function generateText({
  prompt,
  system,
  model = "llama3.2:3b",
  options = {},
}) {
  const server = await ensureServer("chat", model);
  const data = await postJson(
    server.baseUrl,
    "/v1/chat/completions",
    buildChatCompletionPayload({
      model: server.alias,
      system,
      prompt,
      stream: false,
      options,
    }),
  );

  return getChatCompletionText(data);
}

export async function* generateTextStream({
  prompt,
  system,
  model = "llama3.2:3b",
  options = {},
}) {
  const server = await ensureServer("chat", model);
  const { body, cancel, clear } = await postStream(
    server.baseUrl,
    "/v1/chat/completions",
    buildChatCompletionPayload({
      model: server.alias,
      system,
      prompt,
      stream: true,
      options,
    }),
  );

  try {
    yield* iterateTextStream(body);
  } finally {
    cancel();
    clear();
  }
}

export async function warmModels({ chatModel, embedModel }) {
  await Promise.allSettled([
    generateText({
      model: chatModel,
      system: "Reply with exactly [HAPPY] Ready.",
      prompt: "Warm the model.",
      options: {
        temperature: 0,
        num_predict: 8,
      },
    }),
    embedText("Warm the embeddings.", embedModel),
  ]);
}
