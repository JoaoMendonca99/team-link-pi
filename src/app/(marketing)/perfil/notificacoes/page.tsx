'use client'
import Link from 'next/link'
import { PushSettings } from '@/components/notifications/push-settings'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
export default function NotificationsPage(){const {user,loading}=useSupabaseSession();return <main className="mx-auto max-w-2xl space-y-4 px-4 py-8"><Link className="text-primary underline" href="/perfil/editar">Voltar ao perfil</Link>{!loading&&!user?<Link href="/login?next=%2Fperfil%2Fnotificacoes">Entre para configurar as notificações.</Link>:<PushSettings/>}</main>}
