'use client'
import { usePathname } from 'next/navigation'
import { useProjectPresence } from '@/hooks/use-project-presence'

export function ProjectPresence({ slug }: { slug: string }) {
  const pathname = usePathname()
  // The public detail starts presence after checking active membership.
  const publicDetail = /^\/projetos\/[^/]+\/?$/.test(pathname ?? '')
  useProjectPresence(publicDetail ? undefined : slug)
  return null
}
