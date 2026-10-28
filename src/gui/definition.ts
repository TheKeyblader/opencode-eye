import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import { en, fr } from "./i18n"
import { SIZE, STROKES } from "./palette"

export const definition = Plugin.define({
  stores: {
    debug: Store.global(Schema.Struct({ enabled: Schema.Boolean }), { enabled: false }),
    // A new key for the new eye, so the first eye's settings never fail to decode. `size: 0` is automatic; colors are
    // `#rrggbb`, or empty to follow the theme.
    eye: Store.global(
      Schema.Struct({
        size: Schema.Number,
        brow: Schema.Boolean,
        stroke: Schema.Literals(STROKES),
        reduced: Schema.Boolean,
        contour: Schema.String,
        error: Schema.String,
      }),
      { size: SIZE.auto, brow: true, stroke: "normal", reduced: false, contour: "", error: "" },
    ),
    // Icons the user chose, by MCP server name. A store of its own, so it never invalidates the settings above.
    mcp: Store.global(Schema.Struct({ icons: Schema.Record(Schema.String, Schema.String) }), { icons: {} }),
  },
  i18n: { en, fr },
})
