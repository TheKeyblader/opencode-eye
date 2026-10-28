import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import { en, fr } from "./i18n"

export const definition = Plugin.define({
  stores: {
    debug: Store.global(Schema.Struct({ enabled: Schema.Boolean }), { enabled: false }),
  },
  i18n: { en, fr },
})
