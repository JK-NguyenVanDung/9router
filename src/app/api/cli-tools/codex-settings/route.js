"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { parseTOML, stringifyTOML } from "confbox";
import { getComboByName, updateCombo, createCombo } from "@/lib/localDb";

const execAsync = promisify(exec);

const getCodexDir = () => path.join(os.homedir(), ".codex");
const getCodexConfigPath = () => path.join(getCodexDir(), "config.toml");
const getCodexAuthPath = () => path.join(getCodexDir(), "auth.json");

// Flatten confbox-parsed TOML into a writable object, preserving nested tables
const parsedToWritable = (obj) => obj ?? {};

// Set a nested key from a flat dotted path, creating intermediate objects as needed
const setNestedSection = (obj, dottedKey, value) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};

// Delete a nested key from a flat dotted path
const deleteNestedSection = (obj, dottedKey) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur?.[keys[i]];
    if (cur == null) return;
  }
  delete cur[keys[keys.length - 1]];
};

// Check if codex CLI is installed (via which/where or config file exists)
const checkCodexInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where codex" : "which codex";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getCodexConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

// Read current config.toml
const readConfig = async () => {
  try {
    const configPath = getCodexConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return content;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Check if config has 9Router settings
const has9RouterConfig = (config) => {
  if (!config) return false;
  return config.includes("model_provider = \"9router\"") || config.includes("[model_providers.9router]");
};

// GET - Check codex CLI and read current settings
export async function GET() {
  try {
    const isInstalled = await checkCodexInstalled();
    
    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "Codex CLI is not installed",
      });
    }

    const config = await readConfig();

    return NextResponse.json({
      installed: true,
      config,
      has9Router: has9RouterConfig(config),
      configPath: getCodexConfigPath(),
    });
  } catch (error) {
    console.log("Error checking codex settings:", error);
    return NextResponse.json({ error: "Failed to check codex settings" }, { status: 500 });
  }
}

// POST - Update 9Router settings (merge with existing config)
export async function POST(request) {
  try {
    const body = await request.json();
    const { baseUrl, apiKey, subagentModel, comboName } = body;
    // Support either model (string) or models (array)
    const models = Array.isArray(body.models) ? body.models.filter(Boolean) : (body.model ? [body.model] : []);
    
    if (!baseUrl || !apiKey || models.length === 0) {
      return NextResponse.json({ error: "baseUrl, apiKey and at least one model are required" }, { status: 400 });
    }

    let activeModelName = models[0];

    // If multiple models, manage codex-combo
    if (models.length > 1) {
      activeModelName = comboName?.trim() || "codex-combo";
      const existingCombo = await getComboByName(activeModelName);
      if (existingCombo) {
        await updateCombo(existingCombo.id, { models });
      } else {
        await createCombo({ name: activeModelName, models });
      }
    }

    const codexDir = getCodexDir();
    const configPath = getCodexConfigPath();

    // Ensure directory exists
    await fs.mkdir(codexDir, { recursive: true });

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch { /* No existing config */ }

    // Update only 9Router related fields (api_key goes to auth.json, not config.toml)
    parsed.model = activeModelName;
    parsed.model_provider = "9router";

    // Update or create 9router provider section (no api_key - Codex reads from auth.json)
    // Ensure /v1 suffix is added only once
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    setNestedSection(parsed, "model_providers.9router", {
      name: "9Router",
      base_url: normalizedBaseUrl,
      wire_api: "responses",
    });

    // Add subagent configuration
    const effectiveSubagentModel = subagentModel || activeModelName;
    setNestedSection(parsed, "agents.subagent", {
      model: effectiveSubagentModel,
    });

    // Write merged config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Update auth.json with OPENAI_API_KEY (Codex reads this first)
    const authPath = getCodexAuthPath();
    let authData = {};
    try {
      const existingAuth = await fs.readFile(authPath, "utf-8");
      authData = JSON.parse(existingAuth);
    } catch { /* No existing auth */ }
    
    authData.OPENAI_API_KEY = apiKey;
    await fs.writeFile(authPath, JSON.stringify(authData, null, 2));

    return NextResponse.json({
      success: true,
      message: "Codex settings applied successfully!",
      configPath,
    });
  } catch (error) {
    console.log("Error updating codex settings:", error);
    return NextResponse.json({ error: "Failed to update codex settings" }, { status: 500 });
  }
}


// PATCH - Fast switch: change only the active model (and optionally subagent) in config.toml
// Body: { model: string, subagentModel?: string }
export async function PATCH(request) {
  try {
    const { model, subagentModel } = await request.json();
    if (!model || typeof model !== "string") {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }

    const configPath = getCodexConfigPath();
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ error: "Codex config.toml not found. Apply settings first." }, { status: 404 });
      }
      throw error;
    }

    if (parsed.model_provider && parsed.model_provider !== "9router") {
      return NextResponse.json({ error: "Active provider is not 9router. Apply 9Router settings first." }, { status: 400 });
    }

    parsed.model = model;
    if (typeof subagentModel === "string" && subagentModel.trim()) {
      setNestedSection(parsed, "agents.subagent", { model: subagentModel.trim() });
    }

    await fs.writeFile(configPath, stringifyTOML(parsed));

    return NextResponse.json({
      success: true,
      message: `Active model switched to "${model}"`,
      model,
      subagentModel: subagentModel || null,
      configPath,
    });
  } catch (error) {
    console.log("Error switching codex model:", error);
    return NextResponse.json({ error: "Failed to switch codex model" }, { status: 500 });
  }
}

// DELETE - Remove 9Router settings only (keep other settings)
export async function DELETE() {
  try {
    const configPath = getCodexConfigPath();

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No config file to reset",
        });
      }
      throw error;
    }

    // Remove 9Router related root fields only if they point to 9router
    if (parsed.model_provider === "9router") {
      delete parsed.model;
      delete parsed.model_provider;
    }

    // Remove 9router provider section
    deleteNestedSection(parsed, "model_providers.9router");

    // Remove subagent configuration
    deleteNestedSection(parsed, "agents.subagent");

    // Write updated config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Remove OPENAI_API_KEY from auth.json
    const authPath = getCodexAuthPath();
    try {
      const existingAuth = await fs.readFile(authPath, "utf-8");
      const authData = JSON.parse(existingAuth);
      delete authData.OPENAI_API_KEY;
      
      // Write back or delete if empty
      if (Object.keys(authData).length === 0) {
        await fs.unlink(authPath);
      } else {
        await fs.writeFile(authPath, JSON.stringify(authData, null, 2));
      }
    } catch { /* No auth file */ }

    return NextResponse.json({
      success: true,
      message: "9Router settings removed successfully",
    });
  } catch (error) {
    console.log("Error resetting codex settings:", error);
    return NextResponse.json({ error: "Failed to reset codex settings" }, { status: 500 });
  }
}
