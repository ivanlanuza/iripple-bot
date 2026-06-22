const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
export const DEFAULT_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "10m";
const PREFER_SMALL_CHAT_MODEL = process.env.IRIPPLE_PREFER_SMALL_CHAT_MODEL === "1";
export const DEFAULT_CHAT_MODEL = PREFER_SMALL_CHAT_MODEL
  ? "gemma3:1b"
  : "llama3.2:3b";
export const DEFAULT_EMBED_MODEL = "nomic-embed-text";
const CHAT_MODEL_CANDIDATES = PREFER_SMALL_CHAT_MODEL
  ? ["gemma3:1b", "llama3.2:3b"]
  : ["llama3.2:3b", "gemma3:1b"];
let cachedModelsPromise;

async function fetchJson(endpoint, init = {}) {
  const response = await fetch(`${OLLAMA_URL}${endpoint}`, init);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Ollama request failed for ${endpoint}`);
  }

  return response.json();
}

async function postJson(endpoint, payload) {
  return fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function postStream(endpoint, payload) {
  const response = await fetch(`${OLLAMA_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Ollama request failed for ${endpoint}`);
  }

  if (!response.body) {
    throw new Error(`Ollama did not return a stream for ${endpoint}`);
  }

  return response.body;
}

export async function listModels() {
  if (!cachedModelsPromise) {
    cachedModelsPromise = fetchJson("/api/tags").catch((error) => {
      cachedModelsPromise = null;
      throw error;
    });
  }

  const data = await cachedModelsPromise;
  return Array.isArray(data?.models) ? data.models : [];
}

function modelMatches(candidate, model) {
  return (
    model?.name === candidate ||
    model?.model === candidate ||
    model?.name === `${candidate}:latest` ||
    model?.model === `${candidate}:latest`
  );
}

export async function resolveChatModel(preferredModel) {
  if (preferredModel) {
    return preferredModel;
  }

  try {
    const models = await listModels();
    const completionModels = models.filter((model) =>
      model?.capabilities?.includes("completion"),
    );

    for (const candidate of CHAT_MODEL_CANDIDATES) {
      const matchingModel = completionModels.find((model) =>
        modelMatches(candidate, model),
      );
      if (matchingModel) {
        return matchingModel.name || matchingModel.model || candidate;
      }
    }

    const firstCompletionModel = completionModels[0];
    if (firstCompletionModel) {
      return (
        firstCompletionModel.name ||
        firstCompletionModel.model ||
        DEFAULT_CHAT_MODEL
      );
    }
  } catch {}

  return DEFAULT_CHAT_MODEL;
}

export async function resolveEmbedModel(preferredModel = DEFAULT_EMBED_MODEL) {
  if (preferredModel) {
    return preferredModel;
  }

  try {
    const models = await listModels();
    const matchingModel = models.find((model) =>
      modelMatches(DEFAULT_EMBED_MODEL, model),
    );
    if (matchingModel) {
      return matchingModel.name || matchingModel.model || DEFAULT_EMBED_MODEL;
    }
  } catch {}

  return DEFAULT_EMBED_MODEL;
}

export async function embedText(
  text,
  model = DEFAULT_EMBED_MODEL,
  keepAlive = DEFAULT_KEEP_ALIVE,
) {
  try {
    const data = await postJson("/api/embed", {
      model,
      input: text,
      keep_alive: keepAlive,
    });

    if (Array.isArray(data.embedding)) {
      return data.embedding;
    }

    if (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0])) {
      return data.embeddings[0];
    }
  } catch (primaryError) {
    const fallback = await postJson("/api/embeddings", {
      model,
      prompt: text,
      keep_alive: keepAlive,
    });

    if (Array.isArray(fallback.embedding)) {
      return fallback.embedding;
    }

    throw primaryError;
  }

  throw new Error("Ollama did not return an embedding");
}

export async function embedMany(
  texts,
  model = DEFAULT_EMBED_MODEL,
  keepAlive = DEFAULT_KEEP_ALIVE,
) {
  try {
    const data = await postJson("/api/embed", {
      model,
      input: texts,
      keep_alive: keepAlive,
    });

    if (Array.isArray(data.embeddings) && data.embeddings.length === texts.length) {
      return data.embeddings;
    }

    if (Array.isArray(data.embedding) && texts.length === 1) {
      return [data.embedding];
    }
  } catch {}

  const embeddings = [];
  for (const text of texts) {
    embeddings.push(await embedText(text, model, keepAlive));
  }

  return embeddings;
}

export async function generateText({
  prompt,
  system,
  model = DEFAULT_CHAT_MODEL,
  options = {},
  keepAlive = DEFAULT_KEEP_ALIVE,
}) {
  const data = await postJson("/api/generate", {
    model,
    prompt,
    system,
    stream: false,
    keep_alive: keepAlive,
    options,
  });

  return (data.response || "").trim();
}

export async function* generateTextStream({
  prompt,
  system,
  model = DEFAULT_CHAT_MODEL,
  options = {},
  keepAlive = DEFAULT_KEEP_ALIVE,
}) {
  const body = await postStream("/api/generate", {
    model,
    prompt,
    system,
    stream: true,
    keep_alive: keepAlive,
    options,
  });

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        yield JSON.parse(line);
      }

      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      const finalLine = buffer.trim();
      if (finalLine) {
        yield JSON.parse(finalLine);
      }
      break;
    }
  }
}

export async function warmModels({ chatModel, embedModel }) {
  await Promise.allSettled([
    generateText({
      model: chatModel,
      system: "Reply with exactly [HAPPY] Ready.",
      prompt: "Warm the model.",
      keepAlive: DEFAULT_KEEP_ALIVE,
      options: {
        num_predict: 8,
        temperature: 0,
      },
    }),
    embedText("warm", embedModel, DEFAULT_KEEP_ALIVE),
  ]);
}
