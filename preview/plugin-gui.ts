// Stand-ins for the two SDK primitives the eye uses, so it renders outside OpenCode.
import { createEffect, createMemo, createSignal, untrack } from "solid-js"

const [visible, setVisible] = createSignal(true)

export { setVisible }

export function usePanel() {
  return { visible }
}

export function createKeyed<T>(source: () => T | undefined | null | false, fn: (value: T) => void) {
  const key = createMemo(source)

  createEffect(() => {
    const value = key()

    if (value !== undefined && value !== null && value !== false) untrack(() => fn(value as T))
  })
}
