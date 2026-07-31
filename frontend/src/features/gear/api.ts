async function checkedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await checkedFetch(input, init)
  return response.json() as Promise<T>
}

export async function request(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  await checkedFetch(input, init)
}

function shouldUseLegacyArsenalRoute(response: Response, expectJson: boolean): boolean {
  const contentType = response.headers.get('content-type') || ''
  const servedSpaFallback = response.ok && contentType.includes('text/html')
  return response.status === 404
    || response.status === 405
    || servedSpaFallback
    || (expectJson && response.ok && !contentType.includes('application/json'))
}

async function arsenalFetch(suffix = '', init?: RequestInit, expectJson = false): Promise<Response> {
  let response = await fetch(`/api/arsenals${suffix}`, init)
  if (shouldUseLegacyArsenalRoute(response, expectJson)) {
    response = await fetch(`/arsenals${suffix}`, init)
  }
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response
}

export async function arsenalJson<T>(suffix = '', init?: RequestInit): Promise<T> {
  const response = await arsenalFetch(suffix, init, true)
  return response.json() as Promise<T>
}

export async function arsenalRequest(suffix: string, init?: RequestInit): Promise<void> {
  await arsenalFetch(suffix, init)
}
