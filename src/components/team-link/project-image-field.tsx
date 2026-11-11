'use client'

import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ProjectLogo, type ProjectImageDraft } from './project-logo'

const maxBytes = 5 * 1024 * 1024
const formats = ['image/png', 'image/jpeg', 'image/webp']
async function squareImage(file: File) {
  if (file.size > maxBytes || !formats.includes(file.type)) throw Error('Envie um PNG, JPEG ou WEBP de até 5 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const header = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  const signature = file.type === 'image/png' ? header.startsWith('89504e470d0a1a0a')
    : file.type === 'image/jpeg' ? header.startsWith('ffd8ff')
    : header.startsWith('52494646') && header.endsWith('57454250')
  if (!signature) throw Error('O conteúdo do arquivo não corresponde ao formato informado.')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw Error('Não foi possível ler esta imagem.') }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 32_000_000) throw Error('A imagem tem dimensões muito grandes.')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) throw Error('Não foi possível preparar a imagem.')
    const scale = 512 / Math.max(bitmap.width, bitmap.height)
    const width = bitmap.width * scale, height = bitmap.height * scale
    ctx.drawImage(bitmap, (512 - width) / 2, (512 - height) / 2, width, height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Não foi possível preparar a imagem.')), 'image/png'))
  } finally { bitmap.close() }
}

export function ProjectImageField({ projectId, title, current, value, onChange, onProcessing, disabled }: {
  projectId?: string; title: string; current?: string | null; value?: ProjectImageDraft
  onChange: (next?: ProjectImageDraft) => void
  onProcessing: (value: boolean) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const hasImage = value?.mode === 'set' || (!value && Boolean(current))
  return <fieldset className="min-w-0 space-y-2" disabled={disabled || processing}>
    <legend className="mb-2 text-sm font-semibold">Imagem do projeto</legend>
    <div className="flex flex-wrap items-center gap-3">
      <ProjectLogo projectId={projectId} title={title} draft={value} />
      <div className="min-w-0 space-y-2">
        <p id={id} className="text-xs text-muted-foreground">Opcional. PNG, JPEG ou WEBP de até 5 MB.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" aria-describedby={id} onClick={() => input.current?.click()}>
            {hasImage ? 'Substituir imagem' : 'Enviar imagem'}
          </Button>
          {hasImage && <Button type="button" variant="ghost" size="sm" onClick={() => { setError(''); onChange(current ? { mode: 'remove' } : undefined) }}>Remover imagem</Button>}
          {value?.mode === 'remove' && <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>Desfazer remoção</Button>}
        </div>
      </div>
    </div>
    <input ref={input} type="file" accept={formats.join(',')} hidden onChange={async event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      setProcessing(true); onProcessing(true); setError('')
      try { onChange({ mode: 'set', file: await squareImage(file) }) }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível preparar a imagem.') }
      finally { setProcessing(false); onProcessing(false) }
    }} />
    {processing && <p role="status" className="text-sm text-muted-foreground">Preparando imagem…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </fieldset>
}
