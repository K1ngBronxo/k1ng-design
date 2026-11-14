export const GUIDE = `# K1ng_design — design guide

Read this once before your first artboard. It is the difference between a layout that
renders correctly and a layout a human would actually ship.

## 1. Workflow
1. \`create_file\` → \`create_artboard\` at a real size (desktop 1440x900, tablet 834x1112, mobile 390x844).
2. Generate a brief first: palette, type scale, spacing, one visual direction. Do not skip this.
3. \`write_html\` one visual group at a time (nav, hero, feature row, footer). Never the whole page at once.
4. \`get_screenshot\` after each group. Look at it. Fix it. Repeat.
5. \`get_computed_styles\` when you need a number. Never measure from a screenshot.
6. \`get_jsx\` at the end. It is the deliverable.

## 2. Palette discipline
- One background, one surface, one text, one muted, one accent. That is five.
- Accent is for the primary action only. If everything is the accent, nothing is.
- Contrast: body text on background must clear 4.5:1. Check with real hex values, not vibes.
- Dark mode is a second palette, not an inverted first one. Surfaces step up, not down.

## 3. Type scale
- Pick a ratio and stay on it: 1.125 (dense UI) or 1.25 (marketing).
- 8 steps maximum: 12, 14, 16, 20, 24, 32, 48, 64.
- Body 16px, line-height 1.5. Headings 1.1–1.2 line-height, negative letter-spacing above 32px.
- Two families maximum: one for headings, one for body. One is also fine.
- Never center more than three lines of body copy.

## 4. Spacing
- 4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Space between a label and its value: 4. Between groups: 24. Between sections: 64 or 96.
- Padding inside a card: 24. Radius: 10 for cards, 6 for inputs, 999 for pills.
- If two gaps are within 2px of each other, make them equal. Eyes catch inconsistency instantly.

## 5. Layout
- Desktop: 12 columns, 1440 frame, 80px margins, 24px gutters, max content 1200.
- Mobile: 390 frame, 16px margins, single column.
- Align to a shared left edge. A hero headline, the nav, and the footer should share it.
- One visual anchor per section: image, headline, or number. Not all three at equal weight.
- Vertical rhythm beats clever composition. When unsure, add space.

## 6. Components
- Buttons: one primary per view, height 40–44, padding 0 16, radius 6–10.
- Inputs: 40–44 tall, 1px border, label above, helper text below, error in the accent-adjacent red.
- Cards: surface colour, 1px border or soft shadow, never both heavy.
- Lists: fixed-width slots for icons and trailing actions (\`flex-shrink: 0\`). Gap alone will not align columns across rows.

## 7. Writing
- Sentence case for headings and buttons. No ALL CAPS except 12px labels with 0.08em tracking.
- Buttons say what happens: "Save changes", not "Submit".
- Placeholders are examples, never labels. A label above the field always.
- Numbers and names are real in the design, not "Lorem ipsum".

## 8. Stop conditions
- The artboard is done when: one clear focal point, no element touching an edge without intent,
  everything visible without scrolling past the fold unless it is a long page, and the screenshot
  does not look like a template.

## 9. Failure modes to avoid
- Purple gradient on white with three feature cards and a floating blob. That is a template, not a design.
- Every section the same height and rhythm. Vary density deliberately.
- Text smaller than 12px. Icons without labels where a label would help.
- Shadows on everything. Pick one elevation level and stay there.
`;

export const GUIDE_TOPICS = {
  workflow: "## 1. Workflow",
  palette: "## 2. Palette discipline",
  type: "## 3. Type scale",
  spacing: "## 4. Spacing",
  layout: "## 5. Layout",
  components: "## 6. Components",
  writing: "## 7. Writing",
  quality: "## 8. Stop conditions",
};

export function guideSection(topic) {
  if (!topic) return GUIDE;
  const heading = GUIDE_TOPICS[String(topic).toLowerCase()];
  if (!heading) return GUIDE;
  const start = GUIDE.indexOf(heading);
  if (start === -1) return GUIDE;
  const next = GUIDE.indexOf("\n## ", start + heading.length);
  return next === -1 ? GUIDE.slice(start) : GUIDE.slice(start, next + 1);
}
