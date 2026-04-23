"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/shared/components";

export default function ModelRulesCard() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState("");
  const [parsed, setParsed] = useState({});
  const [recommendations, setRecommendations] = useState({});
  const [message, setMessage] = useState(null);

  const loadRules = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/model-rules");
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to load model rules" });
        return;
      }
      setContent(data.content || "");
      setParsed(data.parsed || {});
      setRecommendations(data.recommendations || {});
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to load model rules" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/model-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save model rules" });
        return;
      }
      setParsed(data.parsed || {});
      setRecommendations(data.recommendations || {});
      setMessage({ type: "success", text: "Model rules saved" });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to save model rules" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4" padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-main">Model Rules (Markdown)</h3>
          <p className="text-xs text-text-muted mt-1">
            Define use-case contexts and ordered model sets in one markdown source of truth for CLI tooling.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={loadRules} disabled={loading}>
            <span className="material-symbols-outlined text-[14px] mr-1">refresh</span>Reload
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            <span className="material-symbols-outlined text-[14px] mr-1">save</span>Save Rules
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <div className="xl:col-span-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-64 p-3 bg-surface rounded border border-border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="# coding\nprovider/model-a\nprovider/model-b"
          />
        </div>

        <div className="p-3 rounded border border-border bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="text-xs font-semibold text-text-main mb-2">Parsed contexts</div>
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {Object.keys(parsed).length === 0 ? (
              <p className="text-xs text-text-muted">No valid contexts parsed yet.</p>
            ) : (
              Object.entries(parsed).map(([context, models]) => (
                <div key={context} className="p-2 rounded border border-border bg-surface">
                  <div className="text-xs font-semibold text-text-main">{context}</div>
                  <div className="mt-1 space-y-1">
                    {models.map((model) => (
                      <div key={`${context}-${model}`} className="text-[11px] text-text-muted font-mono break-all">
                        {model}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-3 rounded border border-border bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="text-xs font-semibold text-text-main mb-2">Smart picks</div>
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {Object.keys(recommendations).length === 0 ? (
              <p className="text-xs text-text-muted">No recommendations yet.</p>
            ) : (
              Object.entries(recommendations).map(([context, rec]) => (
                <div key={context} className="p-2 rounded border border-border bg-surface">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-text-main capitalize">{context}</div>
                    {rec?.primary?.tier && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {rec.primary.tier}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted font-mono break-all">{rec?.primary?.model || "-"}</div>
                  {rec?.primary?.reason && <div className="text-[10px] text-text-muted/80 mt-0.5">{rec.primary.reason}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
          <span className="material-symbols-outlined text-[14px]">{message.type === "success" ? "check_circle" : "error"}</span>
          <span>{message.text}</span>
        </div>
      )}
    </Card>
  );
}
