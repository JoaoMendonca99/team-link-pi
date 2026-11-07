'use client'
import { ProfileForm } from '@/components/profile/profile-form'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
export default function Page() { const {profile}=useSupabaseSession(); return <div className="mx-auto max-w-3xl space-y-5"><h1 className="text-2xl font-bold">Editar perfil</h1>{profile?<ProfileForm key={profile.id} profile={profile} backHref="/meu-espaco/perfil"/>:<p role="status">Carregando perfil…</p>}</div> }
