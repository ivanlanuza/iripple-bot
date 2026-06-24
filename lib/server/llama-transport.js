import { REQUEST_TIMEOUT_MS } from "@/lib/server/llama-config";

function buildMessages(system, prompt) {
  const messages = [];

  if (system) {
    messages.push({
      role: "system",
      content: system,
    });
  }

  messages.push({
    role: "user",
    content: prompt,
  });

  return messages;
}

export function buildChatCompletionPayload({
  model,
  system,
  prompt,
  stream,
  options = {},
}) {
  const payload = {
    model,
    messages: buildMessages(system, prompt),
    temperature: options.temperature,
    max_tokens: options.num_predict,
    stream,
  };

  if (options.top_p !== undefined) {
    payload.top_p = options.top_p;
  }

  if (options.repeat_penalty !== undefined) {
    payload.repeat_penalty = options.repeat_penalty;
  }

  if (options.presence_penalty !== undefined) {
    payload.presence_penalty = options.presence_penalty;
  }

  if (options.frequency_penalty !== undefined) {
    payload.frequency_penalty = options.frequency_penalty;
  }

  if (options.cache_prompt !== undefined) {
    payload.cache_prompt = options.cache_prompt;
  }

  if (options.id_slot !== undefined) {
    payload.id_slot = options.id_slot;
  }

  return payload;
}

async function fetchJson(baseUrl, endpoint, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: "Bearer no-key",
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `llama.cpp request failed for ${endpoint}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function postJson(baseUrl, endpoint, payload, timeoutMs) {
  return fetchJson(
    baseUrl,
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
}

export async function postStream(
  baseUrl,
  endpoint,
  payload,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer no-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `llama.cpp request failed for ${endpoint}`);
    }

    if (!response.body) {
      throw new Error(`llama.cpp did not return a stream for ${endpoint}`);
    }

    return {
      body: response.body,
      cancel: () => controller.abort(),
      clear: () => clearTimeout(timeoutId),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function getTextFromMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

export function getChatCompletionText(data) {
  return (
    getTextFromMessageContent(data?.choices?.[0]?.message?.content) ||
    getTextFromMessageContent(data?.choices?.[0]?.text) ||
    ""
  ).trim();
}

export function getEmbeddingVectors(data) {
  if (Array.isArray(data?.data)) {
    return data.data
      .map((item) => item?.embedding)
      .filter((embedding) => Array.isArray(embedding));
  }

  if (Array.isArray(data?.embedding)) {
    return [data.embedding];
  }

  if (Array.isArray(data) && Array.isArray(data[0]?.embedding)) {
    return data.map((item) => item.embedding);
  }

  return [];
}

async function* iterateSseBody(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder
      .decode(value || new Uint8Array(), { stream: !done })
      .replace(/\r\n/g, "\n");

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf("\n\n");

      const dataLines = rawEvent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      for (const dataLine of dataLines) {
        if (!dataLine) {
          continue;
        }

        if (dataLine === "[DONE]") {
          return;
        }

        yield JSON.parse(dataLine);
      }
    }

    if (done) {
      break;
    }
  }
}

export async function* iterateTextStream(body) {
  for await (const chunk of iterateSseBody(body)) {
    const delta = chunk?.choices?.[0]?.delta?.content;
    const text = getTextFromMessageContent(delta);

    if (text) {
      yield {
        response: text,
        done: false,
      };
    }

    if (chunk?.choices?.[0]?.finish_reason) {
      yield { done: true };
      return;
    }
  }

  yield { done: true };
}
