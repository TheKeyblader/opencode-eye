import { createMemo, createSignal, For, Show } from "solid-js"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { Eye } from "./eye"
import { pickIcon } from "./icon-picker"
import { isIconName } from "./icons"
import { clampSize, COLORS, computedHex, FALLBACK, resolvePalette, SIZE, STYLES, themePalette } from "./palette"

/** The search entries of the settings page; each row carries its id so search can reveal it. */
export const ENTRIES = ["size", "style", "colors", "mcp", "debug"] as const

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

      <McpIcons />

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

/** The MCP servers of the routed session's location (else the default one), and those that already have an icon. */
function McpIcons() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const data = () => ctx.servers.get("sidecar")?.data
  const ref = () => ctx.sessions.current()?.location ?? data()?.location.default()
  const icons = () => ctx.stores.mcp.value.icons

  // The list loads on demand: ask for it whenever the server or the location changes.
  createKeyed(
    () => {
      const source = data()
      const location = ref()

      return source && location ? { source, location } : undefined
    },
    ({ source, location }) => void source.location.mcp.server.sync(location).catch(() => undefined),
    { equals: (a, b) => a.source === b.source && a.location.directory === b.location.directory },
  )

  const servers = createMemo(() => {
    const listed = data()?.location.mcp.server.list(ref()) ?? []
    const rows = new Map(listed.map((server) => [server.name, server.title ?? server.name]))

    for (const name of Object.keys(icons())) if (!rows.has(name)) rows.set(name, name)
    return [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([name, title]) => ({ name, title }))
  })

  const choose = async (name: string) => {
    const chosen = icons()[name]
    const icon = await pickIcon(ctx, {
      title: ctx.t("settings.mcp.pick", { server: name }),
      current: chosen && isIconName(chosen) ? chosen : undefined,
    })

    if (icon)
      ctx.stores.mcp.update((draft) => {
        draft.icons[name] = icon
      })
  }

  return (
    <section data-entry="mcp">
      <h3>{ctx.t("settings.mcp")}</h3>
      <p class="opencode-eye-settings__hint">{ctx.t("settings.mcp.hint")}</p>
      <For each={servers()} fallback={<p class="opencode-eye-settings__hint">{ctx.t("settings.mcp.none")}</p>}>
        {(server) => {
          const chosen = () => {
            const icon = icons()[server.name]

            return icon && isIconName(icon) ? icon : undefined
          }

          return (
            <div class="opencode-eye-settings__row">
              <ui.IconButton
                icon={chosen() ?? "mcp"}
                label={ctx.t("settings.mcp.pick", { server: server.name })}
                onClick={() => void choose(server.name)}
              />
              <span>{server.title}</span>
              <Show when={server.title !== server.name}>
                <code class="opencode-eye-settings__hint">{server.name}</code>
              </Show>
              <Show when={chosen()}>
                <ui.Button
                  size="small"
                  variant="ghost"
                  icon="reset"
                  onClick={() =>
                    ctx.stores.mcp.update((draft) => {
                      delete draft.icons[server.name]
                    })
                  }
                >
                  {ctx.t("settings.mcp.reset")}
                </ui.Button>
              </Show>
            </div>
          )
        }}
      </For>
    </section>
  )
}
