# Quibillix design system: "Refraction"

Code is the source of truth (`src/app/globals.css`). The Figma file mirrors it:
[Quibillix: Refraction design system](https://www.figma.com/design/thQX73NST1juADzSrA88xB), with
46 variables (Primitives → Semantic aliases, WEB code syntax = the CSS variable), 13 text styles and a
bound `Button` component set (Primary / Ghost × Default / Hover / Disabled).

## The idea

> On this screen, **the bill itself** becomes **a beam of white light that the audit splits**.

The hero acts it out once in 3D (`fx/BillJourney3D.tsx`, CSS 3D, no WebGL): a bill arrives, a scanner
checks each line, the wrong lines lift off as evidence cards, you approve them, a letter is drafted from
the approved items only, and the refund comes back. Six steps, auto-playing, clickable, pointer-tilted;
reduced motion holds a single frame. Everywhere else the idea shows up as *where colour is allowed*: a bill line
is neutral until the audit says what it is, then it takes exactly one hue. The bill and the letter are
paper (`--paper`), because both are real documents.

## Mode

An app screen (Taste Skill `app-screens.md`; Impeccable "Operate"). The hero is the one page-style moment.
Ambition shows as precision: one grotesk, flat surfaces, colour on data, figures ≤ 40px.

## Colour: one job each

| Token | Hex | Job |
| --- | --- | --- |
| `--ink` | #080C18 | ground |
| `--carbon` | #111A2B | panel (one tone step up) |
| `--raised` | #182338 | nested / hover |
| `--steel` / `--edge` | #26334A / #34445F | rules / control outlines (1px, app allowance) |
| `--frost` / `--mist` / `--dim` | #F4F7FF / #A4B0C7 / #8794AD | text tiers, all ≥ 4.5:1 on panel |
| `--glacier` | #20E3CE | **the action** and the selection line, nothing else |
| `--coral` | #FF718D | confirmed error |
| `--warn` | #FFC66D | suspected overcharge |
| `--cobalt` | #477BFF | evidence: sources, "needs itemising" (hatched) |
| `--uv` | #B66CFF | the agent: model names and AI provenance only |
| `--mint` | #85F2AE | money recovered, steps done |

The brand palette was pinned by the client and kept. UI UX Pro Max proposed gold + violet; it was
rejected in favour of the brand, but its "avoid AI purple/pink gradients" note was adopted: violet is
a data label, never a fill or a glow. A zero is never coloured.

## Type

IBM Plex Sans for everything (UI UX Pro Max's fintech pairing: "financial, trustworthy"). IBM Plex
Mono only for IDs, billing codes, model names and the printed bill. Scale: 12 / 14 / 15 / 16 / 18 /
22 / 24 / 40, plus 56 (34 on a phone) for the hero only. Tabular figures on every number.

## Surfaces and shape

No shadows at rest, no glass, no glow, no gradients (the brand spectrum appears once, on the progress
rail, meaning "light has passed through this step"). Radius: card 12, control 8, chip 4.

## Motion (Emil Kowalski + Taste Skill motion)

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for everything entering or responding.
- Buttons press to `scale(0.97)`; nothing enters from `scale(0)`; transitions name their properties.
- Entrances rise 16px with opacity, staggered 60ms, once.
- Signature move: the scan line reading the bill, then highlighter swipes landing on flagged lines.
- `prefers-reduced-motion`: travel removed, fades kept.

## Rules this project keeps

No eyebrows, no 01/02/03, no tracked uppercase labels, no emoji, no invented proof (every figure on the
hero comes from `eval/results.json`; every caught charge in the hero 3D journey is from a bundled sample
bill). Every section opens with a heading that names it.

## Checks

- `node <taste-skill>/scripts/lint.mjs src`: 0 FAIL. Each kept exception carries a
  `taste-skill-ignore: <reason>` comment.
- `node <taste-skill>/scripts/inspect.mjs <prod url> --app`: 0 FAIL at 1440 / 768 / 390.
