// Device-local credentials. Wrapped because storage can throw in private modes.
function get(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

const k = (kind: string, code: string) => `bb:${kind}:${code.toUpperCase()}`

export const participantToken = {
  get: (code: string) => get(k('participant', code)),
  set: (code: string, token: string | null) => set(k('participant', code), token),
}

export const buzzerToken = {
  get: (code: string) => get(k('buzzer', code)),
  set: (code: string, token: string | null) => set(k('buzzer', code), token),
}
