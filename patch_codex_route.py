import re

with open("src/app/api/cli-tools/codex-settings/route.js", "r") as f:
    content = f.read()

# Add getComboByName, updateCombo, createCombo to imports
content = content.replace(
    'import { parseTOML, stringifyTOML } from "confbox";',
    'import { parseTOML, stringifyTOML } from "confbox";\nimport { getComboByName, updateCombo, createCombo } from "@/lib/localDb";'
)

# Replace POST handler start
post_start = "export async function POST(request) {"
post_new = """export async function POST(request) {
  try {
    const body = await request.json();
    const { baseUrl, apiKey, subagentModel } = body;
    // Support either model (string) or models (array)
    const models = Array.isArray(body.models) ? body.models.filter(Boolean) : (body.model ? [body.model] : []);
    
    if (!baseUrl || !apiKey || models.length === 0) {
      return NextResponse.json({ error: "baseUrl, apiKey and at least one model are required" }, { status: 400 });
    }

    let activeModelName = models[0];

    // If multiple models, manage codex-combo
    if (models.length > 1) {
      activeModelName = "codex-combo";
      const existingCombo = await getComboByName(activeModelName);
      if (existingCombo) {
        await updateCombo(existingCombo.id, { models });
      } else {
        await createCombo({ name: activeModelName, models });
      }
    }
"""

content = re.sub(
    r'export async function POST\(request\) \{.*?(const codexDir = getCodexDir\(\);)',
    post_new + '\n    \\1',
    content,
    flags=re.DOTALL
)

# Fix parsed.model = model;
content = content.replace('parsed.model = model;', 'parsed.model = activeModelName;')
content = content.replace('const effectiveSubagentModel = subagentModel || model;', 'const effectiveSubagentModel = subagentModel || activeModelName;')

with open("src/app/api/cli-tools/codex-settings/route.js", "w") as f:
    f.write(content)
