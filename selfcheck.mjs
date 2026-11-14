#!/usr/bin/env node
/**
 * K1ng_design self-check.
 *
 * Drives the MCP server the way an agent would: spawn it over stdio, call tools,
 * then verify the claims against disk. A feature is done when this prints PASS n/n.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKDIR = path.join(here, ".selfcheck");
const results = [];

const ok = (name) => results.push({ name, pass: true });
const fail = (name, err) => results.push({ name, pass: false, err: err?.message ?? String(err) });

async function check(name, fn) {
  try {
    await fn();
    ok(name);
    process.stdout.write(`ok   ${name}\n`);
  } catch (err) {
    fail(name, err);
    process.stdout.write(`FAIL ${name}\n     ${err?.message ?? err}\n`);
  }
}

const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

async function main() {
  await fs.rm(WORKDIR, { recursive: true, force: true });
  await fs.mkdir(WORKDIR, { recursive: true });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(here, "src", "server.js")],
    env: { ...process.env, K1NG_DESIGN_DIR: path.join(WORKDIR, "designs") },
    stderr: "ignore",
  });
  const client = new Client({ name: "k1ng-selfcheck", version: "1.0.0" });
  await client.connect(transport);

  const call = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.find((c) => c.type === "text")?.text ?? "{}";
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { isError: Boolean(res.isError), data };
  };

  const expectOk = async (name, args) => {
    const { isError, data } = await call(name, args);
    if (isError) throw new Error(`${name} returned ${data.code}: ${data.message}`);
    return data;
  };

  await check("server initializes as k1ng_design", async () => {
    const info = client.getServerVersion();
    assert(info?.name === "k1ng_design", `unexpected server name ${info?.name}`);
  });

  let fileId, artboardId, cardId, titleId, bodyId, childId;

  await check("tools/list exposes a schema for every tool", async () => {
    const { tools } = await client.listTools();
    assert(tools.length >= 30, `expected 30+ tools, got ${tools.length}`);
    for (const tool of tools) {
      assert(tool.inputSchema?.type === "object", `${tool.name} has no input schema`);
      assert(tool.description?.length > 10, `${tool.name} has no real description`);
    }
  });

  await check("create_file writes JSON to disk", async () => {
    const data = await expectOk("create_file", { name: "Self check" });
    fileId = data.fileId;
    const onDisk = await fs.readFile(path.join(WORKDIR, "designs", `${fileId}.json`), "utf8");
    assert(JSON.parse(onDisk).id === fileId, "file on disk does not match returned id");
  });

  await check("create_artboard validates size", async () => {
    const data = await expectOk("create_artboard", { fileId, name: "Desktop", width: 1440, height: 900 });
    artboardId = data.artboardId;
    const bad = await call("create_artboard", { fileId, width: 0, height: 900 });
    assert(bad.isError && bad.data.code === "invalid_input", "bad size was accepted");
  });

  await check("write_html assigns unique ids", async () => {
    const data = await expectOk("write_html", {
      fileId,
      artboardId,
      html: `<div style="padding:24px" data-k1ng-name="Card"><h1>Hello</h1><p>Body copy</p></div>`,
    });
    assert(data.nodeIds.length === 3, `expected 3 new ids, got ${data.nodeIds.length}`);
    assert(new Set(data.nodeIds).size === 3, "ids are not unique");
    cardId = data.nodeIds[0];
    titleId = data.nodeIds[1];
    bodyId = data.nodeIds[2];
  });

  await check("update_styles touches one node only", async () => {
    await expectOk("update_styles", { fileId, artboardId, nodeId: titleId, styles: { fontSize: 32, color: "#112233" } });
    const title = await expectOk("get_node_info", { fileId, artboardId, nodeId: titleId });
    const body = await expectOk("get_node_info", { fileId, artboardId, nodeId: bodyId });
    assert(title.style.includes("font-size: 32px"), `title style missing: ${title.style}`);
    assert(!body.style.includes("font-size"), "sibling was modified");
  });

  await check("set_text_content keeps element children", async () => {
    await expectOk("set_text_content", { fileId, artboardId, nodeId: cardId, text: "Card heading" });
    const info = await expectOk("get_node_info", { fileId, artboardId, nodeId: cardId });
    assert(info.text.startsWith("Card heading"), `text not replaced: ${info.text}`);
    assert(info.children === 2, "children were destroyed");
  });

  await check("get_computed_styles returns real browser values", async () => {
    await expectOk("update_styles", { fileId, artboardId, nodeId: cardId, styles: { width: "100px", backgroundColor: "#ff0000" } });
    const data = await expectOk("get_computed_styles", { fileId, artboardId, nodeId: cardId });
    assert(data.styles.width === "100px", `width was ${data.styles.width}`);
    assert(data.styles["background-color"].replace(/\s/g, "") === "rgb(255,0,0)", `colour was ${data.styles["background-color"]}`);
  });

  await check("get_screenshot writes a real PNG", async () => {
    const data = await expectOk("get_screenshot", { fileId, artboardId });
    const bytes = await fs.readFile(data.path);
    assert(bytes.length > 1024, `png is too small: ${bytes.length}`);
    const magic = bytes.subarray(0, 8).toString("hex");
    assert(magic === "89504e470d0a1a0a", `not a png: ${magic}`);
  });

  await check("get_jsx exports a component with style objects", async () => {
    const data = await expectOk("get_jsx", { fileId, artboardId, componentName: "Desktop" });
    assert(data.jsx.includes("export default function Desktop()"), "no component");
    assert(data.jsx.includes("style={{"), "no style object");
    assert(data.jsx.includes("<h1"), "no h1");
  });

  await check("unknown node returns not_found, not a crash", async () => {
    const res = await call("get_node_info", { fileId, artboardId, nodeId: "n_missing" });
    assert(res.isError, "missing node did not error");
    assert(res.data.code === "not_found", `code was ${res.data.code}`);
  });

  await check("duplicate_nodes creates fresh ids", async () => {
    const data = await expectOk("duplicate_nodes", { fileId, artboardId, nodeIds: [cardId] });
    assert(data.created.length >= 3, `expected 3+ copies, got ${data.created.length}`);
    assert(!data.created.includes(cardId), "copy reused the original id");
    childId = data.created[0];
  });

  await check("move_nodes reparents a node", async () => {
    await expectOk("move_nodes", { fileId, artboardId, nodeIds: [bodyId], toParentId: cardId, index: 0 });
    const children = await expectOk("get_children", { fileId, artboardId, parentId: cardId });
    assert(children.children[0].id === bodyId, `first child was ${children.children[0].id}`);
  });

  await check("delete_nodes removes a subtree", async () => {
    const before = (await expectOk("get_tree_summary", { fileId, artboardId })).outline.length;
    await expectOk("delete_nodes", { fileId, artboardId, nodeIds: [childId] });
    const after = (await expectOk("get_tree_summary", { fileId, artboardId })).outline.length;
    assert(after < before, `tree did not shrink: ${before} -> ${after}`);
  });

  await check("find_nodes locates text", async () => {
    const data = await expectOk("find_nodes", { fileId, artboardId, text: "Body copy" });
    assert(data.count >= 1, "did not find the body copy");
  });

  await check("get_tree_summary returns an outline", async () => {
    const data = await expectOk("get_tree_summary", { fileId, artboardId });
    assert(data.outline.length >= 3, "outline too short");
    assert(data.outline[0].includes("div"), "outline does not start with a div");
  });

  await check("export_html returns a standalone document", async () => {
    const data = await expectOk("export_html", { fileId, artboardId });
    assert(data.html.startsWith("<!doctype html>"), "missing doctype");
    assert(data.html.includes("--primary"), "tokens not applied");
  });

  await check("tokens read and write", async () => {
    await expectOk("set_tokens", { fileId, tokens: { colors: { primary: "#0044ff" } } });
    const data = await expectOk("get_tokens", { fileId });
    assert(data.tokens.colors.primary === "#0044ff", "colour token not saved");
    assert(data.tokens.colors.text, "other colours were lost");
  });

  await check("get_guide returns design sections", async () => {
    const data = await expectOk("get_guide", {});
    assert(data.guide.includes("## 2. Palette discipline"), "palette section missing");
    assert(data.guide.includes("## 3. Type scale"), "type section missing");
    const one = await expectOk("get_guide", { topic: "spacing" });
    assert(one.guide.includes("## 4. Spacing"), "topic filter failed");
    assert(one.guide.length < data.guide.length, "topic filter returned everything");
  });

  await check("design-guide resource is readable", async () => {
    const list = await client.listResources();
    assert(list.resources.some((r) => r.uri === "k1ng-design://guide"), "resource not advertised");
    const read = await client.readResource({ uri: "k1ng-design://guide" });
    assert(read.contents[0].text.includes("## 1. Workflow"), "resource body missing");
  });

  await check("fit-content grows past the declared height", async () => {
    const fit = await expectOk("create_artboard", { fileId, name: "Fit", width: 400, height: "fit-content" });
    await expectOk("write_html", {
      fileId,
      artboardId: fit.artboardId,
      html: `<div style="height:900px">Tall content</div>`,
    });
    const done = await expectOk("finish_working_on_nodes", { fileId, artboardId: fit.artboardId });
    assert(done.measured.height >= 900, `measured height was ${done.measured.height}`);
  });

  await check("finish_working_on_nodes reports overflow", async () => {
    const tight = await expectOk("create_artboard", { fileId, name: "Tight", width: 400, height: 100 });
    await expectOk("write_html", { fileId, artboardId: tight.artboardId, html: `<div style="height:400px">Overflow</div>` });
    const done = await expectOk("finish_working_on_nodes", { fileId, artboardId: tight.artboardId });
    assert(done.overflow > 0, `overflow was ${done.overflow}`);
  });

  await client.close();

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  process.stdout.write(`\n${passed === total ? "PASS" : "FAIL"} ${passed}/${total}\n`);
  if (passed !== total) {
    for (const r of results.filter((x) => !x.pass)) process.stdout.write(`\n  ${r.name}\n  ${r.err}\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
