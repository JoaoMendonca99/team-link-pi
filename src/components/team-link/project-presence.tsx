'use client'
import { useProjectPresence } from '@/hooks/use-project-presence'

export function ProjectPresence({ slug }: { slug: string }) {
  useProjectPresence(slug)
  return null
}
