import { useState, useEffect, useCallback, useRef } from "react";

export interface OllamaModel {
  name: string;
  size: number; // bytes on disk
  parameter_size: string;
  quantization_level: string;
  family: string;
}

export interface LoadedModel {
  name: string;
  size: number; // total model size in bytes
  size_vram: number; // bytes loaded into VRAM
  expires_at: string;
}

export interface GpuStats {
  vramUsed: number; // bytes in VRAM by loaded models
  vramTotal: number; // estimated total from loaded model size
  gpuOffloadPercent: number; // % of model on GPU
}

export interface OllamaStatus {
  connected: boolean;
  models: OllamaModel[];
  loadedModels: LoadedModel[];
  gpu: GpuStats | null;
  loading: string | null; // model name currently being loaded
  unloading: string | null; // model name currently being unloaded
  loadModel: (name: string) => Promise<void>;
  unloadModel: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL = 2000;
// ~60% GPU offload: 4 transformer layers + vision encoder on GPU, rest on CPU
const TARGET_NUM_GPU = 4;

export function useOllamaStatus(ollamaUrl: string, enabled: boolean): OllamaStatus {
  const [connected, setConnected] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadedModels, setLoadedModels] = useState<LoadedModel[]>([]);
  const [gpu, setGpu] = useState<GpuStats | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [unloading, setUnloading] = useState<string | null>(null);
  const baseUrl = ollamaUrl.replace(/\/$/, "");
  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!enabled) return;
    try {
      const [tagsRes, psRes] = await Promise.all([
        fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) }),
        fetch(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(3000) }),
      ]);

      if (!tagsRes.ok || !psRes.ok) {
        setConnected(false);
        return;
      }

      const tagsData = await tagsRes.json();
      const psData = await psRes.json();

      setConnected(true);

      const installedModels: OllamaModel[] = (tagsData.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
        parameter_size: m.details?.parameter_size || "unknown",
        quantization_level: m.details?.quantization_level || "unknown",
        family: m.details?.family || "unknown",
      }));
      setModels(installedModels);

      const running: LoadedModel[] = (psData.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
        size_vram: m.size_vram,
        expires_at: m.expires_at,
      }));
      setLoadedModels(running);

      if (running.length > 0) {
        const totalSize = running.reduce((a, m) => a + m.size, 0);
        const totalVram = running.reduce((a, m) => a + m.size_vram, 0);
        setGpu({
          vramUsed: totalVram,
          vramTotal: totalSize,
          gpuOffloadPercent: totalSize > 0 ? Math.round((totalVram / totalSize) * 100) : 0,
        });
      } else {
        setGpu(null);
      }
    } catch {
      setConnected(false);
    }
  }, [baseUrl, enabled]);

  const loadModel = useCallback(async (name: string) => {
    setLoading(name);
    try {
      // First unload any currently loaded model
      const psRes = await fetch(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(3000) });
      if (psRes.ok) {
        const psData = await psRes.json();
        for (const m of psData.models || []) {
          if (m.name !== name) {
            await fetch(`${baseUrl}/api/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: m.name, keep_alive: 0 }),
            });
          }
        }
      }

      // Load the requested model with ~60% GPU layers
      abortRef.current = new AbortController();
      await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: name,
          prompt: "hi",
          stream: false,
          options: { num_gpu: TARGET_NUM_GPU },
        }),
        signal: abortRef.current.signal,
      });

      await fetchStatus();
    } finally {
      setLoading(null);
      abortRef.current = null;
    }
  }, [baseUrl, fetchStatus]);

  const unloadModel = useCallback(async (name: string) => {
    setUnloading(name);
    try {
      await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, keep_alive: 0 }),
      });
      await fetchStatus();
    } finally {
      setUnloading(null);
    }
  }, [baseUrl, fetchStatus]);

  // Polling
  useEffect(() => {
    if (!enabled) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStatus, enabled]);

  return {
    connected,
    models,
    loadedModels,
    gpu,
    loading,
    unloading,
    loadModel,
    unloadModel,
    refresh: fetchStatus,
  };
}
