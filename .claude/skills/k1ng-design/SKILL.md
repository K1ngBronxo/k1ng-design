---
name: k1ng-design
description: Design real user interfaces with the K1ng_design MCP server — artboards, HTML, exact computed styles, screenshots and JSX export. Use when asked to design, redesign, mock up, lay out, or build a UI, page, screen, landing page, dashboard, component or design system, or to turn a design into React code. Works with no design app installed.
---

# K1ng_design

You are the editor. Chrome is the renderer. There is no canvas, so the only way to know what you
built is to ask the browser.

Tools are prefixed `k1ng_design`. If they are not in your tool list, the MCP server is not
connected — say so once and stop; do not fake a design.

## The loop

1. `get_guide` — once per session. If the client exposes resources, read `k1ng-design://guide` instead.
2. Generate a **brief** before any markup: palette (5 hex), type scale (ratio + 8 steps), spacing
   base, one visual direction, one reference feeling. Write it in your reply. No brief, no artboard.
3. `create_file` → note the `fileId`.
4. `create_artboard` at a **real device size**: desktop `1440x900`, tablet `834x1112`, mobile
   `390x844`. Use `height: "fit-content"` for long pages that must not clip.
5. `write_html` **one visual group at a time** — nav, hero, feature row, footer. Never the whole page
   in one call. Every element gets a `data-k1ng-id`; keep the ones you care about.
6. `get_screenshot` and **look at it**. Read the PNG. Fix what is wrong. Repeat until it does not
   look like a template.
7. `get_computed_styles` whenever you need a number. Never estimate from a screenshot.
8. `finish_working_on_nodes` before claiming the artboard is done. It reports overflow.
9. `get_jsx` for the deliverable, `export_html` for a standalone preview.

## Rules that keep output from looking generated

- One background, one surface, one text, one muted, one accent. The accent is for the primary action
  only. If everything is accented, nothing is.
- Body text on background clears 4.5:1 — check the real hex values.
- Type scale: one ratio (1.125 dense, 1.25 marketing), max 8 steps, body 16px / 1.5, headings
  1.1–1.2 line-height with negative tracking above 32px.
- Spacing on a 4px base. Section gaps 64–96, group gaps 24, label-to-value 4. If two gaps are within
  2px, make them equal.
- One focal point per section. One elevation level, not shadows everywhere.
- Lines of body copy are not centred. Nothing is smaller than 12px.
- Real names and real numbers in the design. No `Lorem ipsum`, no "Feature 1".
- Sentence case for headings and buttons. Buttons say what happens: "Save changes", not "Submit".
- Fixed-width slots (`flex-shrink: 0`) for list icons and trailing actions — gap alone will not align
  columns across rows.
- When unsure, add space rather than a decoration.

## Tool cheat sheet

| Need | Tool |
|---|---|
| New document | `create_file` |
| Find a document again | `list_files`, then `open_file` |
| Artboard | `create_artboard` / `update_artboard` |
| Put markup in | `write_html` (append; `parentId` and `index` to place) |
| Restyle a node | `update_styles` (merge; `null` removes a property; numbers become `px`) |
| Change copy | `set_text_content` (keeps element children) |
| Find something | `find_nodes` by tag, layer name or text |
| Structure | `get_tree_summary`, `get_children`, `get_node_info`, `get_basic_info` |
| Copy / move / remove | `duplicate_nodes`, `move_nodes`, `delete_nodes` |
| Label a layer | `rename_nodes` |
| Look at it | `get_screenshot` |
| Measure it | `get_computed_styles` |
| Check a font | `get_font_family_info` — measured, not guessed |
| Design tokens | `get_tokens` / `set_tokens` |
| Done gate | `finish_working_on_nodes` |
| Ship | `get_jsx`, `export_html` |

## Done is a claim

Do not say an artboard is finished, a screenshot exists, or a component was exported without the tool
result that shows it. A `get_screenshot` call is not proof you looked at it — open the path and judge
the image. A `get_jsx` call is not proof it compiles — read the output.

Report back with: the palette you chose, what each section does, the screenshot path, and the export
path. One short paragraph, not a wall.

## Failure modes

- Tools missing → the MCP server is not connected. Say that and stop.
- `renderer_unavailable` → Chrome is not installed or `K1NG_CHANNEL` is wrong. Say that and stop.
- Files landing in an unexpected place → set `K1NG_DESIGN_DIR` to the directory you want.
- `not_found` on a node id → it was deleted or replaced by `set_text_content`; re-read the tree with
  `get_tree_summary` rather than guessing.
