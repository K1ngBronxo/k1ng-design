import { parse } from "node-html-parser";
import { newId } from "./store.js";
import { invalid, notFound } from "./errors.js";

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

const elements = (el) => el.childNodes.filter((n) => n.nodeType === 1);
const allElements = (root) => root.querySelectorAll("*");

const escapeText = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function assignIds(root) {
  const fresh = [];
  for (const el of allElements(root)) {
    if (!el.getAttribute("data-k1ng-id")) {
      const id = newId("n");
      el.setAttribute("data-k1ng-id", id);
      fresh.push(id);
    }
  }
  return fresh;
}

export function parseArtboard(artboard) {
  return parse(artboard.html ?? "", { comment: false });
}

export function serialize(root) {
  return root.toString().trim();
}

export function appendHtml(artboard, html, { parentId = null, index = null } = {}) {
  if (typeof html !== "string" || !html.trim()) throw invalid("html must be a non-empty string");
  const root = parseArtboard(artboard);
  const parent = parentId ? findNode(root, parentId) : root;

  if (index === null || index === undefined) {
    parent.insertAdjacentHTML("beforeend", html);
  } else {
    const kids = elements(parent);
    const before = kids[index];
    if (before) before.insertAdjacentHTML("beforebegin", html);
    else parent.insertAdjacentHTML("beforeend", html);
  }

  const ids = assignIds(root);
  artboard.html = serialize(root);
  return ids;
}

export function findNode(root, nodeId) {
  const el = root.querySelector(`[data-k1ng-id="${nodeId}"]`);
  if (!el) throw notFound("node", nodeId);
  return el;
}

const UNITLESS = new Set(["line-height", "opacity", "z-index", "font-weight", "flex", "flex-grow", "flex-shrink", "order", "zoom"]);

export function updateStyles(artboard, nodeId, styles) {
  if (!styles || typeof styles !== "object" || Array.isArray(styles)) throw invalid("styles must be an object");
  const root = parseArtboard(artboard);
  const el = findNode(root, nodeId);
  const current = parseStyle(el.getAttribute("style") ?? "");
  const merged = { ...current };
  for (const [key, value] of Object.entries(styles)) {
    const cssKey = key.includes("-") ? key : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (value === null || value === undefined || value === "") delete merged[cssKey];
    else merged[cssKey] = typeof value === "number" && !UNITLESS.has(cssKey) ? `${value}px` : String(value);
  }
  el.setAttribute("style", Object.entries(merged).map(([k, v]) => `${k}: ${v}`).join("; "));
  artboard.html = serialize(root);
  return { nodeId, style: el.getAttribute("style") ?? "" };
}

export function setTextContent(artboard, nodeId, text) {
  const root = parseArtboard(artboard);
  const el = findNode(root, nodeId);
  const kept = elements(el).map((child) => child.toString()).join("");
  el.set_content(escapeText(text) + kept);
  artboard.html = serialize(root);
  return { nodeId, text: String(text) };
}

export function duplicateNodes(artboard, nodeIds) {
  const root = parseArtboard(artboard);
  const created = [];
  for (const nodeId of nodeIds) {
    const el = findNode(root, nodeId);
    // Strip ids so the copies cannot collide with the originals; assignIds fills the fresh ones in.
    const html = el.toString().replace(/\s*data-k1ng-id="[^"]*"/g, "");
    el.insertAdjacentHTML("afterend", html);
  }
  created.push(...assignIds(root));
  artboard.html = serialize(root);
  return created;
}

export function deleteNodes(artboard, nodeIds) {
  const root = parseArtboard(artboard);
  let removed = 0;
  for (const nodeId of nodeIds) {
    const el = root.querySelector(`[data-k1ng-id="${nodeId}"]`);
    if (!el) continue;
    el.remove();
    removed += 1;
  }
  if (removed === 0) throw notFound("node", nodeIds.join(", "));
  artboard.html = serialize(root);
  return removed;
}

export function moveNodes(artboard, nodeIds, { toParentId = null, index = null } = {}) {
  const root = parseArtboard(artboard);
  const moved = nodeIds.map((id) => findNode(root, id));
  const target = toParentId ? findNode(root, toParentId) : root;

  for (const node of moved) {
    if (node === target || node.querySelector?.(`[data-k1ng-id="${target.getAttribute("data-k1ng-id")}"]`)) {
      throw invalid("cannot move a node into itself or its own descendant");
    }
  }

  const html = moved.map((n) => n.toString()).join("");
  for (const node of moved) node.remove();

  if (index === null || index === undefined) {
    target.insertAdjacentHTML("beforeend", html);
  } else {
    const kids = elements(target);
    const before = kids[index];
    if (before) before.insertAdjacentHTML("beforebegin", html);
    else target.insertAdjacentHTML("beforeend", html);
  }

  artboard.html = serialize(root);
  return { moved: nodeIds.length };
}

export function renameNodes(artboard, nodeIds, name) {
  const root = parseArtboard(artboard);
  for (const nodeId of nodeIds) findNode(root, nodeId).setAttribute("data-k1ng-name", String(name));
  artboard.html = serialize(root);
  return { renamed: nodeIds.length, name };
}

export function findNodes(artboard, { tag, name, text } = {}) {
  const root = parseArtboard(artboard);
  const out = [];
  for (const el of allElements(root)) {
    if (tag && el.tagName?.toLowerCase() !== String(tag).toLowerCase()) continue;
    if (name && !(el.getAttribute("data-k1ng-name") ?? "").toLowerCase().includes(String(name).toLowerCase())) continue;
    if (text && !el.textContent.toLowerCase().includes(String(text).toLowerCase())) continue;
    out.push(describe(el));
  }
  return out;
}

export function getNodeInfo(artboard, nodeId) {
  const root = parseArtboard(artboard);
  return describe(findNode(root, nodeId));
}

export function getChildren(artboard, nodeId) {
  const root = parseArtboard(artboard);
  const el = nodeId ? findNode(root, nodeId) : root;
  return elements(el).map(describe);
}

export function treeSummary(artboard) {
  const root = parseArtboard(artboard);
  const lines = [];
  const walk = (el, depth) => {
    const name = el.getAttribute("data-k1ng-name");
    const label = `${"  ".repeat(depth)}${el.tagName?.toLowerCase()}${name ? ` "${name}"` : ""} #${el.getAttribute("data-k1ng-id")}`;
    lines.push(label);
    for (const child of elements(el)) walk(child, depth + 1);
  };
  for (const el of elements(root)) walk(el, 0);
  return lines;
}

export function hasNode(artboard, nodeId) {
  return Boolean(parseArtboard(artboard).querySelector(`[data-k1ng-id="${nodeId}"]`));
}

function describe(el) {
  return {
    id: el.getAttribute("data-k1ng-id"),
    tag: el.tagName?.toLowerCase(),
    name: el.getAttribute("data-k1ng-name") ?? null,
    class: el.getAttribute("class") ?? null,
    text: el.textContent.trim().slice(0, 200),
    style: el.getAttribute("style") ?? "",
    children: elements(el).length,
  };
}

export function parseStyle(style) {
  const out = {};
  for (const part of String(style).split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

const jsxStyle = (style) => {
  const entries = Object.entries(parseStyle(style));
  if (entries.length === 0) return "";
  const body = entries
    .map(([k, v]) => {
      const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = /^[a-z-]+$/i.test(v) && !/^#|^rgb/i.test(v) ? v : v;
      return `      ${key}: ${JSON.stringify(value)},`;
    })
    .join("\n");
  return ` style={{\n${body}\n    }}`;
};

function toJsxNode(el, depth) {
  const pad = "  ".repeat(depth);
  const tag = el.tagName?.toLowerCase();
  if (!tag) return "";
  const style = jsxStyle(el.getAttribute("style") ?? "");
  const cls = el.getAttribute("class");
  const name = el.getAttribute("data-k1ng-name");
  const classPart = cls ? ` className=${JSON.stringify(cls)}` : "";
  const namePart = name ? ` data-name=${JSON.stringify(name)}` : "";
  const kids = elements(el);
  const ownText = (el.childNodes ?? [])
    .filter((n) => n.nodeType === 3 && n.textContent.trim())
    .map((n) => n.textContent.trim())
    .join(" ");

  if (VOID_TAGS.has(tag)) return `${pad}<${tag}${classPart}${style}${namePart} />`;

  const inner = [];
  if (ownText) inner.push(`${pad}  ${ownText.replace(/[{}]/g, (m) => `{"${m}"}`)}`);
  for (const child of kids) inner.push(toJsxNode(child, depth + 1));

  if (inner.length === 0) return `${pad}<${tag}${classPart}${style}${namePart}></${tag}>`;
  if (inner.length === 1 && !ownText) return `${pad}<${tag}${classPart}${style}${namePart}>\n${inner[0]}\n${pad}</${tag}>`;
  return `${pad}<${tag}${classPart}${style}${namePart}>\n${inner.join("\n")}\n${pad}</${tag}>`;
}

export function toJsx(artboard, componentName = "Artboard") {
  const root = parseArtboard(artboard);
  const safeName = String(componentName).replace(/[^A-Za-z0-9_$]/g, "") || "Artboard";
  const body = elements(root)
    .map((el) => toJsxNode(el, 3))
    .join("\n");
  return `export default function ${safeName}() {\n  return (\n${body}\n  );\n}\n`;
}
