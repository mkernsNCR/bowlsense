export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Some browsers expose the API but reject it when permission is denied.
      // Fall through to the selection-based copy path.
    }
  }

  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.top = '0'
  field.style.left = '0'
  field.style.opacity = '0'
  document.body.appendChild(field)
  try {
    field.focus()
    field.select()
    field.setSelectionRange(0, field.value.length)
    if (!document.execCommand('copy')) throw new Error('Clipboard is unavailable')
  } finally {
    field.remove()
    previouslyFocused?.focus()
  }
}
