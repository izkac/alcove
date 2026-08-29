type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

function internals(): TauriInternals | undefined {
  return (window as unknown as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__
}

export function isTauri(): boolean {
  return internals() !== undefined
}

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const api = internals()
  if (!api) throw new Error("not running inside Tauri")
  return api.invoke(cmd, args) as Promise<T>
}
