import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useExtractionSettings,
  CLOUD_PROVIDERS,
  CLOUD_MODELS,
  LOCAL_MODELS,
  type AIProvider,
  type CloudProvider,
} from "@/hooks/useExtractionSettings";
import { useOllamaStatus } from "@/hooks/useOllamaStatus";
import {
  Cloud,
  Server,
  CheckCircle,
  XCircle,
  Loader2,
  Cpu,
  HardDrive,
  Power,
  PowerOff,
  Monitor,
  CircleDot,
  Zap,
  Key,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export default function Settings() {
  const { settings, updateSettings, updateApiKey } = useExtractionSettings();
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [customModel, setCustomModel] = useState("");
  const [showApiKey, setShowApiKey] = useState<Record<CloudProvider, boolean>>({
    openai: false,
    google: false,
    anthropic: false,
  });

  const ollama = useOllamaStatus(settings.ollamaUrl, settings.provider === "local");

  const testOllamaConnection = async () => {
    setTestStatus("testing");
    try {
      const res = await fetch(`${settings.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error("Not OK");
      const data = await res.json();
      setTestStatus("ok");
      toast.success(`Connected — ${data.models?.length ?? 0} models available`);
    } catch {
      setTestStatus("fail");
      toast.error("Cannot reach Ollama. Is it running?");
    }
  };

  const handleUseCustomModel = () => {
    if (customModel.trim()) {
      updateSettings({ ollamaModel: customModel.trim() });
      setCustomModel("");
      toast.success(`Model set to ${customModel.trim()}`);
    }
  };

  const handleLoadModel = async (name: string) => {
    try {
      await ollama.loadModel(name);
      updateSettings({ ollamaModel: name });
      toast.success(`${name} loaded on GPU`);
    } catch {
      toast.error(`Failed to load ${name}`);
    }
  };

  const handleUnloadModel = async (name: string) => {
    try {
      await ollama.unloadModel(name);
      toast.success(`${name} unloaded from GPU`);
    } catch {
      toast.error(`Failed to unload ${name}`);
    }
  };

  const isModelLoaded = (name: string) =>
    ollama.loadedModels.some((m) => m.name === name);

  const toggleShowApiKey = (provider: CloudProvider) => {
    setShowApiKey((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const currentCloudModels = CLOUD_MODELS[settings.cloudProvider] || [];
  const currentApiKey = settings.apiKeys[settings.cloudProvider] || "";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Extraction Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure the AI provider used for trip extraction from screenshots
          </p>
        </div>

        {/* Provider Toggle */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card border border-border rounded-xl p-5 space-y-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <h3 className="font-semibold text-sm">AI Provider</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: "local" as AIProvider, icon: Server, title: "Local Ollama", desc: "Self-hosted models (recommended)" },
                { key: "cloud" as AIProvider, icon: Cloud, title: "Cloud AI", desc: "OpenAI, Google, Anthropic" },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => updateSettings({ provider: opt.key })}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                    settings.provider === opt.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <opt.icon className={`h-5 w-5 flex-shrink-0 ${settings.provider === opt.key ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <div className="font-medium text-sm">{opt.title}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Cloud Settings */}
        {settings.provider === "cloud" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Cloud Provider Selection */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <h3 className="font-semibold text-sm">Cloud Provider</h3>
              <div className="grid grid-cols-3 gap-2">
                {CLOUD_PROVIDERS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => updateSettings({ cloudProvider: p.value })}
                    className={`p-3 rounded-lg border-2 transition-all text-center ${
                      settings.cloudProvider === p.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="font-medium text-sm">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key Configuration */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">API Key</h3>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey[settings.cloudProvider] ? "text" : "password"}
                      value={currentApiKey}
                      onChange={(e) => updateApiKey(settings.cloudProvider, e.target.value)}
                      placeholder={`Enter your ${CLOUD_PROVIDERS.find(p => p.value === settings.cloudProvider)?.label} API key`}
                      className="font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowApiKey(settings.cloudProvider)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey[settings.cloudProvider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {settings.cloudProvider === "google" && (
                    <>Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a></>
                  )}
                  {settings.cloudProvider === "openai" && (
                    <>Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenAI Platform</a></>
                  )}
                  {settings.cloudProvider === "anthropic" && (
                    <>Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Anthropic Console</a></>
                  )}
                </p>
                {!currentApiKey && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs">API key required for cloud extraction</span>
                  </div>
                )}
                {currentApiKey && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs">API key configured</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cloud Model Selection */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <h3 className="font-semibold text-sm">Model</h3>
              <Select value={settings.cloudModel} onValueChange={(v) => updateSettings({ cloudModel: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentCloudModels.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.cloudProvider === "google" && "Gemini 2.0 Flash recommended for best speed/accuracy balance."}
                {settings.cloudProvider === "openai" && "GPT-4o recommended for best vision capabilities."}
                {settings.cloudProvider === "anthropic" && "Claude Sonnet 4 recommended for best OCR accuracy."}
              </p>
            </div>
          </motion.div>
        )}

        {/* Local Ollama Settings */}
        {settings.provider === "local" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Endpoint */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <h3 className="font-semibold text-sm">Ollama Endpoint</h3>
              <div className="flex gap-2">
                <Input
                  value={settings.ollamaUrl}
                  onChange={(e) => updateSettings({ ollamaUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="font-mono text-sm"
                />
                <Button variant="outline" onClick={testOllamaConnection} disabled={testStatus === "testing"}>
                  {testStatus === "testing" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {testStatus === "ok" && <CheckCircle className="h-4 w-4 mr-1 text-success" />}
                  {testStatus === "fail" && <XCircle className="h-4 w-4 mr-1 text-destructive" />}
                  Test
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CircleDot className={`h-3 w-3 ${ollama.connected ? "text-green-500" : "text-red-500"}`} />
                <span className={ollama.connected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                  {ollama.connected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>

            {/* GPU Monitor */}
            <AnimatePresence>
              {ollama.connected && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                  <div className="bg-card border border-border rounded-xl p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">GPU Monitor</h3>
                    </div>

                    {ollama.gpu ? (
                      <div className="space-y-3">
                        {/* VRAM Bar */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Cpu className="h-3 w-3" /> VRAM Usage
                            </span>
                            <span className="font-mono font-medium">
                              {formatBytes(ollama.gpu.vramUsed)} / {formatBytes(ollama.gpu.vramTotal)}
                            </span>
                          </div>
                          <Progress value={ollama.gpu.gpuOffloadPercent} className="h-3" />
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-muted/50 rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-primary">{ollama.gpu.gpuOffloadPercent}%</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">GPU Offload</div>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-green-500">{formatBytes(ollama.gpu.vramUsed)}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">VRAM Used</div>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3 text-center">
                            <div className="text-lg font-bold">{ollama.loadedModels.length}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Loaded</div>
                          </div>
                        </div>

                        {/* Loaded Model Info */}
                        {ollama.loadedModels.map((m) => (
                          <div key={m.name} className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Zap className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-sm font-mono font-medium">{m.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatBytes(m.size_vram)} on GPU
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-4 text-muted-foreground">
                        <HardDrive className="h-8 w-8 mb-2 opacity-40" />
                        <p className="text-sm">No models loaded</p>
                        <p className="text-xs">Load a model below to see GPU stats</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Model Management */}
            <AnimatePresence>
              {ollama.connected && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                  <div className="bg-card border border-border rounded-xl p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Installed Models</h3>
                      <span className="text-xs text-muted-foreground ml-auto">{ollama.models.length} models</span>
                    </div>

                    {ollama.models.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No models installed. Run <code className="bg-muted px-1 rounded">ollama pull qwen2.5vl:7b</code>
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {ollama.models.map((model) => {
                          const loaded = isModelLoaded(model.name);
                          const isLoading = ollama.loading === model.name;
                          const isUnloading = ollama.unloading === model.name;
                          const isActive = settings.ollamaModel === model.name;
                          const isBusy = !!ollama.loading || !!ollama.unloading;

                          return (
                            <div
                              key={model.name}
                              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                loaded
                                  ? "border-green-500/30 bg-green-500/5"
                                  : "border-border"
                              }`}
                            >
                              {/* Status indicator */}
                              <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                                loaded ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-muted-foreground/30"
                              }`} />

                              {/* Model info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-medium truncate">{model.name}</span>
                                  {isActive && (
                                    <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                                      active
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-3 text-[11px] text-muted-foreground mt-0.5">
                                  <span>{model.parameter_size}</span>
                                  <span>{model.quantization_level}</span>
                                  <span>{formatBytes(model.size)}</span>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {!loaded && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs gap-1.5"
                                    onClick={() => handleLoadModel(model.name)}
                                    disabled={isBusy}
                                  >
                                    {isLoading ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Power className="h-3.5 w-3.5" />
                                    )}
                                    {isLoading ? "Loading..." : "Load"}
                                  </Button>
                                )}
                                {loaded && (
                                  <>
                                    {!isActive && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => {
                                          updateSettings({ ollamaModel: model.name });
                                          toast.success(`Active model set to ${model.name}`);
                                        }}
                                      >
                                        Use
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-3 text-xs gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                      onClick={() => handleUnloadModel(model.name)}
                                      disabled={isBusy}
                                    >
                                      {isUnloading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <PowerOff className="h-3.5 w-3.5" />
                                      )}
                                      {isUnloading ? "Unloading..." : "Unload"}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Custom model input */}
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">Or type a custom model name:</p>
                      <div className="flex gap-2">
                        <Input
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          placeholder="e.g. qwen2.5vl:7b"
                          className="font-mono text-sm"
                          onKeyDown={(e) => e.key === "Enter" && handleUseCustomModel()}
                        />
                        <Button variant="outline" onClick={handleUseCustomModel} disabled={!customModel.trim()}>
                          Use
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Model selector fallback when disconnected */}
            {!ollama.connected && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
                <h3 className="font-semibold text-sm">Local Model</h3>
                <Select value={settings.ollamaModel} onValueChange={(v) => updateSettings({ ollamaModel: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCAL_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Connect to Ollama to see installed models and GPU stats.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
