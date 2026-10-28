import { createMemo, createSignal, For, onCleanup } from "solid-js"
import type { Context, IconName } from "@opencode/plugin/gui"
import { ICON_NAMES } from "./icon-names"

/** Asks for an icon in a filterable grid. Resolves undefined when the dialog closes without a pick. */
export function pickIcon(ctx: Context, input: { readonly title: string; readonly current?: IconName }) {
  return new Promise<IconName | undefined>((resolve) => {
    ctx.dialogs.open((dialog) => (
      <Picker
        ctx={ctx}
        title={input.title}
        current={input.current}
        pick={(icon) => {
          resolve(icon)
          dialog.close()
        }}
        // Escape, a click outside or a replacing dialog: no pick. A second resolve is ignored.
        closed={() => resolve(undefined)}
      />
    ))
  })
}

function Picker(props: {
  readonly ctx: Context
  readonly title: string
  readonly current?: IconName
  readonly pick: (icon: IconName) => void
  readonly closed: () => void
}) {
  const ui = props.ctx.ui
  const [filter, setFilter] = createSignal("")
  const icons = createMemo(() => {
    const words = filter().toLowerCase().split(/\s+/).filter(Boolean)

    return ICON_NAMES.filter((name) => words.every((word) => name.includes(word)))
  })

  onCleanup(props.closed)

  return (
    <ui.Dialog title={props.title} size="large">
      <div class="opencode-eye-picker">
        <ui.TextInput
          type="search"
          label={props.ctx.t("picker.filter")}
          placeholder={props.ctx.t("picker.placeholder")}
          value={filter()}
          onInput={setFilter}
          onSubmit={() => {
            const [first] = icons()

            if (first) props.pick(first)
          }}
          autofocus
        />
        <div class="opencode-eye-picker__grid" role="list">
          <For each={icons()} fallback={<p class="opencode-eye-settings__hint">{props.ctx.t("picker.none")}</p>}>
            {(name) => (
              <div role="listitem">
                <ui.Tooltip value={name}>
                  <ui.IconButton
                    icon={name}
                    label={name}
                    variant="ghost"
                    pressed={name === props.current}
                    onClick={() => props.pick(name)}
                  />
                </ui.Tooltip>
              </div>
            )}
          </For>
        </div>
      </div>
    </ui.Dialog>
  )
}
