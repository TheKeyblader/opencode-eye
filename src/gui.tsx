import { Plugin } from "@opencode/plugin/gui"
import { definition } from "./gui/definition"
import { setup } from "./gui/window"

/** The plugin's GUI entry: its stores and copy, and the window setup that adds the eye. */
export default Plugin.define({ ...definition, setup })
