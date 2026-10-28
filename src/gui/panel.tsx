import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { definition } from "./definition"

export function EyePanel(props: { readonly session: MountedSession }) {
  const ctx = usePlugin<typeof definition>()

  return (
    <div class="opencode-eye" data-session={props.session.id}>
      <p class="opencode-eye__empty">{ctx.t("panel.empty")}</p>
    </div>
  )
}
