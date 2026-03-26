import { useState, useCallback } from "react";

export type AIProvider = "cloud" | "local";
export type CloudProvider = "openai" | "google" | "anthropic";

export interface CloudApiKeys {
  openai: string;
  google: string;
  anthropic: string;
}

export interface ExtractionSettings {
  provider: AIProvider;
  cloudProvider: CloudProvider;
  cloudModel: string;
  apiKeys: CloudApiKeys;
  ollamaUrl: string;
  ollamaModel: string;
}

const STORAGE_KEY = "extraction-settings";

const DEFAULTS: ExtractionSettings = {
  provider: "local",
  cloudProvider: "google",
  cloudModel: "gemini-2.0-flash",
  apiKeys: {
    openai: "",
    google: "",
    anthropic: "",
  },
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5vl:7b",
};

function load(): ExtractionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    // Merge with defaults to handle missing keys from old storage format
    return {
      ...DEFAULTS,
      ...parsed,
      apiKeys: { ...DEFAULTS.apiKeys, ...parsed.apiKeys },
    };
  } catch {
    return DEFAULTS;
  }
}

export const CLOUD_PROVIDERS: { value: CloudProvider; label: string; description: string }[] = [
  { value: "google", label: "Google AI", description: "Gemini models" },
  { value: "openai", label: "OpenAI", description: "GPT-4 Vision" },
  { value: "anthropic", label: "Anthropic", description: "Claude models" },
];

export const CLOUD_MODELS: Record<CloudProvider, { value: string; label: string }[]> = {
  google: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
};

export const LOCAL_MODELS = [
  { value: "qwen2.5vl:7b", label: "Qwen2.5-VL 7B" },
  { value: "gemma3:4b", label: "Gemma 3 4B" },
  { value: "llava:13b", label: "LLaVA 13B" },
  { value: "minicpm-v:8b", label: "MiniCPM-V 8B" },
];

export function useExtractionSettings() {
  const [settings, setSettingsState] = useState<ExtractionSettings>(load);

  const updateSettings = useCallback((patch: Partial<ExtractionSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      // If changing cloud provider, reset to first model of that provider
      if (patch.cloudProvider && patch.cloudProvider !== prev.cloudProvider) {
        next.cloudModel = CLOUD_MODELS[patch.cloudProvider][0].value;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateApiKey = useCallback((provider: CloudProvider, key: string) => {
    setSettingsState((prev) => {
      const next = {
        ...prev,
        apiKeys: { ...prev.apiKeys, [provider]: key },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings, updateApiKey };
}
