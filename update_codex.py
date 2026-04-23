import re

with open("src/app/(dashboard)/dashboard/cli-tools/components/CodexToolCard.js", "r") as f:
    content = f.read()

# Add modelRules to props
content = content.replace(
    "export default function CodexToolCard({ tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders, cloudEnabled, initialStatus }) {",
    "export default function CodexToolCard({ tool, isExpanded, onToggle, baseUrl, apiKeys, activeProviders, cloudEnabled, initialStatus, modelRules }) {"
)

# Add apply handle
apply_func = """
  const handleApplyRule = (context) => {
    const models = modelRules[context];
    if (models && models.length > 0) {
      setSelectedModel(models[0]);
      setSubagentModel(models[0]);
    }
  };
"""
content = content.replace(
    "const handleModelSelect = (model) => {",
    f"{apply_func}\n  const handleModelSelect = (model) => {{"
)

# Add dropdown button in Model section
model_section = """                {/* Model */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Model</span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">arrow_forward</span>
                  <input type="text" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} placeholder="provider/model-id" className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  
                  {modelRules && Object.keys(modelRules).length > 0 && (
                    <div className="relative group shrink-0">
                      <button className="px-2 py-1.5 rounded border border-border bg-surface text-text-main hover:border-primary transition-colors text-xs flex items-center gap-1 cursor-pointer">
                        <span className="material-symbols-outlined text-[14px]">magic_button</span> Apply Rule
                      </button>
                      <div className="absolute top-full mt-1 right-0 w-48 bg-surface border border-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 py-1">
                        <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Use-cases</div>
                        {Object.entries(modelRules).map(([context, models]) => (
                          <button
                            key={context}
                            onClick={() => handleApplyRule(context)}
                            className="w-full text-left px-3 py-1.5 text-xs text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          >
                            <span className="font-semibold">{context}</span>
                            <span className="text-[10px] text-text-muted block truncate">{models[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => setModalOpen(true)} disabled={!activeProviders?.length} className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}>Select Model</button>"""

content = re.sub(r'\{\/\*\s*Model\s*\*\/\}.*?<button onClick=\{\(\) => setModalOpen\(true\)\}.*?>Select Model<\/button>', model_section, content, flags=re.DOTALL)

with open("src/app/(dashboard)/dashboard/cli-tools/components/CodexToolCard.js", "w") as f:
    f.write(content)
