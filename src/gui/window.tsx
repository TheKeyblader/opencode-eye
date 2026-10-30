import { createSignal, onCleanup, untrack } from "solid-js"
import {
  Command,
  createKeyed,
  MenuItem,
  Panel,
  SettingsPage,
  Style,
  type PanelTab,
  type Plugin,
} from "@opencode/plugin/gui"
import { adapt, sessionOf, stepUsage } from "./adapt"
import { createEventLog } from "./debug"
import type { definition } from "./definition"
import { NO_MODS } from "./gallery"
import { EyeStateMachine, sameView, type EyeEvent, type EyeView } from "./machine"
import { EyePanel } from "./panel"
import { ENTRIES, EyeSettings } from "./settings"
import { seed } from "./seed"
import css from "./eye.css?inline"

/** The panel tab's id. */
export const TAB = "eye"

/** Every session's eye, as the panel reads it. */
export interface Eyes {
  /** What the eye of a session shows. Reactive. */
  view(sessionID: string): EyeView
  /** Lets time pass for a session's eye: the panel calls it while it is on screen. */
  tick(sessionID: string): void
  /** Fills in the eye of a session it has seen no event of yet, from what the server holds. */
  ensure(sessionID: string): void
}

const RESTING: EyeView = { state: "idle", tool: null, count: 0, mods: NO_MODS, since: 0, history: [] }

/**
 * The window setup: one state machine per session fed by the app's server, and the panel, settings page, commands and
 * menu item that show the eye.
 */
export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  type ServerData = NonNullable<ReturnType<typeof ctx.servers.get>>["data"]

  const key = `${ctx.id}:${TAB}`
  const log = createEventLog()
  // The eye still works without what failed (the context usage, a seed), but the failure must show in the console.
  const warn = (what: string) => (error: unknown) => console.warn(`[${ctx.id}] ${what}`, error)

  ctx.add(Style, css)

  // The machines hold each session's state; the signal holds what the eyes show, so a tick that changes nothing
  // re-renders nothing. They live here, not in the panel, so an eye opened mid-run already knows what is going on.
  const machines = new Map<string, EyeStateMachine>()
  const [views, setViews] = createSignal<Readonly<Record<string, EyeView>>>({})
  const machine = (sessionID: string) => {
    let found = machines.get(sessionID)

    if (!found) machines.set(sessionID, (found = new EyeStateMachine()))
    return found
  }
  const publish = (sessionID: string, view: EyeView) =>
    setViews((all) => {
      const known = all[sessionID]

      return known && sameView(known, view) ? all : { ...all, [sessionID]: view }
    })
  const dispatch = (sessionID: string, events: readonly EyeEvent[]) => {
    const now = Date.now()
    const eye = machine(sessionID)

    for (const event of events) eye.dispatch(event, now)
    publish(sessionID, eye.tick(now))
  }

  // The context a step left, over its model's context window: the `tired` modifier.
  const usage = (data: ServerData, sessionID: string, messageID: string, tokens: number) => {
    try {
      const message = data.session.message.get(sessionID, messageID)
      const model = message?.type === "assistant" ? message.model : undefined

      if (!model) return
      const location = data.session.get(sessionID).location
      const models = data.location.model.list(location)

      if (!models) {
        // The models load on demand: the next step will find them.
        void data.location.model.sync(location).catch(warn("could not load the models"))
        return
      }
      const info = models.find(
        (item) => item.providerID === model.providerID && (item.id === model.id || item.modelID === model.id),
      )

      if (info?.limit.context) dispatch(sessionID, [{ type: "context.usage", ratio: tokens / info.limit.context }])
    } catch (error) {
      // A session or a message the server data does not hold: no usage, no tired eye.
      warn("could not read the context usage")(error)
    }
  }

  // The app's own server. A restarted server gives a new `data`, which the subscription follows.
  createKeyed(
    () => ctx.servers.get("sidecar")?.data,
    (data) =>
      onCleanup(
        data.listen(({ details }) => {
          const sessionID = sessionOf(details)

          if (!sessionID) return
          if (details.type === "session.deleted") {
            machines.delete(sessionID)
            setViews(({ [sessionID]: _, ...rest }) => rest)
            return
          }
          const events = adapt(details)

          if (events.length) dispatch(sessionID, events)
          const step = stepUsage(details)

          if (step) untrack(() => usage(data, sessionID, step.messageID, step.tokens))
        }),
      ),
  )

  // Back after a while away: the eyes are surprised.
  let hiddenAt: number | undefined
  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now()
      return
    }
    if (hiddenAt === undefined) return
    const awayMs = Date.now() - hiddenAt

    hiddenAt = undefined
    for (const sessionID of machines.keys()) dispatch(sessionID, [{ type: "window.visible", awayMs }])
  }

  document.addEventListener("visibilitychange", onVisibility)
  onCleanup(() => document.removeEventListener("visibilitychange", onVisibility))

  // An eye shown on a session it has seen no event of yet (the plugin loaded mid-run) starts from what the server
  // already holds. Once per session and server; then the events take over.
  let seededFor: unknown
  const seeded = new Set<string>()
  const ensure = (sessionID: string) => {
    const data = ctx.servers.get("sidecar")?.data

    if (!data) return
    if (seededFor !== data) {
      seededFor = data
      seeded.clear()
    }
    if (seeded.has(sessionID)) return
    seeded.add(sessionID)

    const apply = () => {
      let snapshot: ReturnType<typeof seed>

      try {
        snapshot = untrack(() =>
          seed(sessionID, {
            status: data.session.status(sessionID),
            messages: data.session.message.list(sessionID),
            permissions: data.session.permission.list(sessionID),
            forms: data.session.form.list(sessionID),
          }),
        )
      } catch (error) {
        // A session the server data does not hold yet: the events will tell.
        warn(`could not read session ${sessionID}`)(error)
        return
      }

      publish(sessionID, machine(sessionID).seed(snapshot, Date.now()))
      if (snapshot.usage) untrack(() => usage(data, sessionID, snapshot.usage!.messageID, snapshot.usage!.tokens))
    }

    apply()
    // Pending approvals and questions load on demand: look again once they have.
    void Promise.allSettled([data.session.permission.sync(sessionID), data.session.form.sync(sessionID)]).then(
      (results) => {
        for (const result of results)
          if (result.status === "rejected") warn("could not load the pending approvals or questions")(result.reason)
        apply()
      },
    )
  }

  const eyes: Eyes = {
    view: (sessionID) => views()[sessionID] ?? RESTING,
    tick: (sessionID) => {
      const eye = machines.get(sessionID)

      if (eye) publish(sessionID, eye.tick(Date.now()))
    },
    ensure,
  }

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

  ctx.add(Command, (): Command => ({
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
  }))

  ctx.add(SettingsPage, {
    id: ctx.id,
    icon: "eye",
    get title() {
      return ctx.t("settings.title")
    },
    get entries() {
      return ENTRIES.map((id) => ({ id, title: ctx.t(`settings.entry.${id}`), keywords: ctx.t("settings.keywords") }))
    },
    render: (input) => <EyeSettings target={input.target} />,
  })

  ctx.add(Command, (): Command => ({
    id: "debug",
    title: ctx.t("command.debug"),
    group: ctx.t("command.group"),
    keywords: "eye oeil œil debug log events",
    run: () =>
      ctx.stores.debug.update((draft) => {
        draft.enabled = !draft.enabled
      }),
  }))

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
