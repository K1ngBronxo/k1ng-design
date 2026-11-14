import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { notFound, invalid } from "./errors.js";

export const ROOT = process.env.K1NG_DESIGN_DIR
  ? path.resolve(process.env.K1NG_DESIGN_DIR)
  : path.resolve(process.cwd(), "designs");

export const newId = (prefix) => `${prefix}_${randomBytes(4).toString("hex")}`;

const filePath = (id) => path.join(ROOT, `${id}.json`);

export async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}

export const DEFAULT_TOKENS = {
  colors: {
    background: "#ffffff",
    surface: "#f5f5f7",
    text: "#111114",
    muted: "#6b7280",
    primary: "#111114",
    onPrimary: "#ffffff",
    border: "#e5e7eb",
  },
  type: { family: "Inter, system-ui, sans-serif", scale: [12, 14, 16, 20, 24, 32, 48, 64] },
  space: [4, 8, 12, 16, 24, 32, 48, 64, 96],
  radius: { sm: 6, md: 10, lg: 16, full: 999 },
};

export async function createFile(name = "Untitled") {
  await ensureRoot();
  const now = new Date().toISOString();
  const file = {
    id: newId("d"),
    name,
    createdAt: now,
    updatedAt: now,
    tokens: structuredClone(DEFAULT_TOKENS),
    pages: [{ id: newId("p"), name: "Page 1", artboards: [] }],
  };
  await saveFile(file);
  return file;
}

export async function loadFile(fileId) {
  if (!fileId) throw invalid("fileId is required");
  try {
    return JSON.parse(await fs.readFile(filePath(fileId), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") throw notFound("file", fileId);
    throw err;
  }
}

export async function saveFile(file) {
  await ensureRoot();
  file.updatedAt = new Date().toISOString();
  await fs.writeFile(filePath(file.id), JSON.stringify(file, null, 2), "utf8");
  return file;
}

export async function listFiles() {
  await ensureRoot();
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    if (entry.name.startsWith(".")) continue;
    try {
      const file = JSON.parse(await fs.readFile(path.join(ROOT, entry.name), "utf8"));
      out.push({
        id: file.id,
        name: file.name,
        updatedAt: file.updatedAt,
        pages: file.pages?.length ?? 0,
        artboards: (file.pages ?? []).reduce((n, p) => n + (p.artboards?.length ?? 0), 0),
      });
    } catch {
      // A half-written or foreign JSON file is not a design; skip it rather than fail the listing.
    }
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function deleteFile(fileId) {
  const file = await loadFile(fileId);
  await fs.rm(filePath(fileId), { force: true });
  return { id: file.id, name: file.name, deleted: true };
}

export function findPage(file, pageId) {
  const page = file.pages.find((p) => p.id === pageId);
  if (!page) throw notFound("page", pageId);
  return page;
}

export function findArtboard(file, artboardId) {
  for (const page of file.pages) {
    const artboard = page.artboards.find((a) => a.id === artboardId);
    if (artboard) return { page, artboard };
  }
  throw notFound("artboard", artboardId);
}

export function locateNode(file, nodeId) {
  for (const page of file.pages) {
    for (const artboard of page.artboards) {
      if (artboard.html.includes(nodeId)) return { page, artboard };
    }
  }
  throw notFound("node", nodeId);
}

export async function screenshotPath(fileId, artboardId) {
  const dir = path.join(ROOT, fileId);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${artboardId}.png`);
}

export function normalizeSize(value, field) {
  if (value === "fit-content") return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) throw invalid(`${field} must be a positive number or "fit-content"`);
  return Math.round(n);
}
