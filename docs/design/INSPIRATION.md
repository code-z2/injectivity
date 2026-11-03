# Design inspiration and tooling

Where to look, and how an agent reaches each source from this workspace.
Everything is installed project-local (nothing global).

## Brand / pattern references

| Source | What we take from it |
|---|---|
| [gloam.trade](https://gloam.trade) (light theme) | Inset rounded hero panel with a blurred, slowly drifting gradient field (low-res canvas + `blur(28px)`), light-weight display type (300, tight negative tracking), ink pill CTAs, frosted glass chips. |
| [talise.io](https://www.talise.io/) | Floating pill nav, centered display headline, dotted globe with arcs as the product metaphor, floating notification cards (white glass + ink) around the hero. |

## Component and motion sources

| Source | Access | Notes |
|---|---|---|
| landing.gallery | MCP `landing-gallery` (local scope) | Landing page pattern search. |
| 21st.dev | MCP `21st` (local scope, API key in `~/.claude.json` project entry) · `refs/21st-llms.txt` | React + Tailwind components; installs via shadcn CLI. |
| Kokonut UI | `refs/kokonutui-llms.txt`, `refs/kokonutui-setup.md` | Each entry links to a `.md` with full source. `bunx --bun shadcn@latest add @kokonutui/<name>`. |
| Coded Visuals | skill `codedvisuals` (`.claude/skills/codedvisuals`) · `refs/codedvisuals-llms.txt` | Animated visuals catalog; registry needs a token (see skill). |
| transitions.dev | skills `transitions-dev`, `transitions-polish` (`.claude/skills/`) | Motion recipes (menu dropdown, modal, panel reveal, thinking states, text morph, shake). |
| motionin.design | `refs/motionin-llms.txt` | Paid physics sections; reference only. |
| reverseui.com | web only (no llms.txt) | Premium animated components; reference only. |

The web app (`web-next/`) has a `components.json`, so shadcn-registry
components from Kokonut / 21st / Coded Visuals install straight into
`src/components/ui`.

MCP servers added mid-session only load after the Claude Code session
restarts.
