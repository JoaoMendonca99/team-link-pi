/**
 * Catálogo de categorias sugeridas para os filtros e o formulário de criação.
 *
 * Não representa projetos cadastrados — é apenas uma lista controlada de
 * categorias institucionais até que a UI passe a derivar categorias dinamicamente
 * a partir do banco.
 */
const defaultCatalogCategories = [
  "Sistemas embutidos",
  "Saúde e biometria",
  "Educação e inclusão",
  "Sustentabilidade",
  "Robótica",
  "Data & comunidade",
] as const

export const projectCategories: string[] = [...defaultCatalogCategories].sort((a, b) =>
  a.localeCompare(b, "pt-BR"),
)
