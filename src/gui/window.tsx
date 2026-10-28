import { createMemo, createSignal, onCleanup } from "solid-js"
import { Command, createKeyed, MenuItem, Panel, Style, type PanelTab, type Plugin } from "@opencode/plugin/gui"
import { createEventLog } from "./debug"
import type { definition } from "./definition"
import { EyePanel } from "./panel"
import { deadline, reduceSessions, TICK, type Sessions } from "./state"
import css from "./eye.css?inline"

export const TAB = "eye"

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const key = `${ctx.id}:${TAB}`
  const log = createEventLog()
  const [eyes, setEyes] = createSignal<Sessions>({})

  ctx.add(Style, css)

  // Every session's eye, from the app's own server. A restarted server gives a new `data`, which the subscription
  // follows. The state lives here, not in the panel, so an eye opened mid-run already knows what is going on.
  createKeyed(
    () => ctx.servers.get("sidecar")?.data,
    (data) =>
      onCleanup(data.listen((event) => setEyes((sessions) => reduceSessions(sessions, event.details, Date.now())))),
  )

  // A failed tool only flashes: wake the machine when the earliest flash ends.
  const wake = createMemo(() => {
    const now = Date.now()

    return Object.values(eyes()).reduce<number | undefined>((earliest, state) => {
      const at = deadline(state, now)

      return at !== undefined && (earliest === undefined || at < earliest) ? at : earliest
    }, undefined)
  })

  createKeyed(wake, (at) => {
    const timer = setTimeout(
      () => setEyes((sessions) => reduceSessions(sessions, { type: TICK }, Date.now())),
      Math.max(0, at - Date.now()),
    )

    onCleanup(() => clearTimeout(timer))
  })

  // Debug: every event of the app's own server, only while the log is on.
  createKeyed(
    () => ctx.stores.debug.value.enabled && ctx.servers.get("sidecar")?.data,
    (data) =>
      onCleanup(
        data.listen((event) => {
          const entry = log.record(event.name, event.details)

          if (entry) console.debug(`[${ctx.id}] #${entry.seq} ${event.name}`, event.details)
        }),
      ),
  )

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
    render: (props) => <EyePanel session={props.session} eyes={eyes} log={log} />,
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

  ctx.add(
    Command,
    (): Command => ({
      id: "debug",
      title: ctx.t("command.debug"),
      group: ctx.t("command.group"),
      keywords: "eye oeil œil debug log events",
      run: () =>
        ctx.stores.debug.update((draft) => {
          draft.enabled = !draft.enabled
        }),
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
