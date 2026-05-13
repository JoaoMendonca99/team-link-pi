import { ProjectEditorClient } from './project-editor-client'

type Params = Promise<{ id: string }>

export default async function ProjectEditorPage({ params }: { params: Params }) {
  const { id } = await params
  return <ProjectEditorClient slug={id} />
}
