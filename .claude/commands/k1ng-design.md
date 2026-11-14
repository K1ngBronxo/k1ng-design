---
description: Design a UI with K1ng_design (artboards, screenshots, JSX)
argument-hint: <what to design>
---

Design this with the `k1ng_design` tools: $ARGUMENTS

Follow the loop, do not skip steps:

1. Read the `k1ng-design://guide` resource (or call `get_guide`).
2. Reply with a short brief: 5-colour palette with hex values, type scale ratio and steps, spacing
   base, one visual direction sentence.
3. `create_file`, then `create_artboard` at a real device size (1440x900 desktop, 834x1112 tablet,
   390x844 mobile; `height: "fit-content"` for long pages).
4. `write_html` one visual group at a time.
5. `get_screenshot` after each group and actually look at the PNG. Fix what is wrong.
6. `get_computed_styles` for any number you need. Never measure from a screenshot.
7. `finish_working_on_nodes` to check overflow.
8. `get_jsx` and `export_html` at the end.

Do not claim an artboard, screenshot or export exists without the tool result that shows its path.
