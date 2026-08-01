export async function requestJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const timeoutController = init?.signal ? null : new AbortController()
  const timeoutId = timeoutController
    ? window.setTimeout(() => timeoutController.abort(), 15_000)
    : null
  try {
    const response = await fetch(input, timeoutController ? { ...init, signal: timeoutController.signal } : init)
    if (!response.ok) {
      const message = await response.json().then((body) => body?.error).catch(() => null)
      throw new Error(message || `Request failed (${response.status})`)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId)
  }
}
