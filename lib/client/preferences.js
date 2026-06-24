import { useSyncExternalStore } from "react";

import {
  KNOWLEDGE_MODE_RAG,
  normalizeKnowledgeMode,
} from "@/lib/knowledge-mode";

const DEFAULT_FACE_STYLE = "pixelized";
const DEFAULT_KNOWLEDGE_MODE = KNOWLEDGE_MODE_RAG;
export const FACE_STYLE_STORAGE_KEY = "iripple:face-style";
export const FILLER_SPEECH_STORAGE_KEY = "iripple:use-filler-speech";
export const KNOWLEDGE_MODE_STORAGE_KEY = "iripple:knowledge-mode";
const PREFERENCES_EVENT = "iripple:preferences-changed";
const DEFAULT_PREFERENCES_SNAPSHOT = `${DEFAULT_FACE_STYLE}|0|${DEFAULT_KNOWLEDGE_MODE}`;

function getStoredPreferencesSnapshot() {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES_SNAPSHOT;
  }

  const savedFaceStyle = window.localStorage.getItem(FACE_STYLE_STORAGE_KEY);
  const faceStyle = savedFaceStyle === "rounded" ? "rounded" : DEFAULT_FACE_STYLE;
  const useFillerSpeech =
    window.localStorage.getItem(FILLER_SPEECH_STORAGE_KEY) === "1";
  const knowledgeMode = normalizeKnowledgeMode(
    window.localStorage.getItem(KNOWLEDGE_MODE_STORAGE_KEY),
  );

  return `${faceStyle}|${useFillerSpeech ? "1" : "0"}|${knowledgeMode}`;
}

function subscribeToPreferences(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event) => {
    if (
      !event.key ||
      event.key === FACE_STYLE_STORAGE_KEY ||
      event.key === FILLER_SPEECH_STORAGE_KEY ||
      event.key === KNOWLEDGE_MODE_STORAGE_KEY
    ) {
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(PREFERENCES_EVENT, callback);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(PREFERENCES_EVENT, callback);
  };
}

export function useStoredPreferences() {
  const snapshot = useSyncExternalStore(
    subscribeToPreferences,
    getStoredPreferencesSnapshot,
    () => DEFAULT_PREFERENCES_SNAPSHOT,
  );

  const [faceStyleToken, useFillerSpeechToken, knowledgeModeToken] =
    snapshot.split("|");

  return {
    faceStyle: faceStyleToken === "rounded" ? "rounded" : DEFAULT_FACE_STYLE,
    useFillerSpeech: useFillerSpeechToken === "1",
    knowledgeMode: normalizeKnowledgeMode(knowledgeModeToken),
  };
}

export function updateStoredPreference(key, value) {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}
