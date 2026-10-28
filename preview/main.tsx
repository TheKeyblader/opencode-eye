import { createSignal, For, Show } from "solid-js"
import { render } from "solid-js/web"
import { Eye } from "../src/gui/eye"
import { simulate, type Look } from "../src/gui/motion"
import { themePalette, type EyeStyle } from "../src/gui/palette"
import { setVisible, usePanel } from "./plugin-gui"
import css from "../src/gui/eye.css?inline"

const LOOKS: Record<string, Look> = {
  idle: { mood: "idle" },
  thinking: { mood: "thinking" },
  read: { mood: "tool", kind: "read" },
  edit: { mood: "tool", kind: "edit" },
  shell: { mood: "tool", kind: "shell" },
  generic: { mood: "tool", kind: "generic" },
  attention: { mood: "attention" },
  "error (flash)": { mood: "error" },
  "error (stuck)": { mood: "error", stuck: true },
  sleeping: { mood: "sleeping" },
}

function App() {
  const params = new URLSearchParams(location.search)
  const [name, setName] = createSignal(params.get("look") ?? "idle")
  const [mode, setMode] = createSignal<"light" | "dark">(params.get("mode") === "dark" ? "dark" : "light")
  const [size, setSize] = createSignal(Number(params.get("size") ?? 160))
  const [style, setStyle] = createSignal<EyeStyle>(params.get("style") === "cartoon" ? "cartoon" : "realistic")
  const { visible } = usePanel()
  // ?still=<seconds> draws the pose reached after that long, for screenshots.
  const still = params.has("still") ? Number(params.get("still") || 2) : undefined
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

  return (
    <main
      style={{
        "font-family": "system-ui, sans-serif",
        "min-height": "100vh",
        margin: "0",
        padding: "16px",
        background: mode() === "dark" ? "#1c1c1f" : "#f6f6f4",
        color: mode() === "dark" ? "#e6e6e6" : "#1c1c1f",
      }}
    >
      <style>{css}</style>
      <nav style={{ display: "flex", "flex-wrap": "wrap", gap: "6px", "margin-bottom": "16px" }}>
        <For each={Object.keys(LOOKS)}>
          {(key) => (
            <button aria-pressed={name() === key} onClick={() => setName(key)}>
              {key}
            </button>
          )}
        </For>
        <button onClick={() => setMode(mode() === "dark" ? "light" : "dark")}>{mode()}</button>
        <button onClick={() => setStyle(style() === "cartoon" ? "realistic" : "cartoon")}>{style()}</button>
        <label>
          size <input type="range" min="60" max="320" value={size()} onInput={(e) => setSize(+e.currentTarget.value)} />
        </label>
        <label>
          <input type="checkbox" checked onChange={(e) => setVisible(e.currentTarget.checked)} /> visible
        </label>
      </nav>
      <Show when={params.has("grid")}>
        <div style={{ display: "grid", "grid-template-columns": "repeat(5, 1fr)", gap: "8px" }}>
          <For each={Object.entries(LOOKS)}>
            {([key, look]) => (
              <figure style={{ margin: 0, "text-align": "center" }}>
                <Eye
                  look={look}
                  size={size()}
                  style={style()}
                  visible={visible}
                  palette={themePalette(mode())}
                  label={key}
                  still={simulate(look, still ?? 2, random)}
                />
                <figcaption style={{ "font-size": "12px" }}>{key}</figcaption>
              </figure>
            )}
          </For>
        </div>
      </Show>
      <div class="opencode-eye__stage" style={{ display: params.has("grid") ? "none" : undefined }}>
        <Eye
          look={LOOKS[name()]!}
          size={size()}
          style={style()}
          visible={visible}
          palette={themePalette(mode())}
          label={name()}
          still={still === undefined ? undefined : simulate(LOOKS[name()]!, still, random)}
        />
        <p class="opencode-eye__label">{name()}</p>
      </div>
    </main>
  )
}

render(() => <App />, document.getElementById("root")!)
