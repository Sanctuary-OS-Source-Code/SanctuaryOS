import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { isDesktop } from "./envUtils";

export interface LocalInstalledTemplateSummary {
  file_name: string;
  path: string;
  template_id: string;
  target_file: string;
  template_version: string;
  template_name: string;
  schema_version: string;
  mod_author?: string | null;
  template_author?: string | null;
}

export function joinLocalPath(base: string, ...segments: string[]): string {
  const rawBase = String(base || "");
  const sep = rawBase.includes("\\") ? "\\" : "/";
  const cleanBase = rawBase.replace(/[\\/]+$/, "");
  const cleanSegs = segments
    .map((s) => String(s || "").replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter(Boolean);
  if (!cleanBase) return cleanSegs.join(sep);
  return [cleanBase, ...cleanSegs].join(sep);
}

export function compareTemplateVersions(
  v1?: string | null,
  v2?: string | null
): number {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = String(v1)
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const p2 = String(v2)
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

export async function listInstalledTemplates(
  vaultPath?: string | null
): Promise<LocalInstalledTemplateSummary[]> {
  if (!isDesktop() || !vaultPath?.trim()) return [];
  try {
    return await invoke<LocalInstalledTemplateSummary[]>(
      "list_local_installed_templates",
      { vaultPath }
    );
  } catch {
    return [];
  }
}

export async function loadInstalledTemplatesVersionMap(
  vaultPath?: string | null
): Promise<Record<string, string>> {
  const list = await listInstalledTemplates(vaultPath);
  const map: Record<string, string> = {};
  for (const item of list) {
    const key = item.template_name || item.template_id;
    if (!key) continue;
    const cur = map[key] || "0.0.0";
    const parsedVer = item.template_version || "1.0.0";
    if (compareTemplateVersions(parsedVer, cur) >= 0) {
      map[key] = parsedVer;
    }
  }
  return map;
}

export async function writeLocalTemplateFile(
  vaultPath: string,
  fileName: string,
  templateData: unknown
): Promise<string> {
  const templatesDir = joinLocalPath(vaultPath, "Templates");
  if (!(await exists(templatesDir))) {
    await mkdir(templatesDir, { recursive: true });
  }
  const safeFile = String(fileName || "vlocal_template.json")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_");
  const fullPath = joinLocalPath(templatesDir, safeFile);
  const jsonText =
    typeof templateData === "string"
      ? templateData
      : JSON.stringify(templateData, null, 2);
  await writeTextFile(fullPath, jsonText);
  return fullPath;
}

