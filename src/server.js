#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./tools.js";
import { GUIDE } from "./guide.js";
import { closeBrowser } from "./render.js";
import { DesignError, invalid } from "./errors.js";

export const SERVER_NAME = "k1ng_design";
export const SERVER_VERSION = "1.0.0";

const INSTRUCTIONS = `K1ng_design is a design tool driven by tools, not by a GUI. A real Chrome renders the artboards, so layout and computed styles are exact.

Workflow: get_guide (once) -> create_file -> create_artboard at a real device size -> write_html one visual group at a time -> get_screenshot and actually look at it -> get_computed_styles when you need numbers (never measure from a screenshot) -> get_jsx to ship.

Rules:
- Every element written through write_html gets a stable data-k1ng-id. Use it for update_styles, set_text_content, move_nodes, delete_nodes.
- Screenshots are for review. get_computed_styles is the source of truth for measurements.
- finish_working_on_nodes before claiming an artboard is done.
- Never claim a file, screenshot or export exists without the tool result that shows its path.`;

function validate(tool, args) {
  const required = tool.inputSchema.required ?? [];
  for (const key of required) {
    if (args[key] === undefined || args[key] === null) {
      throw invalid(`missing required argument: ${key}`, { tool: tool.name, required });
    }
  }
}

const asErrorPayload = (err) => {
  if (err instanceof DesignError) return { code: err.code, message: err.message, details: err.details ?? null };
  return { code: "internal_error", message: err?.message ?? String(err) };
};

export function createServer() {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ code: "unknown_tool", message: `No such tool: ${request.params.name}` }) }],
      };
    }
    const args = request.params.arguments ?? {};
    try {
      validate(tool, args);
      const result = await tool.handler(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        ...(result && typeof result === "object" ? { structuredContent: result } : {}),
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify(asErrorPayload(err), null, 2) }] };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "k1ng-design://guide",
        name: "design-guide",
        description: "Design guide: workflow, palette, type scale, spacing, layout, components, writing, stop conditions.",
        mimeType: "text/markdown",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== "k1ng-design://guide") {
      throw invalid(`unknown resource: ${request.params.uri}`);
    }
    return { contents: [{ uri: request.params.uri, mimeType: "text/markdown", text: GUIDE }] };
  });

  return server;
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const shutdown = async () => {
    await closeBrowser();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("k1ng_design failed to start:", err);
  process.exit(1);
});
