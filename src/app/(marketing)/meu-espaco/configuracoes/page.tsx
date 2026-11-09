'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PushSettings } from '@/components/notifications/push-settings'
import { useThemeMode } from '@/components/providers/theme-provider'
import { PresenceControl, usePresencePreference } from '@/components/profile/presence-preference'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { FirstStepsPreference } from '@/components/profile/first-steps-preference'

function PrivacySettings() {
  const {visibility,setVisibility,presenceError,saveVisibility} = usePresencePreference()
  const [busy,setBusy] = useState(false),[error,setError] = useState(''),[status,setStatus] = useState('')
  return <section id="privacidade" className="scroll-mt-24 space-y-4 rounded-2xl border border-border bg-card p-4">
    <h2 className="text-lg font-semibold">Privacidade</h2>
    <PresenceControl value={visibility} onChange={value=>{setVisibility(value);setStatus('')}} disabled={busy} error={presenceError}/>
    <Button disabled={busy||visibility===null} variant="outline" onClick={async()=>{setBusy(true);setError('');setStatus('');try{await saveVisibility();setStatus('Preferência de privacidade salva.')}catch{setError('Não foi possível salvar a preferência. Tente novamente.')}finally{setBusy(false)}}}>{busy?'Salvando…':'Salvar privacidade'}</Button>
    {status&&<p role="status" className="text-sm text-primary">{status}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}

export default function Page() {
  const {darkMode,setTheme} = useThemeMode(),{user} = useSupabaseSession()
  return <div className="mx-auto max-w-3xl space-y-5"><header className="space-y-2"><h1 className="text-2xl font-bold">Configurações</h1><p className="text-sm text-muted-foreground">Suas preferências de aparência, notificações, privacidade e conta.</p></header>
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4"><h2 className="text-lg font-semibold">Aparência</h2><fieldset className="flex flex-wrap gap-3"><legend className="sr-only">Tema do Team Link</legend>{[{value:'dark',label:'Escuro',icon:Moon},{value:'light',label:'Claro',icon:Sun}].map(item=><label key={item.value} className={'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm '+((darkMode?'dark':'light')===item.value?'border-primary bg-primary/10':'border-border')}><input type="radio" name="workspace-theme" value={item.value} checked={(darkMode?'dark':'light')===item.value} onChange={()=>setTheme(item.value as 'dark'|'light')}/><item.icon className="size-4" aria-hidden/>{item.label}</label>)}</fieldset><p className="text-xs text-muted-foreground">Sua escolha é aplicada imediatamente e fica salva neste navegador. O padrão é escuro.</p></section>
    {user&&<FirstStepsPreference key={user.id} userId={user.id}/>}
    <PushSettings/>
    {user&&<PrivacySettings key={user.id}/>}
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4"><h2 className="text-lg font-semibold">Conta</h2><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/meu-espaco/perfil/editar">Editar informações pessoais</Link></Button><Button asChild variant="outline"><Link href="/login?recuperar=1">Recuperar ou redefinir senha</Link></Button></div></section>
  </div>
}
