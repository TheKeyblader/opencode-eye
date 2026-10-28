import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import { en, fr } from "./i18n"
import { SIZE } from "./palette"

export const definition = Plugin.define({
  stores: {
    debug: Store.global(Schema.Struct({ enabled: Schema.Boolean }), { enabled: false }),
    // Colors are `#rrggbb`, or empty to follow the theme.
    settings: Store.global(
      Schema.Struct({
        size: Schema.Number,
        style: Schema.Literals(["realistic", "cartoon"]),
        iris: Schema.String,
        pupil: Schema.String,
        outline: Schema.String,
      }),
      { size: SIZE.initial, style: "realistic", iris: "", pupil: "", outline: "" },
    ),
  },
  i18n: { en, fr },
})
