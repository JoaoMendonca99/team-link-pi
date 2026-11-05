import { PanelPresence } from './_components/panel-presence'

export default async function PanelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  return <><PanelPresence slug={id} />{children}</>
}
