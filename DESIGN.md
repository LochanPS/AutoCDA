# AutoCDA design system

Product register. One typeface, restrained color, precise numbers, familiar structure. Tokens live in `src/App.css` under `:root`; components consume the CSS variables, never raw hex.

## Color

Restrained: tinted-neutral surfaces plus a single indigo accent. Neutrals are tinted toward a cool slate hue so nothing is pure gray or pure black. Semantic colors carry meaning only (never decoration).

| Token | Value | Role |
|---|---|---|
| `--bg` | `#f7f8fa` | app canvas |
| `--surface` | `#ffffff` | cards, panels |
| `--surface-2` | `#f1f3f6` | insets, toolbars, tab track |
| `--border` | `#e3e7ec` | hairlines |
| `--border-strong` | `#cfd6de` | dividers, scrollbar |
| `--text` | `#161b22` | primary text |
| `--text-2` | `#5a6472` | secondary |
| `--text-3` | `#8b95a3` | muted, captions |
| `--accent` | `#4557d6` | primary action, selection |
| `--accent-hover` | `#3646c0` | accent hover |
| `--accent-soft` | `#e6e9fb` | accent tint bg |
| `--success` | `#1a7f4b` | verified |
| `--success-soft` | `#daf1e4` | verified tint |
| `--warn` | `#8a6100` | best-effort, assumptions |
| `--warn-soft` | `#fbf0d3` | warn tint |
| `--danger` | `#c3352b` | errors |

Contrast: body and label text meets WCAG AA on its background. Never gray text on a colored fill; use a darker shade of that hue.

## Typography

One family: **Inter** (via Google Fonts, `font-display: swap`), system sans fallback. **JetBrains Mono** only for machine values: component values, netlists, the build log. Numbers that align use `font-variant-numeric: tabular-nums`.

Fixed rem scale, ratio ~1.2:

| Token | Size | Use |
|---|---|---|
| `--fs-display` | 1.75rem (28px) | empty-state headline |
| `--fs-h1` | 1.3125rem (21px) | result title |
| `--fs-h2` | 1.0625rem (17px) | section headers |
| `--fs-body` | 0.875rem (14px) | body, controls |
| `--fs-sm` | 0.8125rem (13px) | secondary |
| `--fs-xs` | 0.75rem (12px) | captions, labels |

Weights: 400 body, 500 controls, 600 labels and headers, 700 titles and key numbers. Uppercase micro-labels use 0.04em tracking; nothing else is uppercased.

## Space and shape

4px base scale (4, 8, 12, 16, 20, 24, 32). Radius: `--r-sm` 8px (controls), `--r` 12px (cards), `999px` (pills). Elevation is restrained: `--shadow-sm` for resting cards, `--shadow-md` for the confirm card only.

## Components

- **Button**: primary (accent fill, white text), secondary (surface, border), ghost (text only). All have hover, focus-visible ring (`0 0 0 3px --accent-soft`), active, disabled. Min height 36px.
- **Input / select**: surface-inset fill, border, focus ring. 14px text, 40px height.
- **Chip / pill**: 999px radius, used for examples, tabs, and status.
- **Tabs**: segmented control on a `--surface-2` track; active tab is a raised `--surface` pill.
- **Stat**: uppercase xs caption over a 600/700 tabular number.
- **Status badge**: colored dot plus label; success or warn or neutral. No check-mark glyphs in text; icons are inline SVG from one 1.5px-stroke line set.

## Icons

One family: inline SVG, 1.5px stroke, `currentColor`, 16px default. No emoji anywhere in product chrome. Check, alert-triangle, info, chevron, and the brand mark are the only glyphs.

## Motion

150 to 220ms, ease-out (`cubic-bezier(0.22, 1, 0.36, 1)`). Transitions convey state only. One gentle fade-up when a result arrives. Respect `prefers-reduced-motion: reduce`.
