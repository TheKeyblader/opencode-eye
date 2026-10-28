import { createSignal, onCleanup } from "solid-js"

/** Whether to reduce motion: the plugin's setting, or the system's `prefers-reduced-motion`, which it follows live. */
export function createReducedMotion(setting: () => boolean): () => boolean {
  const query = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined
  const [system, setSystem] = createSignal(query?.matches ?? false)

  if (query) {
    const onChange = (event: MediaQueryListEvent) => setSystem(event.matches)

    query.addEventListener("change", onChange)
    onCleanup(() => query.removeEventListener("change", onChange))
  }
  return () => setting() || system()
}

/** The width an element has, followed live. */
export function createWidth(element: () => Element | undefined): () => number {
  const [width, setWidth] = createSignal(0)
  let observer: ResizeObserver | undefined
  let disposed = false

  // The element exists once the component's JSX has run.
  queueMicrotask(() => {
    const target = element()

    if (disposed || !target || typeof ResizeObserver !== "function") return
    observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(target)
  })
  onCleanup(() => {
    disposed = true
    observer?.disconnect()
  })
  return width
}
