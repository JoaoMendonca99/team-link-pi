'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Eye,
  Globe2,
  Heart,
  Lock,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Share2,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'

import { CategoryBadge } from '@/components/team-link/category-badge'
import { ProjectStatusBadge } from '@/components/team-link/project-status-badge'
import { TagList } from '@/components/team-link/tag-list'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { EmptyState } from '@/components/team-link/empty-state'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  PROJECT_VISIBILITY_LABEL,
  mapPublicDetailToDisplay,
  type ProjectDisplay,
} from '@/lib/projects/display'
import type {
  MemberBadgeColor,
  ProjectPublicDetailRow,
} from '@/types/database'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { cn } from '@/lib/utils'

import { CommentsSection } from './_components/comments-section'
import { JoinRequestSection } from './_components/join-request-section'
import { LikeButton } from './_components/like-button'
import { MembersPreviewCard, type MembersPreviewCardHandle } from './_components/members-preview-card'
import { OwnerRequestsSection } from './_components/owner-requests-section'
import {
  computeMemberBadge,
  isValidBadgeColor,
} from './_components/member-badge'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MembershipRole = 'owner' | 'admin' | 'member' | 'mentor'

interface CurrentMembership {
  role: MembershipRole
  displayRole: string | null
  badgeColor: MemberBadgeColor | null
}

export function ProjectDetailClient({ slug }: { slug: string }) {
  const { user, isAuthenticated, loading: sessionLoading } = useSupabaseSession()

  const [project, setProject] = useState<ProjectDisplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  const [likesCount, setLikesCount] = useState(0)
  const [commentsCount, setCommentsCount] = useState(0)
  const [membersCount, setMembersCount] = useState(0)

  // Membership do usuário atual no projeto (para gating de UI).
  const [membership, setMembership] = useState<CurrentMembership | null>(null)

  const membersPreviewRef = useRef<MembersPreviewCardHandle | null>(null)

  // -------------------------------------------------------------------------
  // Carregamento do projeto
  // -------------------------------------------------------------------------

  const loadProject = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setEnvMissing(true)
      setLoading(false)
      return
    }

    setLoading(true)
    setFetchError(null)
    setNotFound(false)
    try {
      const client = getSupabaseClient()
      const bySlug = await client
        .from('project_public_details')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      let row: ProjectPublicDetailRow | null =
        (bySlug.data as ProjectPublicDetailRow | null) ?? null

      if (!row && !bySlug.error && UUID_RE.test(slug)) {
        const byId = await client
          .from('project_public_details')
          .select('*')
          .eq('id', slug)
          .maybeSingle()
        row = (byId.data as ProjectPublicDetailRow | null) ?? null
      }

      if (bySlug.error && !row) {
        setFetchError(bySlug.error.message)
        return
      }
      if (!row) {
        setNotFound(true)
        return
      }

      const display = mapPublicDetailToDisplay(row)
      setProject(display)
      setLikesCount(display.likesCount)
      setCommentsCount(display.commentsCount)
      setMembersCount(display.membersCount)
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Erro desconhecido ao carregar projeto.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void loadProject()
  }, [loadProject])

  // -------------------------------------------------------------------------
  // Membership do usuário atual no projeto
  // -------------------------------------------------------------------------

  const loadMembership = useCallback(async () => {
    if (!project || !user) {
      setMembership(null)
      return
    }
    try {
      const client = getSupabaseClient()
      const { data } = await client
        .from('project_public_members')
        .select('role, display_role, badge_color')
        .eq('project_id', project.id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (data) {
        setMembership({
          role: (data.role as MembershipRole) ?? 'member',
          displayRole: (data.display_role as string | null) ?? null,
          badgeColor: isValidBadgeColor(
            (data.badge_color as string | null) ?? null,
          )
            ? ((data.badge_color as MemberBadgeColor) ?? null)
            : null,
        })
      } else if (user.id === project.ownerId) {
        // Caso raro em que o owner ainda não está na view de membros
        // (ex.: latência logo após criar). Mantém a UI estável.
        setMembership({ role: 'owner', displayRole: null, badgeColor: null })
      } else {
        setMembership(null)
      }
    } catch {
      setMembership(null)
    }
  }, [project, user])

  useEffect(() => {
    void loadMembership()
  }, [loadMembership])

  // -------------------------------------------------------------------------
  // Derivados de tipo de usuário
  // -------------------------------------------------------------------------

  const isOwner = useMemo(
    () => Boolean(isAuthenticated && user && project && user.id === project.ownerId),
    [isAuthenticated, project, user],
  )
  const isMember = Boolean(membership) || isOwner
  const isLoggedNonMember = isAuthenticated && !isMember && !sessionLoading
  const isVisitor = !isAuthenticated && !sessionLoading

  // -------------------------------------------------------------------------
  // Helpers de UI
  // -------------------------------------------------------------------------

  const updatedAtLabel = useMemo(() => {
    if (!project) return ''
    const date = new Date(project.updatedAt)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [project])

  const visibilityLabel = project
    ? PROJECT_VISIBILITY_LABEL[project.visibility]
    : ''
  const VisibilityIcon = project?.visibility === 'private' ? Lock : Globe2

  const handleShare = async () => {
    if (!project) return
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: project.title,
          text: project.shortDescription,
          url,
        })
        return
      } catch {
        // share dialog cancelled, fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // ignore clipboard failure
    }
  }

  const handleRequestsChange = useCallback(async () => {
    // Após aprovar/recusar uma solicitação, recarrega o painel de equipe
    // para refletir o trigger que insere em project_members.
    await membersPreviewRef.current?.reload()
    await loadMembership()
  }, [loadMembership])

  // -------------------------------------------------------------------------
  // Estados intermediários
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-2/3 rounded-2xl bg-muted" />
            <div className="h-6 w-1/2 rounded-2xl bg-muted" />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="h-64 rounded-3xl bg-muted lg:col-span-2" />
              <div className="h-64 rounded-3xl bg-muted" />
            </div>
          </div>
        </Container>
      </main>
    )
  }

  if (envMissing) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <EmptyState
            icon={MessageCircle}
            title="Não foi possível carregar este projeto"
            description="Tente novamente em instantes. Se o problema continuar, volte para o explorar."
            actionLabel="Voltar para explorar"
            href="/explorar"
          />
        </Container>
      </main>
    )
  }

  if (fetchError && !project) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-destructive">
              Não foi possível carregar este projeto.
            </p>
            <Button
              onClick={() => void loadProject()}
              className="mt-4 rounded-2xl font-semibold"
            >
              Tentar novamente
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  if (notFound || !project) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <EmptyState
            icon={MessageCircle}
            title="Projeto não encontrado"
            description="O endereço acessado não corresponde a um projeto disponível. Ele pode ter sido removido ou estar com visibilidade restrita."
            actionLabel="Voltar para explorar"
            href="/explorar"
          />
        </Container>
      </main>
    )
  }

  // -------------------------------------------------------------------------
  // Badge do próprio membro (quando aplicável)
  // -------------------------------------------------------------------------

  const myBadge = membership
    ? computeMemberBadge({
        role: membership.role,
        display_role: membership.displayRole,
        badge_color: membership.badgeColor,
      })
    : null

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="bg-background pb-20">
      {/* Faixa superior compacta: breadcrumb + ações sociais */}
      <div className="border-b border-border bg-gradient-to-b from-muted/50 to-transparent">
        <Container className="space-y-5 py-6">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground sm:text-sm">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="font-semibold text-primary hover:underline">
                  Início
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href="/explorar" className="font-semibold text-primary hover:underline">
                  Explorar
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="min-w-0 max-w-[min(100vw-4rem,28rem)]">
                <span
                  className="block truncate font-semibold text-foreground"
                  title={project.title}
                >
                  {project.title}
                </span>
              </li>
            </ol>
          </nav>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" className="w-fit gap-2 rounded-2xl px-3 font-semibold">
              <Link href="/explorar">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <LikeButton
                projectId={project.id}
                initialCount={likesCount}
                onCountChange={setLikesCount}
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl font-semibold"
                onClick={() => void handleShare()}
              >
                <Share2 className="h-4 w-4" aria-hidden />
                Compartilhar
              </Button>
              {isOwner ? (
                <Button asChild variant="outline" className="rounded-2xl font-semibold">
                  <Link href={`/projetos/${project.slug}/editar`}>
                    <Pencil className="h-4 w-4" aria-hidden />
                    Editar projeto
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </Container>
      </div>

      {/* Grid principal: card grande do projeto + sidebar de equipe */}
      <Container className="py-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start">
          {/* Card grande do projeto (esquerda) */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="min-w-0 space-y-6 rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm sm:p-8"
          >
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {project.category ? <CategoryBadge label={project.category} /> : null}
              <ProjectStatusBadge status={project.status} />
              {updatedAtLabel ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Atualizado em {updatedAtLabel}
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {project.title}
              </h1>
              {project.shortDescription ? (
                <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
                  {project.shortDescription}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
              <UserAvatar
                name={project.ownerName}
                imageUrl={project.ownerAvatarUrl ?? undefined}
                sizeClassName="h-10 w-10"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Publicado por
                </p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {project.ownerName}
                </p>
                {project.ownerCourse ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {project.ownerCourse}
                  </p>
                ) : null}
              </div>
            </div>

            {project.tags.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tags
                </p>
                <TagList tags={project.tags} max={12} size="md" />
              </div>
            ) : null}

            {project.requiredSkills.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Habilidades procuradas
                </p>
                <div className="flex flex-wrap gap-2">
                  {project.requiredSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Resumo rápido em pills */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <QuickFact
                icon={Eye}
                label="Vagas disponíveis"
                value={`${project.openSpots} ${project.openSpots === 1 ? 'vaga' : 'vagas'}`}
              />
              <QuickFact
                icon={VisibilityIcon}
                label="Visibilidade"
                value={visibilityLabel}
              />
              <QuickFact icon={Users} label="Membros" value={String(membersCount)} />
              <QuickFact icon={Heart} label="Curtidas" value={String(likesCount)} />
            </div>

            {/* Banner de membro / barra de ações por tipo */}
            <ActionsArea
              isVisitor={isVisitor}
              isLoggedNonMember={isLoggedNonMember}
              isMember={isMember}
              myBadge={myBadge}
            />
          </motion.section>

          {/* Sidebar: equipe + (se for o caso) bloco de participação */}
          <aside className="min-w-0 space-y-6 lg:sticky lg:top-[96px]">
            <MembersPreviewCard
              ref={membersPreviewRef}
              projectId={project.id}
              projectOwnerId={project.ownerId}
              currentUserId={user?.id ?? null}
              onCountChange={setMembersCount}
            />

            {!isMember ? (
              <div id="participar">
                <JoinRequestSection
                  projectId={project.id}
                  ownerId={project.ownerId}
                />
              </div>
            ) : null}
          </aside>
        </div>

        {/* Seções inferiores */}
        <div className="mt-10 grid gap-6">
          {project.description ? (
            <section className="space-y-3 rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-xl font-semibold">Visão geral</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Acompanhe as informações principais do projeto.
              </p>
              <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            </section>
          ) : null}

          <section className="space-y-4 rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">
                  {project.openSpots} {project.openSpots === 1 ? 'vaga disponível' : 'vagas disponíveis'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isMember
                    ? 'Conheça o perfil que a equipe está buscando para essa vaga.'
                    : 'Solicite participação para colaborar com a equipe.'}
                </p>
              </div>
            </div>
            {project.desiredProfile ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {project.desiredProfile}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                A equipe ainda não detalhou o perfil ideal para essa vaga.
              </p>
            )}
          </section>

          {isOwner ? (
            <div id="solicitacoes" className="scroll-mt-24">
              <OwnerRequestsSection
                projectId={project.id}
                onChange={handleRequestsChange}
              />
            </div>
          ) : null}

          <CommentsSection
            projectId={project.id}
            initialCount={commentsCount}
            onCountChange={setCommentsCount}
          />
        </div>
      </Container>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Subcomponentes locais
// ---------------------------------------------------------------------------

function QuickFact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  )
}

interface ActionsAreaProps {
  isVisitor: boolean
  isLoggedNonMember: boolean
  isMember: boolean
  myBadge: { label: string; className: string } | null
}

function ActionsArea({
  isVisitor,
  isLoggedNonMember,
  isMember,
  myBadge,
}: ActionsAreaProps) {
  // Visitante deslogado
  if (isVisitor) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-5">
        <p className="text-sm font-semibold text-foreground">
          Entre para participar
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Entre na sua conta para solicitar participação e acompanhar projetos.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button asChild className="rounded-2xl font-semibold">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link href="/cadastro">Criar conta</Link>
          </Button>
        </div>
      </div>
    )
  }

  // Logado, mas não participa
  if (isLoggedNonMember) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-5">
        <p className="text-sm font-semibold text-foreground">
          Gostou do projeto?
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Solicite participação para colaborar com a equipe.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild className="rounded-2xl font-semibold">
            <Link href="#participar">
              <UserPlus className="h-4 w-4" aria-hidden />
              Solicitar participação
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  if (isMember) {
    return (
      <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.08] p-5 dark:bg-emerald-500/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Você faz parte deste projeto
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Acesse as conversas da equipe e acompanhe as informações do projeto.
            </p>
          </div>
          {myBadge ? (
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                myBadge.className,
              )}
            >
              {myBadge.label}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="rounded-2xl font-semibold">
            <Link href="/mensagens">
              <MessagesSquare className="h-4 w-4" aria-hidden />
              Abrir mensagens
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link href="#equipe-do-projeto">
              <Users className="h-4 w-4" aria-hidden />
              Ver equipe
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return null
}
