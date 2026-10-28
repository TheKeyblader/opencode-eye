import { Command, MenuItem, Panel, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { EyePanel } from "./panel"
import css from "./eye.css?inline"

export const TAB = "eye"

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const key = `${ctx.id}:${TAB}`

  ctx.add(Style, css)

  // Same object on every `list` call so the host never remounts the trigger.
  const tab: PanelTab = {
    id: TAB,
    get title() {
      return ctx.t("panel.title")
    },
    closable: "hover",
  }

  ctx.add(Panel, {
    id: TAB,
    region: "side",
    mobile: {
      get title() {
        return ctx.t("panel.title")
      },
      order: 50,
      kind: "menu",
      icon: "eye",
    },
    list: (input) => (input.open.includes(TAB) ? [tab] : []),
    // props.session is a getter that follows session switches: pass it through, never destructure.
    render: (props) => <EyePanel session={props.session} />,
  })

  ctx.add(
    Command,
    (): Command => ({
      id: "toggle",
      title: ctx.t("command.toggle"),
      group: ctx.t("command.group"),
      keywords: "eye oeil œil",
      section: "session",
      bind: "mod+alt+e",
      enabled: !!ctx.sessions.current(),
      run: () => {
        const session = ctx.sessions.current()

        if (session) ctx.layout.toggle(key, session)
      },
    }),
  )

  ctx.add(MenuItem, (): MenuItem => {
    const session = ctx.sessions.current()

    return {
      menu: "session.panel",
      id: "open",
      title: ctx.t("menu.open"),
      description: ctx.t("menu.description"),
      icon: "eye",
      keybind: `${ctx.id}.toggle`,
      opened: !!session && ctx.layout.state(key, session) !== "closed",
      run: () => {
        if (session) ctx.layout.open(key, session)
      },
    }
  })
}
