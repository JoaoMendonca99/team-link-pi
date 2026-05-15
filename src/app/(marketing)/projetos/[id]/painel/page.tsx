import { ProjectPanelClient } from './project-panel-client'

type ProjectPanelPageProps = {
  params: Promise<{ id: string }>
}

export default async function ProjectPanelPage({ params }: ProjectPanelPageProps) {
  const { id } = await params
  return <ProjectPanelClient slug={id} />
}
