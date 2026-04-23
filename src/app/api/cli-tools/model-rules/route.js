import { NextResponse } from "next/server";
import { readModelRules, writeModelRules } from "@/lib/modelRules";

// GET /api/cli-tools/model-rules
// Returns the markdown source plus a parsed index and smart recommendations.
export async function GET() {
  try {
    const rules = await readModelRules();
    return NextResponse.json(rules);
  } catch (error) {
    console.error("Error reading model rules:", error);
    return NextResponse.json({ error: "Failed to read model rules" }, { status: 500 });
  }
}

// PUT /api/cli-tools/model-rules
// Body: { content: string }
export async function PUT(request) {
  try {
    const { content } = await request.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "Content must be a string" }, { status: 400 });
    }

    const rules = await writeModelRules(content);
    return NextResponse.json({ success: true, ...rules });
  } catch (error) {
    console.error("Error writing model rules:", error);
    return NextResponse.json({ error: "Failed to write model rules" }, { status: 500 });
  }
}
