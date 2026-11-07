'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import styles from './home.module.css'

export function ProjectStart({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useSupabaseSession()
  const href = loading || isAuthenticated ? '/nova-ideia' : '/login?next=%2Fnova-ideia'
  return <Button asChild size="lg" className={styles.primaryAction}><Link href={href}>{children}</Link></Button>
}
