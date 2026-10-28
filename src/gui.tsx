import { Plugin } from "@opencode/plugin/gui"
import { definition } from "./gui/definition"
import { setup } from "./gui/window"

export default Plugin.define({ ...definition, setup })
