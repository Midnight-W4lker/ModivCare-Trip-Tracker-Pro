import { useState, useCallback } from "react";

export type AIProvider = "cloud" | "local";

export interface ExtractionSettings {
  provider: AIProvider;
  cloudModel: string;
  ollamaUrl: string;
  ollamaModel: string;
}

const STORAGE_KEY = "extraction-settings";

const DEFAULTS: ExtractionSettings = {
  provider: "local",
  cloudModel: "google/gemini-2.5-flash",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5vl:7b",
};

function load(): ExtractionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export const CLOUD_MODELS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5", label: "GPT-5" },
];

export const LOCAL_MODELS = [
  { value: "qwen2.5vl:7b", label: "Qwen2.5-VL 7B" },
  { value: "pixtral:12b", label: "Pixtral 12B" },
  { value: "llava:13b", label: "LLaVA 13B" },
  { value: "minicpm-v:8b", label: "MiniCPM-V 8B" },
];

export function useExtractionSettings() {
  const [settings, setSettingsState] = useState<ExtractionSettings>(load);

  const updateSettings = useCallback((patch: Partial<ExtractionSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
