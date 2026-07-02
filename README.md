# AI Usage

A userscript that adds **pace dividers** to AI coding tool usage pages, helping you visualize whether you're on track with your weekly quota.

## Supported Sites

| Site | URL | Fill Meaning |
|------|-----|-------------|
| Codex | `chatgpt.com/codex/cloud/settings/analytics` | Remaining (green) |
| Claude | `claude.ai/settings/usage` | Used (blue) |
| Kimi Code | `www.kimi.com/code/console` | Used |

## What It Does

The script detects usage progress bars on each site and renders a vertical **pace marker** showing where your usage *should* be based on elapsed time in the current usage window (weekly or short-term, e.g. 5-hour).

Hover over the marker to see the expected remaining percentage.

Every detected bar gets its own toggle in the userscript manager menu (Tampermonkey/Violentmonkey icon → script menu). All markers are enabled by default; toggles persist per site.

## Install

### From Greasy Fork

- [AI Usage on Greasy Fork](https://greasyfork.org/en/scripts/566344-ai-usage)

### From GitHub (manual)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or another userscript manager
2. Click the raw link to install: [ai-usage-userscript.user.js](https://raw.githubusercontent.com/eigenigma/ai-usage-userscript/main/dist/ai-usage-userscript.user.js)

## Development

Requires [Bun](https://bun.sh/).

```bash
bun install
bun run dev       # dev build with watch
bun run build     # production build → dist/ai-usage-userscript.user.js
bun run lint      # lint check (Biome)
bunx tsc --noEmit # type check
```

## How It Works

1. Detects usage progress bars via site-specific CSS selectors
2. Parses reset timestamps from card text (absolute, day-time, time-only, or relative formats)
3. Infers window duration from card labels (weekly, N-hour usage limits, current session)
4. Computes expected remaining ratio based on elapsed time
5. Renders an absolutely-positioned divider on the progress bar track
6. Auto-refreshes via `MutationObserver`, periodic timer, and visibility events

Bars whose window duration cannot be determined (e.g., Kimi's rate limit details) get no marker, since there is no cycle to pace against.

## License

[MIT](LICENSE)
