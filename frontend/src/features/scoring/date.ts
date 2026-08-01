export function localDateValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseSessionDate(value: string): Date | null {
  const dateOnly = dateOnlyPattern.exec(value)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2]) - 1
    const day = Number(dateOnly[3])
    const parsed = new Date(year, month, day, 12)
    return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day
      ? parsed
      : null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatSessionDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
  locales?: Intl.LocalesArgument,
) {
  const date = parseSessionDate(value)
  return date ? date.toLocaleDateString(locales, options) : value
}

export function readableDate(value: string) {
  return formatSessionDate(value, {
    month: 'short',
    day: 'numeric',
  })
}
