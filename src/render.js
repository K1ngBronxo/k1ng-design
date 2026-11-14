import { chromium } from "playwright";
import { DesignError } from "./errors.js";
import { findArtboard } from "./store.js";

const GUTTER = 80;
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ channel: process.env.K1NG_CHANNEL || "chrome", headless: true })
      .catch((err) => {
        browserPromise = null;
        throw new DesignError(
          "renderer_unavailable",
          `Could not launch Chrome for rendering. Install Google Chrome, or set K1NG_CHANNEL to another Chromium channel. ${err.message}`,
        );
      });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => {});
}

const size = (value) => (value === "fit-content" ? "auto" : `${value}px`);

export function buildDocumentHtml(file) {
  const sections = [];
  for (const page of file.pages) {
    for (const artboard of page.artboards) {
      sections.push(
        `<section class="k1ng-ab" data-artboard-id="${artboard.id}" data-artboard-name="${escapeAttr(artboard.name)}" ` +
          `style="position:relative;width:${size(artboard.width)};height:${size(artboard.height)};overflow:hidden;background:#fff;` +
          `font-family:${escapeAttr(documentFont(file))};color:#111114">${artboard.html}</section>`,
      );
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff}
    body{display:flex;flex-wrap:wrap;align-items:flex-start;gap:${GUTTER}px;padding:${GUTTER}px}
    *{box-sizing:border-box}
  </style></head><body>${sections.join("")}</body></html>`;
}

const escapeAttr = (v) => String(v ?? "").replace(/"/g, "&quot;");
const documentFont = (file) => file.tokens?.type?.family ?? "system-ui, sans-serif";

async function withPage(html, fn, { scale = 1 } = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({ deviceScaleFactor: scale, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready?.then(() => true));
    return await fn(page);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function screenshot(file, artboardId, { scale = 1, path }) {
  const { artboard } = findArtboard(file, artboardId);
  return withPage(
    buildDocumentHtml(file),
    async (page) => {
      const target = page.locator(`[data-artboard-id="${artboard.id}"]`);
      await target.waitFor({ state: "visible", timeout: 15_000 });
      await target.screenshot({ path });
      const box = await target.boundingBox();
      return { path, width: Math.round(box.width), height: Math.round(box.height), scale };
    },
    { scale },
  );
}

export async function measureArtboard(file, artboardId) {
  return withPage(buildDocumentHtml(file), async (page) =>
    page.evaluate((id) => {
      const el = document.querySelector(`[data-artboard-id="${id}"]`);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      // scrollHeight is the only honest content measurement when overflow is hidden.
      return { width: Math.round(rect.width), height: Math.round(rect.height), contentHeight: el.scrollHeight };
    }, artboardId),
  );
}

const DEFAULT_PROPS = [
  "display", "position", "width", "height", "top", "left", "color", "background-color",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border-radius", "gap", "flex-direction", "align-items", "justify-content", "opacity", "box-shadow",
];

export async function computedStyles(file, artboardId, nodeId, properties = DEFAULT_PROPS) {
  return withPage(buildDocumentHtml(file), async (page) => {
    const result = await page.evaluate(
      ({ nodeId, properties }) => {
        const el = document.querySelector(`[data-k1ng-id="${nodeId}"]`);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const out = {};
        for (const prop of properties) out[prop] = cs.getPropertyValue(prop);
        const rect = el.getBoundingClientRect();
        return {
          nodeId,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          styles: out,
        };
      },
      { nodeId, properties },
    );
    if (!result) throw new DesignError("not_rendered", `Node ${nodeId} is not present in the rendered artboard`);
    return result;
  });
}

export async function fontFamilyInfo(family) {
  return withPage("<!doctype html><html><body></body></html>", async (page) =>
    page.evaluate((family) => {
      const canvas = document.createElement("canvas").getContext("2d");
      const probe = "mmmmmmmmmmlli";
      const widthOf = (font) => {
        canvas.font = `72px ${font}`;
        return canvas.measureText(probe).width;
      };
      const baselines = { monospace: widthOf("monospace"), serif: widthOf("serif"), "sans-serif": widthOf("sans-serif") };
      const candidate = widthOf(`"${family}"`);
      const available = Object.values(baselines).some((base) => Math.abs(base - candidate) > 0.5);
      return {
        family,
        available,
        measuredWidth: Number(candidate.toFixed(2)),
        baselines: Object.fromEntries(Object.entries(baselines).map(([k, v]) => [k, Number(v.toFixed(2))])),
        note: available
          ? "Distinct metrics from the generic fallbacks: the family resolves in this renderer."
          : "Metrics match a generic fallback: the family is probably not installed; text will fall back.",
      };
    }, family),
  );
}
