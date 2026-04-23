import re

with open("src/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.js", "r") as f:
    content = f.read()

# Add import
content = content.replace(
    "import { ClaudeToolCard, CodexToolCard, DroidToolCard, OpenClawToolCard, DefaultToolCard, OpenCodeToolCard, MitmLinkCard } from \"./components\";",
    "import { ClaudeToolCard, CodexToolCard, DroidToolCard, OpenClawToolCard, DefaultToolCard, OpenCodeToolCard, MitmLinkCard, ModelRulesCard } from \"./components\";"
)

# Add state
content = content.replace(
    "const [toolStatuses, setToolStatuses] = useState({});",
    "const [toolStatuses, setToolStatuses] = useState({});\n  const [modelRules, setModelRules] = useState({});"
)

# Add fetch call
content = content.replace(
    "fetchAllStatuses();",
    "fetchAllStatuses();\n    fetchModelRules();"
)

# Add fetch function
fetch_func = """
  const fetchModelRules = async () => {
    try {
      const res = await fetch("/api/cli-tools/model-rules");
      if (res.ok) {
        const data = await res.json();
        setModelRules(data.parsed || {});
      }
    } catch (error) {
      console.log("Error fetching model rules:", error);
    }
  };
"""
content = content.replace(
    "const fetchAllStatuses = async () => {",
    f"{fetch_func}\n  const fetchAllStatuses = async () => {{"
)

# Pass modelRules to renderToolCard commonProps
content = content.replace(
    "apiKeys,",
    "apiKeys,\n      modelRules,"
)

# Add component to JSX
jsx_replace = """    <div className="flex flex-col gap-6">
      <ModelRulesCard />
      <div className="flex flex-col gap-4">"""
content = content.replace(
    "    <div className=\"flex flex-col gap-6\">\n      <div className=\"flex flex-col gap-4\">",
    jsx_replace
)

with open("src/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.js", "w") as f:
    f.write(content)
