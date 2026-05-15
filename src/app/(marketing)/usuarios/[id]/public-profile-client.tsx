'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, User } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { EmptyState } from '@/components/team-link/empty-state'
import { TagList } from '@/components/team-link/tag-list'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { Button } from '@/components/ui/button'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import type { ProfileRow } from '@/types/database'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function PublicProfileClient({ userId }: { userId: string }) {
  const { user } = useSupabaseSession()
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const isOwnProfile = Boolean(user && user.id === userId)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setNotFound(false)
    try {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('profiles')
        .select('id, full_name, course, bio, avatar_url, skills, interests, created_at')
        .eq('id', userId)
        .maybeSingle()

      if (error || !data) {
        setProfile(null)
        setNotFound(true)
      } else {
        setProfile(data as ProfileRow)
      }
    } catch {
      setProfile(null)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 rounded-xl bg-muted" />
            <div className="h-40 rounded-3xl bg-muted" />
          </div>
        </Container>
      </main>
    )
  }

  if (notFound || !profile) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <EmptyState
            icon={User}
            title="Perfil não encontrado"
            description="Este perfil não está disponível ou foi removido."
            actionLabel="Voltar para explorar"
            href="/explorar"
          />
        </Container>
      </main>
    )
  }

  const fullName = profile.full_name?.trim() || 'Membro'
  const course = profile.course?.trim() || null
  const bio =
    profile.bio?.trim() ||
    'Esta pessoa ainda não adicionou uma biografia.'
  const skills = profile.skills ?? []
  const interests = profile.interests ?? []
  const joinedAt = formatDate(profile.created_at)

  return (
    <main className="bg-background pb-20">
      <Container className="space-y-8 py-10">
        <Button asChild variant="ghost" className="w-fit gap-2 rounded-2xl font-semibold">
          <Link href="/explorar">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>

        <section className="rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <UserAvatar
              name={fullName}
              imageUrl={profile.avatar_url ?? undefined}
              sizeClassName="h-20 w-20 shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">
                  Perfil
                </p>
                <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                  {fullName}
                </h1>
                {course ? (
                  <p className="mt-1 text-sm text-muted-foreground">{course}</p>
                ) : null}
                {joinedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No Team Link desde {joinedAt}
                  </p>
                ) : null}
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {bio}
              </p>
              {isOwnProfile ? (
                <Button asChild className="rounded-2xl font-semibold">
                  <Link href="/perfil">Ver meu perfil completo</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        {skills.length > 0 ? (
          <section className="rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold">Habilidades</h2>
            <div className="mt-4">
              <TagList tags={skills} max={skills.length} size="md" />
            </div>
          </section>
        ) : null}

        {interests.length > 0 ? (
          <section className="rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold">Interesses</h2>
            <div className="mt-4">
              <TagList tags={interests} max={interests.length} size="md" />
            </div>
          </section>
        ) : null}
      </Container>
    </main>
  )
}
