/**
 * Converte um título em um slug seguro para URL:
 * - minúsculas
 * - sem acentos (normalize NFD + remove combining marks)
 * - espaços viram hífen
 * - remove caracteres especiais
 * - colapsa múltiplos hífens
 * - sem hífen no início/fim
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Verifica se o slug está num formato válido para o banco
 * (regra mínima: pelo menos 1 caractere e só contém [a-z0-9-]).
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}
