import { RecruitmentWorkspace } from './workspace-client'

export default async function RecruitmentWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RecruitmentWorkspace key={id} slug={id} />
}
