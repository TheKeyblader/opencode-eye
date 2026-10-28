import { createSignal, For, Show } from "solid-js"
import { render } from "solid-js/web"
import { Eye } from "../src/gui/eye"
import { GALLERY, modsOf } from "../src/gui/gallery"
import type { Stroke } from "../src/gui/palette"
import { setVisible, usePanel } from "./plugin-gui"
import css from "../src/gui/eye.css?inline"

// The app's theme variables for Tokyo Night, as the app computed them.
const TOKYO: Record<string, string> = {
  "--surface-brand-base": "#3d73f7",
  "--text-strong": "#f9faff",
  "--icon-base": "#7b809f",
  "--background-base": "#0d0e17",
  "--surface-raised-stronger-non-alpha": "#13141e",
}

function App() {
  const params = new URLSearchParams(location.search)
  const [key, setKey] = createSignal(params.get("state") ?? "idle")
  const [mode, setMode] = createSignal<"light" | "dark">(params.get("mode") === "light" ? "light" : "dark")
  const [size, setSize] = createSignal(Number(params.get("size") ?? 180))
  const stroke = (params.get("stroke") ?? "normal") as Stroke
  const reduced = params.has("reduced")
  const { visible } = usePanel()
  // ?theme=tokyo sets the theme variables, as the app does; without it, the mock-up's fallbacks show.
  const tokyo = params.get("theme") === "tokyo"
  // ?still=<ms> draws the picture reached that far into each state, for screenshots.
  const still = params.has("still") ? Number(params.get("still") || 1500) : undefined
  const item = () => GALLERY.find((entry) => entry.key === key()) ?? GALLERY[0]!
  const eye = (entry: (typeof GALLERY)[number]) => (
    <Eye
      state={entry.state}
      tool={!!entry.tool}
      mods={modsOf(entry)}
      size={size()}
      theme={mode()}
      brow={!params.has("nobrow")}
      stroke={stroke}
      colors={{ contour: "", error: "" }}
      reduced={reduced}
      visible={visible}
      still={still}
      badge={
        <Show when={entry.tool}>
          <div class="eye-badge">
            <span>{entry.tool}</span>
          </div>
        </Show>
      }
    />
  )

  return (
    <main
      style={{
        "font-family": "system-ui, sans-serif",
        "min-height": "100vh",
        margin: "0",
        padding: params.has("bare") ? "56px 16px 16px" : "16px",
        background: tokyo ? "var(--background-base)" : mode() === "dark" ? "#16181d" : "#fbfbfa",
        color: mode() === "dark" ? "#d5d8de" : "#26282d",
        ...(tokyo ? TOKYO : {}),
      }}
    >
      <style>{css}</style>
      {/* ?bare hides the controls, for the README picture. */}
      <nav
        style={{
          display: params.has("bare") ? "none" : "flex",
          "flex-wrap": "wrap",
          gap: "6px",
          "margin-bottom": "16px",
        }}
      >
        <For each={GALLERY}>
          {(entry) => (
            <button aria-pressed={key() === entry.key} onClick={() => setKey(entry.key)}>
              {entry.key}
            </button>
          )}
        </For>
        <button onClick={() => setMode(mode() === "dark" ? "light" : "dark")}>{mode()}</button>
        <label>
          size <input type="range" min="80" max="300" value={size()} onInput={(e) => setSize(+e.currentTarget.value)} />
        </label>
        <label>
          <input type="checkbox" checked onChange={(e) => setVisible(e.currentTarget.checked)} /> visible
        </label>
      </nav>
      <Show
        when={params.has("grid")}
        fallback={
          <div style={{ display: "grid", "place-items": "center", "padding-top": "40px" }}>{eye(item())}</div>
        }
      >
        <div style={{ display: "grid", "grid-template-columns": "repeat(7, 1fr)", gap: "28px 8px" }}>
          <For each={GALLERY}>
            {(entry) => (
              <figure style={{ margin: 0, display: "grid", "justify-items": "center", gap: "6px" }}>
                {eye(entry)}
                <figcaption style={{ "font-size": "12px" }}>{entry.key}</figcaption>
              </figure>
            )}
          </For>
        </div>
      </Show>
    </main>
  )
}

render(() => <App />, document.getElementById("root")!)
