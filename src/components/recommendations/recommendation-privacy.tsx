'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { notifyRecommendations, RECOMMENDATION_PRIVACY_CHANGED } from '@/lib/graph/events'

export function RecommendationPrivacy({ userId }: { userId:string }) {
  const [sharing,setSharing] = useState<boolean>()
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [saved,setSaved] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    void getSupabaseClient().from('graph_preferences').select('share_connections').eq('user_id',userId).abortSignal(abort.signal).maybeSingle()
      .then(({data,error}) => {
        if (abort.signal.aborted) return
        if (error) setError('Não foi possível consultar esta preferência.')
        else setSharing(data?.share_connections ?? false)
      })
    return () => abort.abort()
  },[userId])
  async function save(next:boolean) {
    setBusy(true);setError('');setSaved(false)
    try {
      const {error} = await getSupabaseClient().from('graph_preferences').upsert({user_id:userId,share_connections:next})
      if (error) throw error
      setSharing(next);setSaved(true)
      notifyRecommendations(RECOMMENDATION_PRIVACY_CHANGED)
    } catch { setError('Não foi possível salvar esta preferência. Tente novamente.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-3 border-t border-border pt-4">
    <h3 className="font-medium">Recomendações</h3>
    <p className="text-sm text-muted-foreground">As sugestões usam habilidades, interesses, formação e participações que já podem ser consultadas. Esses dados são opcionais. Em Explorar vagas, você pode ordenar por data ou nome.</p>
    <p className="text-sm text-muted-foreground">Amizades aceitas só influenciam as sugestões quando as duas pessoas permitem. A escolha é opcional, começa desligada e pode ser revogada aqui. O conteúdo de conversas não é usado.</p>
    <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={sharing??false} disabled={busy||sharing===undefined} onChange={event=>void save(event.target.checked)}/>Utilizar minhas conexões de amizade para melhorar sugestões.</label>
    {busy&&<p role="status" className="text-xs text-muted-foreground">Salvando…</p>}
    {saved&&<p role="status" className="text-xs text-link">Preferência de recomendações salva.</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
