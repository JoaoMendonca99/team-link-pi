import { ProjectDetailClient } from './project-detail-client'

/**
 * O parâmetro `[id]` na rota é, na verdade, o **slug** do projeto.
 * Optamos por manter o nome da pasta para não quebrar links antigos,
 * mas internamente sempre tratamos como slug — `project_public_details`
 * é consultada por slug e os cartões linkam por slug.
 */
type ProjectPageProps = {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = await params
  return <ProjectDetailClient slug={id} />
}
