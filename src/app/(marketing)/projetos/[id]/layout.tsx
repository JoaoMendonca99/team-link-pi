import { ProjectPresence } from '@/components/team-link/project-presence'

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  return <><ProjectPresence slug={id} />{children}</>
}
