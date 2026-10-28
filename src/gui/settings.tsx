import { createSignal, For, Show } from "solid-js"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { Eye } from "./eye"
import { clampSize, COLORS, computedHex, FALLBACK, resolvePalette, SIZE, STYLES, themePalette } from "./palette"

/** The search entries of the settings page; each row carries its id so search can reveal it. */
export const ENTRIES = ["size", "style", "colors", "debug"] as const

export function EyeSettings(props: { readonly target?: string }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const settings = () => ctx.stores.settings.value
  const theme = () => themePalette(ctx.appearance.mode())
  const palette = () => resolvePalette(ctx.appearance.mode(), settings())
  const [root, setRoot] = createSignal<HTMLDivElement>()
  // A color input takes #rrggbb: show the user's color, else what the theme's computes to here.
  const shown = (key: (typeof COLORS)[number]) => {
    const element = root()

    return (
      settings()[key] ||
      (element && computedHex(theme()[key], element)) ||
      FALLBACK[ctx.appearance.mode()][key]
    )
  }

  // Search reveals an entry: bring its row into view.
  createKeyed(
    () => props.target,
    (target) =>
      queueMicrotask(() => root()?.querySelector(`[data-entry="${target}"]`)?.scrollIntoView({ block: "center" })),
  )

  return (
    <div ref={setRoot} class="opencode-eye-settings">
      <div class="opencode-eye-settings__preview">
        <Eye
          look={{ mood: "idle" }}
          size={settings().size}
          style={settings().style}
          palette={palette()}
          label={ctx.t("settings.preview")}
          visible={() => true}
        />
      </div>

      <section data-entry="size">
        <h3>{ctx.t("settings.size")}</h3>
        <label class="opencode-eye-settings__row">
          <input
            type="range"
            min={SIZE.min}
            max={SIZE.max}
            step={SIZE.step}
            value={settings().size}
            aria-label={ctx.t("settings.size")}
            onInput={(event) => {
              const size = clampSize(event.currentTarget.valueAsNumber)

              ctx.stores.settings.update((draft) => {
                draft.size = size
              })
            }}
          />
          <span class="opencode-eye-settings__value">{settings().size} px</span>
        </label>
      </section>

      <section data-entry="style">
        <h3>{ctx.t("settings.style")}</h3>
        <div class="opencode-eye-settings__row" role="group" aria-label={ctx.t("settings.style")}>
          <For each={STYLES}>
            {(style) => (
              <ui.Button
                size="small"
                variant={settings().style === style ? "contrast" : "neutral"}
                onClick={() =>
                  ctx.stores.settings.update((draft) => {
                    draft.style = style
                  })
                }
              >
                {ctx.t(`settings.style.${style}`)}
              </ui.Button>
            )}
          </For>
        </div>
      </section>

      <section data-entry="colors">
        <h3>{ctx.t("settings.colors")}</h3>
        <p class="opencode-eye-settings__hint">{ctx.t("settings.colors.hint")}</p>
        <For each={COLORS}>
          {(key) => (
            <div class="opencode-eye-settings__row">
              <input
                type="color"
                value={shown(key)}
                aria-label={ctx.t(`settings.color.${key}`)}
                onInput={(event) => {
                  const color = event.currentTarget.value

                  ctx.stores.settings.update((draft) => {
                    draft[key] = color
                  })
                }}
              />
              <span>{ctx.t(`settings.color.${key}`)}</span>
              <Show
                when={settings()[key]}
                fallback={<span class="opencode-eye-settings__hint">{ctx.t("settings.color.theme")}</span>}
              >
                <ui.Button
                  size="small"
                  variant="ghost"
                  icon="reset"
                  onClick={() =>
                    ctx.stores.settings.update((draft) => {
                      draft[key] = ""
                    })
                  }
                >
                  {ctx.t("settings.color.reset")}
                </ui.Button>
              </Show>
            </div>
          )}
        </For>
      </section>

      <section data-entry="debug">
        <ui.Switch
          label={ctx.t("debug.switch")}
          description={ctx.t("debug.description")}
          checked={ctx.stores.debug.value.enabled}
          onChange={(checked) =>
            ctx.stores.debug.update((draft) => {
              draft.enabled = checked
            })
          }
        />
      </section>
    </div>
  )
}
