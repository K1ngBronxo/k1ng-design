import {
  createFile, loadFile, saveFile, listFiles, deleteFile, findPage, findArtboard,
  locateNode, screenshotPath, normalizeSize, newId, ROOT,
} from "./store.js";
import * as N from "./nodes.js";
import { screenshot, computedStyles, fontFamilyInfo, measureArtboard } from "./render.js";
import { guideSection } from "./guide.js";
import { invalid, notFound } from "./errors.js";

const S = { type: "string" };
const arr = (items) => ({ type: "array", items });
const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: true });

const artboardOf = (file, nodeId, artboardId) => (artboardId ? findArtboard(file, artboardId).artboard : locateNode(file, nodeId).artboard);
const mutate = async (fileId, fn) => {
  const file = await loadFile(fileId);
  const result = await fn(file);
  await saveFile(file);
  return result;
};

export const TOOLS = [
  {
    name: "create_file",
    description: "Create a design file. Returns the new fileId. Files live as JSON on disk under designs/.",
    inputSchema: obj({ name: { ...S, description: "Human readable file name." } }),
    handler: async ({ name }) => {
      const file = await createFile(name || "Untitled");
      return { fileId: file.id, name: file.name, pages: file.pages.map((p) => ({ id: p.id, name: p.name })) };
    },
  },
  {
    name: "list_files",
    description: "List every design file in the workspace, most recently updated first.",
    inputSchema: obj({}),
    handler: async () => ({ root: ROOT, files: await listFiles() }),
  },
  {
    name: "open_file",
    description: "Open an existing file and return its pages, artboards and token summary.",
    inputSchema: obj({ fileId: S }, ["fileId"]),
    handler: async ({ fileId }) => summarize(await loadFile(fileId)),
  },
  {
    name: "rename_file",
    description: "Rename a design file.",
    inputSchema: obj({ fileId: S, name: S }, ["fileId", "name"]),
    handler: async ({ fileId, name }) => mutate(fileId, (file) => ((file.name = String(name)), { fileId: file.id, name: file.name })),
  },
  {
    name: "delete_file",
    description: "Delete a design file and its screenshots.",
    inputSchema: obj({ fileId: S }, ["fileId"]),
    handler: async ({ fileId }) => deleteFile(fileId),
  },
  {
    name: "create_page",
    description: "Add a page to a file. Pages group artboards.",
    inputSchema: obj({ fileId: S, name: S }, ["fileId"]),
    handler: async ({ fileId, name }) =>
      mutate(fileId, (file) => {
        const page = { id: newId("p"), name: name || `Page ${file.pages.length + 1}`, artboards: [] };
        file.pages.push(page);
        return { pageId: page.id, name: page.name };
      }),
  },
  {
    name: "rename_page",
    description: "Rename a page.",
    inputSchema: obj({ fileId: S, pageId: S, name: S }, ["fileId", "pageId", "name"]),
    handler: async ({ fileId, pageId, name }) =>
      mutate(fileId, (file) => {
        const page = findPage(file, pageId);
        page.name = String(name);
        return { pageId, name: page.name };
      }),
  },
  {
    name: "arrange_pages",
    description: "Reorder pages. Pass every page id exactly once, in the new order.",
    inputSchema: obj({ fileId: S, pageIds: arr(S) }, ["fileId", "pageIds"]),
    handler: async ({ fileId, pageIds }) =>
      mutate(fileId, (file) => {
        if (pageIds.length !== file.pages.length) throw invalid(`expected ${file.pages.length} page ids`);
        const byId = new Map(file.pages.map((p) => [p.id, p]));
        file.pages = pageIds.map((id) => {
          const page = byId.get(id);
          if (!page) throw notFound("page", id);
          return page;
        });
        return { order: file.pages.map((p) => p.id) };
      }),
  },
  {
    name: "delete_page",
    description: "Delete a page and every artboard on it.",
    inputSchema: obj({ fileId: S, pageId: S }, ["fileId", "pageId"]),
    handler: async ({ fileId, pageId }) =>
      mutate(fileId, (file) => {
        findPage(file, pageId);
        if (file.pages.length === 1) throw invalid("a file must keep at least one page");
        file.pages = file.pages.filter((p) => p.id !== pageId);
        return { pageId, deleted: true };
      }),
  },
  {
    name: "create_artboard",
    description: 'Create an artboard. Use real device sizes: desktop 1440x900, tablet 834x1112, mobile 390x844. height accepts "fit-content" to grow with content.',
    inputSchema: obj(
      { fileId: S, pageId: S, name: S, width: { type: ["number", "string"] }, height: { type: ["number", "string"] } },
      ["fileId", "width", "height"],
    ),
    handler: async ({ fileId, pageId, name, width, height }) =>
      mutate(fileId, (file) => {
        const page = pageId ? findPage(file, pageId) : file.pages[0];
        const artboard = {
          id: newId("a"),
          name: name || `Artboard ${page.artboards.length + 1}`,
          width: normalizeSize(width, "width"),
          height: normalizeSize(height, "height"),
          html: "",
        };
        page.artboards.push(artboard);
        return { artboardId: artboard.id, pageId: page.id, name: artboard.name, width: artboard.width, height: artboard.height };
      }),
  },
  {
    name: "update_artboard",
    description: "Rename or resize an artboard.",
    inputSchema: obj({ fileId: S, artboardId: S, name: S, width: { type: ["number", "string"] }, height: { type: ["number", "string"] } }, ["fileId", "artboardId"]),
    handler: async ({ fileId, artboardId, name, width, height }) =>
      mutate(fileId, (file) => {
        const { artboard } = findArtboard(file, artboardId);
        if (name !== undefined) artboard.name = String(name);
        if (width !== undefined) artboard.width = normalizeSize(width, "width");
        if (height !== undefined) artboard.height = normalizeSize(height, "height");
        return { artboardId, name: artboard.name, width: artboard.width, height: artboard.height };
      }),
  },
  {
    name: "delete_artboard",
    description: "Delete an artboard and its contents.",
    inputSchema: obj({ fileId: S, artboardId: S }, ["fileId", "artboardId"]),
    handler: async ({ fileId, artboardId }) =>
      mutate(fileId, (file) => {
        const { page } = findArtboard(file, artboardId);
        page.artboards = page.artboards.filter((a) => a.id !== artboardId);
        return { artboardId, deleted: true };
      }),
  },
  {
    name: "write_html",
    description: "Append an HTML fragment to an artboard. Every element gets a stable data-k1ng-id that the other tools use. Add one visual group at a time.",
    inputSchema: obj({ fileId: S, artboardId: S, html: S, parentId: S, index: { type: "number" } }, ["fileId", "artboardId", "html"]),
    handler: async ({ fileId, artboardId, html, parentId, index }) =>
      mutate(fileId, (file) => {
        const { artboard } = findArtboard(file, artboardId);
        const nodeIds = N.appendHtml(artboard, html, { parentId: parentId ?? null, index: index ?? null });
        return { artboardId, nodeIds, elements: N.treeSummary(artboard).length };
      }),
  },
  {
    name: "update_styles",
    description: "Merge CSS into one node's inline style. Accepts camelCase or kebab-case keys. Pass null to remove a property.",
    inputSchema: obj({ fileId: S, artboardId: S, nodeId: S, styles: obj({}, []) }, ["fileId", "nodeId", "styles"]),
    handler: async ({ fileId, artboardId, nodeId, styles }) =>
      mutate(fileId, (file) => N.updateStyles(artboardOf(file, nodeId, artboardId), nodeId, styles)),
  },
  {
    name: "set_text_content",
    description: "Replace a node's text. Element children are preserved.",
    inputSchema: obj({ fileId: S, artboardId: S, nodeId: S, text: S }, ["fileId", "nodeId", "text"]),
    handler: async ({ fileId, artboardId, nodeId, text }) =>
      mutate(fileId, (file) => N.setTextContent(artboardOf(file, nodeId, artboardId), nodeId, text)),
  },
  {
    name: "duplicate_nodes",
    description: "Duplicate nodes in place. Copies get fresh ids and are inserted directly after each original.",
    inputSchema: obj({ fileId: S, artboardId: S, nodeIds: arr(S) }, ["fileId", "nodeIds"]),
    handler: async ({ fileId, artboardId, nodeIds }) =>
      mutate(fileId, (file) => {
        const artboard = artboardOf(file, nodeIds[0], artboardId);
        return { created: N.duplicateNodes(artboard, nodeIds) };
      }),
  },
  {
    name: "delete_nodes",
    description: "Delete nodes and their descendants.",
    inputSchema: obj({ fileId: S, artboardId: S, nodeIds: arr(S) }, ["fileId", "nodeIds"]),
    handler: async ({ fileId, artboardId, nodeIds }) =>
      mutate(fileId, (file) => ({ removed: N.deleteNodes(artboardOf(file, nodeIds[0], artboardId), nodeIds) })),
  },
  {
    name: "move_nodes",
    description: "Move nodes into a new parent, optionally at an index. Omit toParentId to move to the artboard root.",
    inputSchema: obj({ fileId: S, artboardId: S, nodeIds: arr(S), toParentId: S, index: { type: "number" } }, ["fileId", "nodeIds"]),
    handler: async ({ fileId, artboardId, nodeIds, toParentId, index }) =>
      mutate(fileId, (file) =>
        N.moveNodes(artboardOf(file, nodeIds[0], artboardId), nodeIds, { toParentId: toParentId ?? null, index: index ?? null }),
      ),
  },
  {
    name: "rename_nodes",
    description: "Give nodes a layer name (data-k1ng-name). Useful for orienting in later calls.",
    inputSchema: obj({ fileId: S, artboardId: S, nodeIds: arr(S), name: S }, ["fileId", "nodeIds", "name"]),
    handler: async ({ fileId, artboardId, nodeIds, name }) =>
      mutate(fileId, (file) => N.renameNodes(artboardOf(file, nodeIds[0], artboardId), nodeIds, name)),
  },
  {
    name: "find_nodes",
    description: "Find nodes by tag, layer name or text content. Filters combine with AND.",
    inputSchema: obj({ fileId: S, artboardId: S, tag: S, name: S, text: S }, ["fileId"]),
    handler: async ({ fileId, artboardId, tag, name, text }) => {
      const file = await loadFile(fileId);
      const artboards = artboardId ? [findArtboard(file, artboardId).artboard] : file.pages.flatMap((p) => p.artboards);
      const matches = artboards.flatMap((a) => N.findNodes(a, { tag, name, text }).map((n) => ({ ...n, artboardId: a.id })));
      return { count: matches.length, nodes: matches };
    },
  },
  {
    name: "get_basic_info",
    description: "File overview: pages, artboards with measurable sizes, and the active token palette.",
    inputSchema: obj({ fileId: S }),
    handler: async ({ fileId }) => summarize(await loadFile(fileId)),
  },
  {
    name: "get_node_info",
    description: "One node's tag, layer name, class, text, inline style and child count.",
    inputSchema: obj({ fileId: S, artboardId: S, nodeId: S }, ["fileId", "nodeId"]),
    handler: async ({ fileId, artboardId, nodeId }) => {
      const file = await loadFile(fileId);
      return N.getNodeInfo(artboardOf(file, nodeId, artboardId), nodeId);
    },
  },
  {
    name: "get_children",
    description: "Direct children of a node, or the artboard root when parentId is omitted.",
    inputSchema: obj({ fileId: S, artboardId: S, parentId: S }, ["fileId"]),
    handler: async ({ fileId, artboardId, parentId }) => {
      const file = await loadFile(fileId);
      const artboard = artboardId ? findArtboard(file, artboardId).artboard : locateNode(file, parentId).artboard;
      return { children: N.getChildren(artboard, parentId ?? null) };
    },
  },
  {
    name: "get_tree_summary",
    description: "Indented outline of an artboard's node tree.",
    inputSchema: obj({ fileId: S, artboardId: S }, ["fileId", "artboardId"]),
    handler: async ({ fileId, artboardId }) => {
      const file = await loadFile(fileId);
      const { artboard } = findArtboard(file, artboardId);
      return { artboardId, outline: N.treeSummary(artboard) };
    },
  },
  {
    name: "get_computed_styles",
    description: "Exact computed CSS from the real browser for one node, plus its measured rect. This is authoritative; screenshots are not.",
    inputSchema: obj({ fileId: S, artboardId: S, nodeId: S, properties: arr(S) }, ["fileId", "nodeId"]),
    handler: async ({ fileId, artboardId, nodeId, properties }) => {
      const file = await loadFile(fileId);
      const artboard = artboardOf(file, nodeId, artboardId);
      return computedStyles(file, artboard.id, nodeId, properties?.length ? properties : undefined);
    },
  },
  {
    name: "get_screenshot",
    description: "Render one artboard in Chrome and save a PNG. Returns the path and pixel size. Look at it before claiming the design is good.",
    inputSchema: obj({ fileId: S, artboardId: S, scale: { type: "number" } }, ["fileId", "artboardId"]),
    handler: async ({ fileId, artboardId, scale }) => {
      const file = await loadFile(fileId);
      findArtboard(file, artboardId);
      const path = await screenshotPath(fileId, artboardId);
      return screenshot(file, artboardId, { scale: scale && scale > 0 ? scale : 1, path });
    },
  },
  {
    name: "get_jsx",
    description: "Export an artboard as a React component with inline style objects.",
    inputSchema: obj({ fileId: S, artboardId: S, componentName: S }, ["fileId", "artboardId"]),
    handler: async ({ fileId, artboardId, componentName }) => {
      const file = await loadFile(fileId);
      const { artboard } = findArtboard(file, artboardId);
      return { artboardId, jsx: N.toJsx(artboard, componentName || toPascal(artboard.name)) };
    },
  },
  {
    name: "export_html",
    description: "Export one artboard as a standalone HTML document with the design tokens applied.",
    inputSchema: obj({ fileId: S, artboardId: S }, ["fileId", "artboardId"]),
    handler: async ({ fileId, artboardId }) => {
      const file = await loadFile(fileId);
      const { artboard } = findArtboard(file, artboardId);
      const t = file.tokens;
      return {
        artboardId,
        html: `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${artboard.name}</title>\n<style>\n  :root{--bg:${t.colors.background};--surface:${t.colors.surface};--text:${t.colors.text};--muted:${t.colors.muted};--primary:${t.colors.primary};--border:${t.colors.border}}\n  body{margin:0;font-family:${t.type.family};color:var(--text);background:var(--bg)}\n  *{box-sizing:border-box}\n</style>\n</head>\n<body>\n${artboard.html}\n</body>\n</html>\n`,
      };
    },
  },
  {
    name: "get_font_family_info",
    description: "Check whether a font family actually resolves in the renderer, using measured text metrics rather than a guess.",
    inputSchema: obj({ family: S }, ["family"]),
    handler: async ({ family }) => fontFamilyInfo(family),
  },
  {
    name: "get_tokens",
    description: "Read the file's design tokens (colours, type scale, spacing, radius).",
    inputSchema: obj({ fileId: S }, ["fileId"]),
    handler: async ({ fileId }) => ({ fileId, tokens: (await loadFile(fileId)).tokens }),
  },
  {
    name: "set_tokens",
    description: "Replace design tokens. Shallow merge per section: colours, type, space, radius.",
    inputSchema: obj({ fileId: S, tokens: obj({}, []) }, ["fileId", "tokens"]),
    handler: async ({ fileId, tokens }) =>
      mutate(fileId, (file) => {
        for (const key of ["colors", "type", "radius"]) {
          if (tokens[key]) file.tokens[key] = { ...file.tokens[key], ...tokens[key] };
        }
        if (tokens.space) file.tokens.space = tokens.space;
        return { tokens: file.tokens };
      }),
  },
  {
    name: "get_guide",
    description: "Design guide: workflow, palette, type scale, spacing, layout, components, writing, stop conditions. Read this before the first artboard.",
    inputSchema: obj({ topic: S }),
    handler: async ({ topic }) => ({ guide: guideSection(topic) }),
  },
  {
    name: "finish_working_on_nodes",
    description: "End-of-edit checkpoint. Measures the artboard, reports overflow and reminds you to screenshot before claiming done.",
    inputSchema: obj({ fileId: S, artboardId: S }, ["fileId", "artboardId"]),
    handler: async ({ fileId, artboardId }) => {
      const file = await loadFile(fileId);
      const { artboard } = findArtboard(file, artboardId);
      const box = await measureArtboard(file, artboardId);
      const declaredHeight = artboard.height === "fit-content" ? null : artboard.height;
      const content = box?.contentHeight ?? box?.height ?? 0;
      return {
        artboardId,
        measured: box,
        declared: { width: artboard.width, height: artboard.height },
        overflow: declaredHeight !== null && content > declaredHeight ? content - declaredHeight : 0,
        next: "Call get_screenshot and review it. Then export with get_jsx.",
      };
    },
  },
];

const toPascal = (value) =>
  String(value || "Artboard")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("") || "Artboard";

function summarize(file) {
  return {
    fileId: file.id,
    name: file.name,
    updatedAt: file.updatedAt,
    root: ROOT,
    pages: file.pages.map((p) => ({
      id: p.id,
      name: p.name,
      artboards: p.artboards.map((a) => ({ id: a.id, name: a.name, width: a.width, height: a.height, nodes: N.treeSummary(a).length })),
    })),
    tokens: file.tokens,
  };
}
