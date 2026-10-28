// Stand-ins for the SDK primitives the eye uses, so it renders outside OpenCode.
import { createEffect, createMemo, createSignal, untrack } from "solid-js"

const [visible, setVisible] = createSignal(true)

export { setVisible }

export function usePanel() {
  return { visible }
}

export function createKeyed<T>(
  source: () => T | undefined | null | false,
  fn: (value: T) => void,
  options?: { equals?: (a: T, b: T) => boolean },
) {
  const equals = options?.equals
  const key = createMemo(source, undefined, {
    equals: (a, b) => a === b || (!!equals && !!a && !!b && equals(a as T, b as T)),
  })

  createEffect(() => {
    const value = key()

    if (value !== undefined && value !== null && value !== false) {
      untrack(() => fn(value as T))
    }
  })
}
