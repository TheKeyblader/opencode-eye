# opencode-eye

An animated eye for [OpenCode Desktop](https://opencode.ai) that shows what the AI is doing. It lives in a tab of the
session's side panel and reacts to everything the agent does: it thinks with a thought bubble, reads with a magnifier,
writes with a pencil, stares at the terminal, waits for your approval, falls asleep while the conversation compacts,
rolls its eye when a tool fails and cheers when the run is done.

It is a companion, not a loading spinner.

![The eye's 18 states and 3 modifiers](docs/states.png)

## Requirements

- OpenCode Desktop **2.2.0** or later (the plugin uses the experimental GUI plugin API).
- [Bun](https://bun.sh) to build it.

## Install

```sh
git clone https://github.com/TheKeyblader/opencode-eye.git
cd opencode-eye
bun install
bun run build
```

Then add the folder to the `plugins` of your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugins": ["/path/to/opencode-eye"]
}
```

Restart OpenCode Desktop.

## Use

- Open the eye from the session's panel menu, or with <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>E</kbd> (the command
  _Toggle the eye_).
- Click the eye: it blinks twice and opens a card with the tool in flight, how long the current state has lasted and
  the latest transitions. Click again, press <kbd>Esc</kbd> or <kbd>×</kbd> to close it.
- **Settings › Eye**: size (automatic at 60 % of the panel, or 80 to 300 px), eyebrow, line width, outline and error
  colors (the app's theme by default), reduced motion, an icon for each MCP server, and a gallery of every state.

The plugin speaks English and French, following the app's language.

## States

| State | When | What the eye does |
|---|---|---|
| `idle` | Nothing running | Follows the pointer and blinks; wanders when you are away |
| `think` | A run, a step or reasoning starts | Looks up, side to side, with a thought bubble |
| `respond` | The answer is being written | A speech bubble fills up |
| `read` | read, grep, glob, search, list… | A magnifier goes over a sheet; the eye follows it |
| `write` | patch, edit, write… | A pencil draws lines; the eye follows its tip |
| `shell` | shell, bash, terminal | Stares at a scrolling terminal, narrow pupil |
| `delegate` | subagent, task | Watches a little eye at work |
| `web` | webfetch, websearch | Looks far away, over a spinning globe |
| `plan` | todowrite, todoread | Ticks a checklist box by box |
| `generic` | Any other tool (MCP, `execute`…) | Follows a jumping puzzle piece |
| `attention` | An approval or a question waits | Stares at you, pulsing halo, hanging “?” |
| `sleep` | The conversation compacts | The lid closes over a breathing pillow |
| `error-flash` | A tool failed | Rolls its eye for 1.5 s, then carries on |
| `error` | A step or the compaction failed | Rolls its eye until the next step (or compaction) |
| `error-spiral` | The run failed | Spiral until the next prompt |
| `happy` | The run succeeded | “^” and confetti |
| `vexed` | You declined an approval or stopped the run | Side glance, heavy lid |
| `surprised` | You come back after 30 s away | Raised brow |

Modifiers add to any state: **impatient** (a tool runs for more than 15 s: hourglass and sighs), **bored** (2 min at
rest: heavy lid) and **tired** (the context is over 80 % full: a cup of coffee).

With tools in parallel, the eye shows the most intense one (`write` > `shell` > `delegate` > `read` > `web` > `plan` >
`generic`) and the badge counts them. Each state shows for at least 400 ms, and the eye waits 250 ms before going from
a tool back to thinking, so chained tools do not flicker.

## Develop

```sh
bun run dev        # rebuild on change; reload OpenCode to pick it up
bun run test       # unit tests
bun run typecheck
bun run preview    # the eye outside OpenCode, at http://localhost:5173
```

The preview page takes query parameters: `?state=read`, `?grid` (every state), `?mode=light`, `?size=120`,
`?theme=tokyo`, `?reduced`, `?still=1500` (a still picture, for screenshots) and `?bare` (no controls).

| File | Role |
|---|---|
| `src/gui/window.tsx` | Setup: listens to the server, one state machine per session, the panel, settings, commands |
| `src/gui/adapt.ts` | Server events → the state machine's events |
| `src/gui/machine.ts` | The state machine: priorities, display stability, reactions, modifiers |
| `src/gui/engine.ts` | The animation engine: springs, gaze, blinks; writes CSS variables only |
| `src/gui/eye.tsx`, `eye.css` | The drawing and its states |
| `src/gui/panel.tsx`, `card.tsx` | The panel and the details card |
| `src/gui/settings.tsx` | The settings page |

The eye was designed with Claude Design: `SPEC.md` (in French) and `reference/` hold the validated mock-up the code
ports. The debug log (_Toggle the eye's event log_) records the server's events, to see what the eye reacts to.

## License

[MIT](LICENSE)
