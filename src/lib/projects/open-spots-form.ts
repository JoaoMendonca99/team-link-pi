/**
 * Interpreta o texto do campo "Vagas em aberto" no formulário.
 *
 * @returns inteiro >= 0 quando válido; `null` se vazio, não inteiro, NaN ou negativo.
 */
export function parseOpenSpotsFormValue(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null
  return n
}
