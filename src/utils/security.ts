export function redactSensitiveText(value: string): string {
  return value
    .replace(/AIza[\w-]{20,}/g, "[API key removed]")
    .replace(/(?:api[_ -]?key\s*[:=]\s*)[^\s,;]+/giu, "$1[removed]");
}

export function safeErrorDetail(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value ?? "");
  return redactSensitiveText(text).slice(0, 600);
}

export function escapeCsvFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}
