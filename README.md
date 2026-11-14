# K1ng_design

**An MCP server that turns your coding agent into a UI designer. No app, no account, no canvas.**

Your agent writes HTML into an artboard, a real Chrome renders it, screenshots come back as PNGs, measurements come back as exact computed CSS, and the final result exports as JSX. Documents are plain JSON files on your disk.

```text
agent ──write_html──▶ artboard.json ──Chrome──▶ PNG + computed styles
                          │
                          └──get_jsx──▶ React component
```

---

## Why this exists

Design tools built for humans assume a human is dragging things. An agent does not need a canvas, a file browser, a comment thread or a cloud account. It needs five things: a place to put markup, a way to restyle one node, a renderer that tells the truth, a screenshot to review, and a clean export. That is the whole product.

- **No desktop app.** One stdio process.
- **No cloud.** Files live in `designs/` next to your repo.
- **No guessing.** Screenshots are for review; `get_computed_styles` is the source of truth.
- **No bundled browser.** It drives the Chrome you already have.

---

## Requirements

| Thing | Version |
|---|---|
| Node.js | 20 or newer |
| Google Chrome | any recent stable |
| OS | Windows, macOS, Linux |

---

## Install

```bash
git clone https://github.com/<you>/k1ng-design.git
cd k1ng-design
npm install
node selfcheck.mjs      # must print PASS 22/22
```

`npm install` does **not** download a browser. If the self-check fails with `renderer_unavailable`, Chrome is not installed — or it is somewhere unusual, in which case set `K1NG_CHANNEL` (see [Configuration](#configuration)).

The self-check drives the real server over stdio, calls the tools the way an agent would, and verifies every claim against disk. If it prints PASS, the thing works on your machine.

---

## Connect it to your agent

The server is `bin/k1ng-design.js`. **Always use an absolute path** — agents start processes from unpredictable working directories.

### Claude Code

```bash
claude mcp add k1ng_design -- node /absolute/path/to/k1ng-design/bin/k1ng-design.js
```

Or commit it for a whole project in `.mcp.json` at your repo root:

```json
{
  "mcpServers": {
    "k1ng_design": {
      "command": "node",
      "args": ["/absolute/path/to/k1ng-design/bin/k1ng-design.js"]
    }
  }
}
```

### Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "k1ng_design": {
      "command": "node",
      "args": ["/absolute/path/to/k1ng-design/bin/k1ng-design.js"]
    }
  }
}
```

Restart the app afterwards.

### Cursor

`.cursor/mcp.json` in the project, or the global equivalent:

```json
{
  "mcpServers": {
    "k1ng_design": {
      "command": "node",
      "args": ["/absolute/path/to/k1ng-design/bin/k1ng-design.js"]
    }
  }
}
```

### OpenCode

Add to `opencode.jsonc` (V2 `mcp.servers` shape):

```jsonc
{
  "mcp": {
    "servers": {
      "k1ng_design": {
        "type": "local",
        "command": ["node", "D:/path/to/k1ng-design/bin/k1ng-design.js"],
        "disabled": false
      }
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.k1ng_design]
command = "node"
args = ["/absolute/path/to/k1ng-design/bin/k1ng-design.js"]
```

### Anything else

Any client that speaks MCP over stdio works. Command: `node`, argument: the absolute path to `bin/k1ng-design.js`. No network port, no auth.

---

## Configuration

Both are optional environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `K1NG_DESIGN_DIR` | `./designs` | Where documents and screenshots are written. |
| `K1NG_CHANNEL` | `chrome` | Playwright Chromium channel — `chrome`, `msedge`, or `chromium`. |

Set `K1NG_DESIGN_DIR` when you want designs to land inside a specific repo instead of wherever the agent happens to be running.

---

## The tools

33 tools. Every element written through `write_html` gets a stable `data-k1ng-id` that the rest of the tools address.

**Files and pages**

| Tool | Does |
|---|---|
| `create_file` | New document, returns `fileId` |
| `list_files` | Every document, newest first |
| `open_file` | Overview: pages, artboards, tokens |
| `rename_file` | Rename a document |
| `delete_file` | Delete a document and its screenshots |
| `create_page` / `rename_page` / `arrange_pages` / `delete_page` | Page management |

**Artboards**

| Tool | Does |
|---|---|
| `create_artboard` | Real device sizes; height accepts `"fit-content"` |
| `update_artboard` | Rename or resize |
| `delete_artboard` | Remove an artboard |

**Nodes**

| Tool | Does |
|---|---|
| `write_html` | Append an HTML fragment, assign ids |
| `update_styles` | Merge CSS into one node (camelCase or kebab-case) |
| `set_text_content` | Replace text, keep element children |
| `duplicate_nodes` | Copy in place with fresh ids |
| `delete_nodes` | Remove subtrees |
| `move_nodes` | Reparent, optionally at an index |
| `rename_nodes` | Layer names for later calls |
| `find_nodes` | Search by tag, layer name, text |
| `get_node_info` / `get_children` | One node's facts, or one level of the tree |

**Inspect**

| Tool | Does |
|---|---|
| `get_basic_info` | File overview with measured artboard sizes |
| `get_tree_summary` | Indented outline of an artboard |

**Render**

| Tool | Does |
|---|---|
| `get_screenshot` | PNG of one artboard, path returned |
| `get_computed_styles` | Exact browser CSS + measured rect |
| `get_font_family_info` | Measured proof a font family resolves |
| `finish_working_on_nodes` | Measure, report overflow, gate the "done" claim |

**Ship**

| Tool | Does |
|---|---|
| `get_jsx` | React component with inline style objects |
| `export_html` | Standalone HTML document with tokens applied |

**Design system**

| Tool | Does |
|---|---|
| `get_tokens` / `set_tokens` | Colours, type scale, spacing, radius |
| `get_guide` | Design guide: palette, type, spacing, layout, writing, stop conditions |

`get_guide` is also exposed as the MCP resource `k1ng-design://guide`, so clients that support resources can read it without a tool call.

---

## Use it

Once connected, just talk:

> Design a pricing page for a developer tool. Three tiers, monthly/annual toggle, FAQ below. Desktop 1440 wide.

> Here is my current landing page component. Rebuild it as a mobile artboard at 390 wide and show me a screenshot.

> Export the hero artboard as JSX.

The server's own instructions push the agent through the loop that produces non-template output:

```text
get_guide → create_file → create_artboard (real device size)
  → write_html (one visual group at a time) → get_screenshot → look
  → get_computed_styles when a number is needed → fix → repeat
  → finish_working_on_nodes → get_jsx
```

---

## The skill

`/.claude/skills/k1ng-design/SKILL.md` teaches Claude the workflow, the tool cheat sheet and the quality bar, so it does not need to rediscover the order of operations every session. `/.claude/commands/k1ng-design.md` adds the slash command.

Clone this repo into a project and both are picked up automatically. For a global install:

```bash
mkdir -p ~/.claude/skills
cp -r .claude/skills/k1ng-design ~/.claude/skills/
```

Then:

```text
/k1ng-design a settings page with an avatar upload and two toggles
```

Other agents: paste the body of `SKILL.md` into your rules file (`AGENTS.md`, `.cursor/rules`, etc.). It is client-agnostic prose.

---

## What it does not do

Being honest about the edges is cheaper than discovering them twice.

- **No comments, no selection, no asset library, no folders in a sidebar.** Those are collaboration features that need a human in a canvas.
- **No PDF export.** Screenshots and HTML cover the review loop.
- **No layout engine.** Chrome does layout. That is the point.
- **No image generation or bundling.** Point `src` at a URL or a local file.
- **No cloud sync.** `cp -r designs/` is the sync.

---

## Layout

```
bin/k1ng-design.js      executable entry
src/server.js           MCP server, instructions, resource
src/tools.js            the 33 tool definitions and handlers
src/store.js            JSON documents on disk
src/nodes.js            HTML tree: ids, styles, moves, JSX
src/render.js           Playwright Chrome: screenshot, computed styles
src/guide.js            the design guide
selfcheck.mjs           the gate: PASS 22/22 or it is not done
designs/                your documents (gitignored)
.claude/                skill + slash command
```

---

## Development

```bash
node selfcheck.mjs        # the only gate that matters
node src/server.js        # run the server manually (stdio)
```

A feature is done when `selfcheck.mjs` proves it. Not before.

---

## Author

**K1ngBronxo** — [github.com/K1ngBronxo](https://github.com/K1ngBronxo)

## License

MIT — see [`LICENSE`](LICENSE).
