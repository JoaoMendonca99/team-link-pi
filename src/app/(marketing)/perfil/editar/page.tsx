'use client'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProfileForm } from '@/components/profile/profile-form'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

export default function EditProfilePage() {
  const { loading, isAuthenticated, profile } = useSupabaseSession()
  return <main className="bg-background">
    <Container size="article" className="space-y-5 py-8">
      <Button asChild variant="ghost"><Link href="/perfil"><ArrowLeft aria-hidden /> Perfil</Link></Button>
      <h1 className="text-2xl font-bold">Editar perfil</h1>
      <Link className="text-sm text-primary underline" href="/perfil/notificacoes">Configurar notificações</Link>
      {loading ? <p role="status">Carregando perfil…</p> : !isAuthenticated ?
        <Button asChild><Link href="/login">Entre na sua conta</Link></Button> : profile ?
          <ProfileForm key={profile.id} profile={profile} /> :
          <p role="alert">Não foi possível carregar seus dados. Recarregue a página para tentar novamente.</p>}
    </Container>
  </main>
}
