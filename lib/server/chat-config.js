function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export const CHAT_REPLY_TARGET_SENTENCES = parsePositiveInteger(
  process.env.IRIPPLE_REPLY_TARGET_SENTENCES,
  3,
);
export const CHAT_REPLY_MAX_SENTENCES = parsePositiveInteger(
  process.env.IRIPPLE_REPLY_MAX_SENTENCES,
  5,
);
export const CHAT_REPLY_SHORT_LEAD_SENTENCES = parsePositiveInteger(
  process.env.IRIPPLE_REPLY_SHORT_LEAD_SENTENCES,
  2,
);
export const CHAT_RAG_MAX_TOKENS = parsePositiveInteger(
  process.env.IRIPPLE_CHAT_RAG_MAX_TOKENS,
  140,
);
export const CHAT_RAW_MAX_TOKENS = parsePositiveInteger(
  process.env.IRIPPLE_CHAT_RAW_MAX_TOKENS,
  160,
);
