'use client'

import { useEffect, useState } from 'react'
import { profileRpc } from '@/lib/profile-social'

export function usePresencePreference() {
  const [visibility, setVisibility] = useState<boolean | null>(null)
  const [savedVisibility, setSavedVisibility] = useState<boolean | null>(null)
  const [presenceError, setPresenceError] = useState(false)
  useEffect(() => {
    let active = true
    void profileRpc<boolean>('get_my_presence_visibility').then(value => {
      if (active) { setVisibility(value); setSavedVisibility(value) }
    }).catch(() => { if (active) setPresenceError(true) })
    return () => { active = false }
  }, [])
  async function saveVisibility() {
    if (visibility !== null && visibility !== savedVisibility) {
      await profileRpc('set_my_presence_visibility', { p_visible: visibility })
      setSavedVisibility(visibility)
    }
  }
  return { visibility, setVisibility, presenceError, saveVisibility }
}

export function PresenceControl({ value, onChange, disabled, error }: { value:boolean|null; onChange:(value:boolean)=>void; disabled?:boolean; error?:boolean }) {
  return <div className="space-y-2"><label className="flex items-start gap-3">
    <input type="checkbox" checked={value === true} disabled={disabled || value === null} id="profile-presence" onChange={event => onChange(event.target.checked)} aria-describedby="profile-presence-help" className="mt-1 size-4 scroll-mt-24 accent-primary" />
    <span><span className="block text-sm font-semibold">Mostrar meu status online</span><span id="profile-presence-help" className="block text-xs text-muted-foreground">Permitir que seus amigos vejam quando você está online e sua última atividade.</span></span>
  </label>{error && <p role="alert" className="text-xs text-destructive">Não foi possível carregar sua preferência de presença. Recarregue a página para alterá-la.</p>}</div>
}
