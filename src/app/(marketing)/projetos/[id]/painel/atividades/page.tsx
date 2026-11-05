import { ActivitiesClient } from './workspace-client'

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ActivitiesClient key={id} slug={id} />
}
