'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, CheckSquare, ChevronLeft, ChevronRight, FileText, GitBranch, LayoutDashboard, MessageSquare, PanelsTopLeft, Target, Users, X, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react'
import { galleryScreens, productScreens, type ProductScreen } from './product-screens'
import { nextShowcaseTab, showcaseSwipeStep } from './showcase-navigation'
import styles from './home.module.css'

export type ShowcaseItem = {
  id: ProductScreen
  label: string
  title?: string
  description: string
}

const screenIcons: Record<ProductScreen, LucideIcon> = { panel: PanelsTopLeft, space: LayoutDashboard, activities: CheckSquare, team: Users, goals: Target, messages: MessageSquare, documents: FileText, integrations: GitBranch }

function ScreenImage({ screen, enlarged = false, desktopOnly = false }: { screen: ProductScreen; enlarged?: boolean; desktopOnly?: boolean }) {
  const { desktop, mobile, alt } = productScreens[screen]
  const image = enlarged ? galleryScreens.find(item => item.id === screen)!.image : desktop
  return <picture className={styles.screenImage} style={{ '--capture-desktop-width': image.width + 'px', '--capture-mobile-width': mobile.width + 'px' } as CSSProperties}>
    {!desktopOnly && <source media="(max-width: 1023px)" srcSet={mobile.src} width={mobile.width} height={mobile.height} />}
    {/* Pre-optimized WebP: full native resolution is fetched only when the gallery opens. */}
    <img src={image.src} width={image.width} height={image.height} alt={alt} loading={enlarged ? 'eager' : 'lazy'} decoding="async" draggable={false} />
  </picture>
}

export function ProductShowcase({ items, id, label, preview = false }: { items: readonly ShowcaseItem[]; id: string; label: string; preview?: boolean }) {
  const [selected, setSelected] = useState(0)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [desktopOnly, setDesktopOnly] = useState(false)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null)
  const expanded = galleryIndex !== null
  const active = galleryScreens[galleryIndex ?? 0]

  function openGallery(screen: ProductScreen) {
    setZoomed(false)
    setDesktopOnly(false)
    setGalleryIndex(galleryScreens.findIndex(item => item.id === screen))
  }
  function navigate(step: number) {
    setZoomed(false)
    setGalleryIndex(current => current === null ? null : (current + step + galleryScreens.length) % galleryScreens.length)
  }

  useEffect(() => {
    if (!expanded) return
    const element = dialog.current, previous = document.activeElement as HTMLElement | null
    const viewport = document.documentElement, { overflow, scrollbarGutter } = viewport.style
    if (viewport.clientWidth < innerWidth) viewport.style.scrollbarGutter = 'stable'
    viewport.style.overflow = 'hidden'
    element?.showModal()
    return () => {
      element?.close()
      viewport.style.overflow = overflow
      viewport.style.scrollbarGutter = scrollbarGutter
      previous?.focus({ preventScroll: true })
    }
  }, [expanded])

  useEffect(() => {
    stage.current?.scrollTo({ top: 0, left: 0 })
    drag.current = null
  }, [galleryIndex, zoomed, desktopOnly])

  return <div className={preview ? styles.productFrame : styles.tour}>
    <div role="tablist" aria-label={label} className={styles.tourTabs + (preview ? ' ' + styles.previewTabs : '')} onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const destination = nextShowcaseTab(event.key, selected, items.length)
      if (destination !== null) { event.preventDefault(); setSelected(destination); tabs.current[destination]?.focus() }
    }}>
      {items.map(({ id: screen, label: text }, index) => {
        const Icon = screenIcons[screen]
        return <button key={screen} ref={element => { tabs.current[index] = element }} type="button" role="tab" id={`${id}-tab-${screen}`} aria-controls={`${id}-panel-${screen}`} aria-selected={index === selected} tabIndex={index === selected ? 0 : -1} onClick={() => setSelected(index)}><Icon aria-hidden className="size-4 shrink-0" /><span className={styles.tabLabel}>{text}</span><span aria-hidden="true" className={styles.tabSelection}><Check className="size-3.5" /></span></button>
      })}
    </div>
    {items.map((item, index) => <div key={item.id} role="tabpanel" id={`${id}-panel-${item.id}`} aria-labelledby={`${id}-tab-${item.id}`} hidden={selected !== index} tabIndex={0} className={styles.tourPanel}>
      {selected === index && <>
        {preview ? <p className={styles.previewDescription}>{item.description}</p> : <div className={styles.tourIntro}><div><h3>{item.title}</h3><p>{item.description}</p></div><span>Demonstração — dados ilustrativos</span></div>}
        <button type="button" className={`${styles.screenshotFrame} ${styles.captureTrigger}${preview ? ' ' + styles.previewScreenshot : ''}`} aria-label={'Abrir galeria: ' + item.label} aria-haspopup="dialog" onClick={() => openGallery(item.id)}><ScreenImage screen={item.id} /></button>
        <div className={styles.captureFooter}><p>Captura de tela · {productScreens[item.id].caption}</p><button type="button" onClick={() => openGallery(item.id)} aria-label={'Ampliar captura de ' + item.label} aria-haspopup="dialog"><ZoomIn aria-hidden className="size-4" />Ampliar captura</button></div>
      </>}
    </div>)}
    <dialog ref={dialog} className={styles.captureDialog} aria-label="Galeria de capturas do Team Link" aria-describedby={`${id}-gallery-note`} onCancel={event => { event.preventDefault(); setGalleryIndex(null) }} onKeyDown={event => {
      if (event.key === 'Tab') {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),[tabindex="0"]')).filter(element => element.getClientRects().length > 0)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigate(event.key === 'ArrowLeft' ? -1 : 1) }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setZoomed(false); setGalleryIndex(event.key === 'Home' ? 0 : galleryScreens.length - 1) }
    }} onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setGalleryIndex(null)
    }}>
      <div className={styles.captureDialogHeader}><div><h2>{active.label}</h2><p>Demonstração — dados ilustrativos</p></div><button type="button" aria-label="Fechar galeria" onClick={() => setGalleryIndex(null)}><X aria-hidden className="size-5" /></button></div>
      <div ref={stage} className={styles.captureStage} data-zoomed={zoomed} data-desktop={desktopOnly} tabIndex={zoomed ? 0 : -1} aria-label="Captura; em tamanho original, use a rolagem para explorar os detalhes" onKeyDown={event => {
        if (zoomed && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) event.stopPropagation()
      }} onPointerDown={event => {
        if (zoomed || event.button !== 0 || !event.isPrimary) return
        drag.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerUp={event => {
        const start = drag.current
        drag.current = null
        if (!start || start.pointer !== event.pointerId || zoomed) return
        const step = showcaseSwipeStep(event.clientX - start.x, event.clientY - start.y)
        if (step) navigate(step)
      }} onPointerCancel={() => { drag.current = null }}>
        {expanded && <ScreenImage key={active.id + String(desktopOnly)} screen={active.id} enlarged desktopOnly={desktopOnly} />}
      </div>
      <div className={styles.galleryToolbar}>
        <div className={styles.galleryNavigation}><button type="button" aria-label="Captura anterior" onClick={() => navigate(-1)}><ChevronLeft aria-hidden className="size-5" /></button><p role="status" aria-live="polite" aria-atomic="true">{(galleryIndex ?? 0) + 1} de {galleryScreens.length}</p><button type="button" aria-label="Próxima captura" onClick={() => navigate(1)}><ChevronRight aria-hidden className="size-5" /></button></div>
        <div className={styles.galleryViewControls}>
          <button type="button" className={styles.galleryFormat} aria-pressed={desktopOnly} aria-label={desktopOnly ? 'Ver captura adaptada ao dispositivo' : 'Ver captura desktop em Full HD'} onClick={() => { setZoomed(false); setDesktopOnly(value => !value) }}>{desktopOnly ? 'Mobile' : 'HD'}</button>
          <button type="button" aria-pressed={zoomed} aria-label={zoomed ? 'Ajustar captura à tela' : 'Ver captura em tamanho original'} onClick={() => setZoomed(value => !value)}>{zoomed ? <ZoomOut aria-hidden className="size-4" /> : <ZoomIn aria-hidden className="size-4" />}<span>{zoomed ? 'Ajustar' : '100%'}</span></button>
        </div>
      </div>
      <p id={`${id}-gallery-note`} className={styles.captureDialogNote}>Interface real do Team Link · Arraste para os lados ou use as setas. Em 100%, role a imagem para ler os detalhes.</p>
    </dialog>
  </div>
}
