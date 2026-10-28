import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

// A page to look at the eye outside OpenCode: `bun run preview`.
export default defineConfig({
  root: "preview",
  plugins: [solid()],
  resolve: {
    alias: { "@opencode/plugin/gui": fileURLToPath(new URL("./preview/plugin-gui.ts", import.meta.url)) },
  },
})
