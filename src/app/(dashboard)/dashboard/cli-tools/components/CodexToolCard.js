"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Image from "next/image";

// Regex to validate combo names: letters, numbers, dash, underscore, dot only
const VALID_COMBO_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export default function CodexToolCard({
  tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders, cloudEnabled, initialStatus, modelRules, modelRecommendations,
}) {
  // ── core state ──────────────────────────────────────────────────────────
  const [codexStatus, setCodexStatus]             = useState(initialStatus || null);
  const [checkingCodex, setCheckingCodex]         = useState(false);
  const [applying, setApplying]                   = useState(false);
  const [switching, setSwitching]                 = useState(false);
  const [restoring, setRestoring]                 = useState(false);
  const [message, setMessage]                     = useState(null);
  const [showInstallGuide, setShowInstallGuide]   = useState(false);
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);

  // ── form state ──────────────────────────────────────────────────────────
  const [selectedApiKey, setSelectedApiKey]   = useState("");
  const [customBaseUrl, setCustomBaseUrl]     = useState("");
  // Multi-model list (replaces single selectedModel)
  const [modelList, setModelList]             = useState([]);   // string[]
  const [modelInput, setModelInput]           = useState("");   // new model input
  const [comboName, setComboName]             = useState("");   // combo name when >1 model
  // Subagent: still single-model
  const [subagentModel, setSubagentModel]     = useState("");
  // Live switch state (pick a saved combo or single model and hot-swap)
  const [combos, setCombos]                   = useState([]);   // all combos from /api/combos
  const [switchTarget, setSwitchTarget]       = useState("");   // model or combo name to switch to

  // ── modal state ─────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]                 = useState(false);  // model picker for list
  const [subagentModalOpen, setSubagentModalOpen] = useState(false);
  const [modelAliases, setModelAliases]           = useState({});

  // prevent double-init from codexStatus
  const hasInitializedModel = useRef(false);

  // ── effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (apiKeys?.length > 0 && !selectedApiKey) setSelectedApiKey(apiKeys[0].key);
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
    if (initialStatus) setCodexStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (!isExpanded) return;
    if (!codexStatus) checkCodexStatus();
    fetchModelAliases();
    fetchCombos();
  }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill model list & subagent from existing config
  useEffect(() => {
    if (!codexStatus?.config || hasInitializedModel.current) return;
    hasInitializedModel.current = true;

    const modelMatch = codexStatus.config.match(/^model\s*=\s*"([^"]+)"/m);
    if (modelMatch) {
      // model might be a combo name or a single model
      setModelList([modelMatch[1]]);
      setSwitchTarget(modelMatch[1]);
    }
    const subagentMatch = codexStatus.config.match(/\[agents\.subagent\][\s\S]*?model\s*=\s*"([^"]+)"/);
    if (subagentMatch) setSubagentModel(subagentMatch[1]);
  }, [codexStatus]);

  // ── fetch helpers ────────────────────────────────────────────────────────
  const fetchModelAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      if (res.ok) {
        const data = await res.json();
        setModelAliases(data.aliases || {});
      }
    } catch (err) {
      console.log("Error fetching model aliases:", err);
    }
  };

  const fetchCombos = async () => {
    try {
      const res = await fetch("/api/combos");
      if (res.ok) {
        const data = await res.json();
        setCombos(data.combos || []);
      }
    } catch (err) {
      console.log("Error fetching combos:", err);
    }
  };

  const checkCodexStatus = async () => {
    setCheckingCodex(true);
    try {
      const res = await fetch("/api/cli-tools/codex-settings");
      setCodexStatus(await res.json());
    } catch (err) {
      setCodexStatus({ installed: false, error: err.message });
    } finally {
      setCheckingCodex(false);
    }
  };

  // ── derived ─────────────────────────────────────────────────────────────
  const getConfigStatus = () => {
    if (!codexStatus?.installed) return null;
    if (!codexStatus.config) return "not_configured";
    const hasBase = codexStatus.config.includes(baseUrl)
      || codexStatus.config.includes("localhost")
      || codexStatus.config.includes("127.0.0.1");
    return hasBase ? "configured" : "other";
  };
  const configStatus = getConfigStatus();

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || `${baseUrl}/v1`;
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };
  const getDisplayUrl = () => customBaseUrl || `${baseUrl}/v1`;

  // Active model shown in header (from config)
  const activeModel = (() => {
    if (!codexStatus?.config) return null;
    const m = codexStatus.config.match(/^model\s*=\s*"([^"]+)"/m);
    return m ? m[1] : null;
  })();

  // Effective model name to write (combo or single)
  const effectiveModelName = modelList.length > 1
    ? (comboName.trim() || "codex-combo")
    : (modelList[0] || "");

  const isComboMode = modelList.length > 1;
  const comboNameValid = !isComboMode || VALID_COMBO_NAME_REGEX.test(effectiveModelName);

  // ── model list helpers ───────────────────────────────────────────────────
  const addModel = () => {
    const val = modelInput.trim();
    if (!val || modelList.includes(val)) return;
    setModelList((prev) => [...prev, val]);
    setModelInput("");
  };

  const removeModel = (id) => setModelList((prev) => prev.filter((m) => m !== id));

  const handleModelSelect = (model) => {
    if (!model.value || modelList.includes(model.value)) return;
    setModelList((prev) => [...prev, model.value]);
    setModalOpen(false);
  };

  // ── apply rule ───────────────────────────────────────────────────────────
  // Uses smart recommendations when available, else falls back to first model string.
  const handleApplyRule = (context) => {
    const rec = modelRecommendations?.[context];
    if (rec?.primary?.model) {
      setModelList([rec.primary.model]);
      const subagentModel = rec.subagent?.model || rec.primary.model;
      setSubagentModel(subagentModel);
      return;
    }
    // Legacy plain-string fallback
    const models = modelRules[context];
    if (models && models.length > 0) {
      setModelList([models[0]]);
      setSubagentModel(models[0]);
    }
  };

  // ── apply settings ───────────────────────────────────────────────────────
  const handleApplySettings = async () => {
    if (!comboNameValid) {
      setMessage({ type: "error", text: "Combo name can only contain letters, numbers, -, _ and ." });
      return;
    }
    setApplying(true);
    setMessage(null);
    try {
      const keyToUse = (selectedApiKey && selectedApiKey.trim())
        ? selectedApiKey
        : (!cloudEnabled ? "sk_9router" : selectedApiKey);

      const res = await fetch("/api/cli-tools/codex-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: getEffectiveBaseUrl(),
          apiKey: keyToUse,
          // send full list so server can auto-create/update combo when >1
          models: modelList,
          comboName: effectiveModelName,
          subagentModel: subagentModel || effectiveModelName,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Settings applied! Active model: ${effectiveModelName}` });
        setSwitchTarget(effectiveModelName);
        hasInitializedModel.current = false;
        checkCodexStatus();
        fetchCombos();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to apply settings" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setApplying(false);
    }
  };

  // ── fast switch ──────────────────────────────────────────────────────────
  const handleSwitchModel = async () => {
    if (!switchTarget) return;
    setSwitching(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/codex-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: switchTarget }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: `Switched to "${switchTarget}"` });
        hasInitializedModel.current = false;
        checkCodexStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to switch" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSwitching(false);
    }
  };

  // ── reset ────────────────────────────────────────────────────────────────
  const handleResetSettings = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/codex-settings", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Settings reset successfully!" });
        setModelList([]);
        setSubagentModel("");
        setComboName("");
        setSwitchTarget("");
        hasInitializedModel.current = false;
        checkCodexStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to reset settings" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setRestoring(false);
    }
  };

  // ── manual config ────────────────────────────────────────────────────────
  const getManualConfigs = () => {
    const keyToUse = (selectedApiKey && selectedApiKey.trim())
      ? selectedApiKey
      : (!cloudEnabled ? "sk_9router" : "<API_KEY_FROM_DASHBOARD>");

    const effectiveSubagentModel = subagentModel || effectiveModelName;

    // Show combo info comment when multiple models configured
    const comboComment = isComboMode
      ? `# Combo "${effectiveModelName}" routes across: ${modelList.join(", ")}\n# Manage combo at: ${baseUrl}/dashboard/combos\n`
      : "";

    const configContent = `# 9Router Configuration for Codex CLI\n${comboComment}model = "${effectiveModelName}"\nmodel_provider = "9router"\n\n[model_providers.9router]\nname = "9Router"\nbase_url = "${getEffectiveBaseUrl()}"\nwire_api = "responses"\n\n[agents.subagent]\nmodel = "${effectiveSubagentModel}"\n`;

    const authContent = JSON.stringify({ OPENAI_API_KEY: keyToUse }, null, 2);

    return [
      { filename: "~/.codex/config.toml", content: configContent },
      { filename: "~/.codex/auth.json",   content: authContent },
    ];
  };

  // ── render ───────────────────────────────────────────────────────────────
  // Build switch options: all combos + all active model aliases
  const switchOptions = [
    ...combos.map((c) => ({ value: c.name, label: `${c.name} (combo ×${c.models?.length ?? 0})` })),
  ];
  if (activeModel && !switchOptions.find((o) => o.value === activeModel)) {
    switchOptions.unshift({ value: activeModel, label: `${activeModel} (current)` });
  }

  return (
    <Card padding="xs" className="overflow-hidden">
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <Image src="/providers/codex.png" alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-lg" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">{tool.name}</h3>
              {configStatus === "configured" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 rounded-full">Connected</span>}
              {configStatus === "not_configured" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-full">Not configured</span>}
              {configStatus === "other" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">Other</span>}
              {activeModel && configStatus === "configured" && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-primary/10 text-primary rounded-full truncate max-w-[120px]" title={activeModel}>
                  {activeModel}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted truncate">{tool.description}</p>
          </div>
        </div>
        <span className={`material-symbols-outlined text-text-muted text-[20px] transition-transform ${isExpanded ? "rotate-180" : ""}`}>expand_more</span>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
          {checkingCodex && (
            <div className="flex items-center gap-2 text-text-muted">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span>Checking Codex CLI...</span>
            </div>
          )}

          {/* Not installed */}
          {!checkingCodex && codexStatus && !codexStatus.installed && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-yellow-500">warning</span>
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">Codex CLI not detected locally</p>
                    <p className="text-sm text-text-muted">Manual configuration is still available if 9router is deployed on a remote server.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-9">
                  <Button variant="secondary" size="sm" onClick={() => setShowManualConfigModal(true)} className="!bg-yellow-500/20 !border-yellow-500/40 !text-yellow-700 dark:!text-yellow-300 hover:!bg-yellow-500/30">
                    <span className="material-symbols-outlined text-[18px] mr-1">content_copy</span>Manual Config
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowInstallGuide(!showInstallGuide)}>
                    <span className="material-symbols-outlined text-[18px] mr-1">{showInstallGuide ? "expand_less" : "help"}</span>
                    {showInstallGuide ? "Hide" : "How to Install"}
                  </Button>
                </div>
              </div>
              {showInstallGuide && (
                <div className="p-4 bg-surface border border-border rounded-lg">
                  <h4 className="font-medium mb-3">Installation Guide</h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-text-muted mb-1">macOS / Linux / Windows:</p>
                      <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">npm install -g @openai/codex</code>
                    </div>
                    <p className="text-text-muted">After installation, run <code className="px-1 bg-black/5 dark:bg-white/5 rounded">codex</code> to verify.</p>
                    <div className="pt-2 border-t border-border">
                      <p className="text-text-muted text-xs">
                        Codex uses <code className="px-1 bg-black/5 dark:bg-white/5 rounded">~/.codex/auth.json</code> with <code className="px-1 bg-black/5 dark:bg-white/5 rounded">OPENAI_API_KEY</code>.
                        Click &quot;Apply&quot; to auto-configure.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Installed */}
          {!checkingCodex && codexStatus?.installed && (
            <>
              <div className="flex flex-col gap-2">
                {/* Current Base URL */}
                {codexStatus?.config && (() => {
                  const parsed = codexStatus.config.match(/base_url\s*=\s*"([^"]+)"/);
                  const currentBaseUrl = parsed ? parsed[1] : null;
                  return currentBaseUrl ? (
                    <div className="flex items-center gap-2">
                      <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Current</span>
                      <span className="material-symbols-outlined text-text-muted text-[14px]">arrow_forward</span>
                      <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">{currentBaseUrl}</span>
                    </div>
                  ) : null;
                })()}

                {/* Base URL */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Base URL</span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">arrow_forward</span>
                  <input
                    type="text"
                    value={getDisplayUrl()}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder="https://.../v1"
                    className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {customBaseUrl && customBaseUrl !== `${baseUrl}/v1` && (
                    <button onClick={() => setCustomBaseUrl("")} className="p-1 text-text-muted hover:text-primary rounded transition-colors" title="Reset to default">
                      <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                    </button>
                  )}
                </div>

                {/* API Key */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">API Key</span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">arrow_forward</span>
                  {apiKeys.length > 0 ? (
                    <select value={selectedApiKey} onChange={(e) => setSelectedApiKey(e.target.value)} className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50">
                      {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-text-muted px-2 py-1.5">
                      {cloudEnabled ? "No API keys - Create one in Keys page" : "sk_9router (default)"}
                    </span>
                  )}
                </div>

                {/* ── Models (multi-select) ─────────────────────────────── */}
                <div className="flex gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right pt-2">
                    Models {modelList.length > 0 && <span className="text-primary">({modelList.length})</span>}
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px] pt-2">arrow_forward</span>
                  <div className="flex-1 flex flex-col gap-1">
                    {/* Model tag list */}
                    {modelList.length > 0 && (
                      <div className="flex flex-col gap-0.5 mb-1">
                        {modelList.map((id) => (
                          <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-bg-secondary rounded border border-border">
                            <span className="flex-1 text-xs font-mono truncate">{id}</span>
                            <button onClick={() => removeModel(id)} className="text-text-muted hover:text-red-500 transition-colors shrink-0" title="Remove">
                              <span className="material-symbols-outlined text-[12px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Input row */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={modelInput}
                        onChange={(e) => setModelInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModel(); } }}
                        placeholder="provider/model-id"
                        className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      {/* Apply Rule dropdown */}
                      {modelRules && Object.keys(modelRules).length > 0 && (
                        <div className="relative group shrink-0">
                          <button className="px-2 py-1.5 rounded border border-border bg-surface text-text-main hover:border-primary transition-colors text-xs flex items-center gap-1 cursor-pointer">
                            <span className="material-symbols-outlined text-[14px]">magic_button</span>
                          </button>
                          <div className="absolute top-full mt-1 right-0 w-64 bg-surface border border-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 py-1">
                            <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Smart Tasks</div>
                            {(modelRecommendations && Object.keys(modelRecommendations).length > 0
                              ? Object.entries(modelRecommendations)
                              : Object.entries(modelRules).map(([ctx, arr]) => ([ctx, { primary: { model: arr[0] } }]))
                            ).map(([context, rec]) => (
                              <button
                                key={context}
                                onClick={() => handleApplyRule(context)}
                                className="w-full text-left px-3 py-2 text-xs text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-l-2 border-transparent hover:border-primary"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold capitalize">{context}</span>
                                  {rec?.primary?.tier && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold ${
                                      rec.primary.tier === "ultra-save" ? "bg-green-500/20 text-green-600" :
                                      rec.primary.tier === "max" ? "bg-purple-500/20 text-purple-600" :
                                      "bg-blue-500/20 text-blue-600"
                                    }`}>
                                      {rec.primary.tier}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-text-muted mt-1 font-mono break-all">{rec?.primary?.model || "No model"}</div>
                                {rec?.primary?.reason && <div className="text-[9px] text-text-muted/70 mt-0.5 italic">{rec.primary.reason}</div>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => setModalOpen(true)}
                        disabled={!activeProviders?.length}
                        className={`px-2 py-1.5 rounded border text-xs shrink-0 ${activeProviders?.length ? "bg-surface border-border hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                      >
                        Select
                      </button>
                      <button
                        onClick={addModel}
                        disabled={!modelInput.trim()}
                        className="px-2 py-1.5 rounded border bg-surface border-border hover:border-primary text-xs shrink-0 disabled:opacity-50"
                        title="Add model"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                      </button>
                    </div>
                    {/* Combo name field — shown only when ≥2 models */}
                    {isComboMode && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-text-muted shrink-0">Combo name:</span>
                        <input
                          type="text"
                          value={comboName}
                          onChange={(e) => setComboName(e.target.value)}
                          placeholder="codex-combo"
                          className={`flex-1 px-2 py-1 bg-surface rounded border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono ${
                            comboName && !VALID_COMBO_NAME_REGEX.test(comboName) ? "border-red-400" : "border-border"
                          }`}
                        />
                        <span className="text-[10px] text-text-muted">(auto-created)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subagent Model */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Subagent Model</span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">arrow_forward</span>
                  <input
                    type="text"
                    value={subagentModel}
                    onChange={(e) => setSubagentModel(e.target.value)}
                    placeholder={effectiveModelName || "provider/model-id (defaults to main model)"}
                    className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button
                    onClick={() => setSubagentModalOpen(true)}
                    disabled={!activeProviders?.length}
                    className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                  >
                    Select Model
                  </button>
                  {subagentModel && (
                    <button onClick={() => setSubagentModel("")} className="p-1 text-text-muted hover:text-red-500 rounded transition-colors" title="Clear">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>

                {/* ── Quick Model Switch ────────────────────────────────── */}
                {(combos.length > 0 || activeModel) && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Quick Switch</span>
                    <span className="material-symbols-outlined text-text-muted text-[14px]">arrow_forward</span>
                    <select
                      value={switchTarget}
                      onChange={(e) => setSwitchTarget(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      <option value="">— select model or combo —</option>
                      {switchOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={switchTarget}
                      onChange={(e) => setSwitchTarget(e.target.value)}
                      placeholder="or type model id"
                      className="w-28 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSwitchModel}
                      disabled={!switchTarget || switching}
                      loading={switching}
                    >
                      <span className="material-symbols-outlined text-[14px] mr-1">swap_horiz</span>Switch
                    </Button>
                  </div>
                )}
              </div>

              {message && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                  message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                }`}>
                  <span className="material-symbols-outlined text-[14px]">{message.type === "success" ? "check_circle" : "error"}</span>
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApplySettings}
                  disabled={(!selectedApiKey && cloudEnabled && apiKeys.length > 0) || modelList.length === 0 || !comboNameValid}
                  loading={applying}
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">save</span>Apply
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={restoring} loading={restoring}>
                  <span className="material-symbols-outlined text-[14px] mr-1">restore</span>Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)}>
                  <span className="material-symbols-outlined text-[14px] mr-1">content_copy</span>Manual Config
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Model picker for list */}
      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModelSelect}
        selectedModel={null}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Add Model to Codex"
      />

      {/* Subagent model picker */}
      <ModelSelectModal
        isOpen={subagentModalOpen}
        onClose={() => setSubagentModalOpen(false)}
        onSelect={(model) => { setSubagentModel(model.value); setSubagentModalOpen(false); }}
        selectedModel={subagentModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Subagent Model for Codex"
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="Codex CLI - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
