'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, CheckSquare, FileText, GitBranch, LayoutDashboard, MessageSquare, PanelsTopLeft, Target, Users, X, ZoomIn, type LucideIcon } from 'lucide-react'
import { productScreens, type ProductScreen } from './product-screens'
import { nextShowcaseTab } from './showcase-navigation'
import styles from './home.module.css'

export type ShowcaseItem = {
  id: ProductScreen
  label: string
  title?: string
  description: string
}

const screenIcons:Record<ProductScreen,LucideIcon>={panel:PanelsTopLeft,space:LayoutDashboard,activities:CheckSquare,team:Users,goals:Target,messages:MessageSquare,documents:FileText,integrations:GitBranch}

function ScreenImage({ screen, enlarged = false }: { screen: ProductScreen; enlarged?: boolean }) {
  const { desktop, mobile, alt } = productScreens[screen]
  return <picture className={styles.screenImage} style={{ '--capture-desktop-width': desktop.width + 'px', '--capture-mobile-width': mobile.width + 'px' } as CSSProperties}>
    <source media="(max-width: 1023px)" srcSet={mobile.src} width={mobile.width} height={mobile.height} />
    {/* Already optimized WebP; picture provides the separately captured mobile composition. */}
    <img src={desktop.src} width={desktop.width} height={desktop.height} alt={alt} loading={enlarged ? 'eager' : 'lazy'} decoding="async" draggable={false} />
  </picture>
}

export function ProductShowcase({ items, id, label, preview = false }: { items: readonly ShowcaseItem[]; id: string; label: string; preview?: boolean }) {
  const [selected, setSelected] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  const active = items[selected]

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

  return <div className={preview ? styles.productFrame : styles.tour}>
    <div role="tablist" aria-label={label} className={styles.tourTabs + (preview ? ' ' + styles.previewTabs : '')} onKeyDown={event => {
      const destination = nextShowcaseTab(event.key, selected, items.length)
      if (destination !== null) { event.preventDefault(); setSelected(destination); tabs.current[destination]?.focus() }
    }}>
      {items.map(({ id: screen, label: text }, index) => {const Icon=screenIcons[screen];return <button key={screen} ref={element => { tabs.current[index] = element }} type="button" role="tab" id={`${id}-tab-${screen}`} aria-controls={`${id}-panel-${screen}`} aria-selected={index === selected} tabIndex={index === selected ? 0 : -1} onClick={() => setSelected(index)}><Icon aria-hidden className="size-4 shrink-0" /><span className={styles.tabLabel}>{text}</span><span aria-hidden="true" className={styles.tabSelection}><Check className="size-3.5" /></span></button>})}
    </div>
    {items.map((item, index) => <div key={item.id} role="tabpanel" id={`${id}-panel-${item.id}`} aria-labelledby={`${id}-tab-${item.id}`} hidden={selected !== index} tabIndex={0} className={styles.tourPanel}>
      {selected === index && <>
        {preview ? <p className={styles.previewDescription}>{item.description}</p> : <div className={styles.tourIntro}><div><h3>{item.title}</h3><p>{item.description}</p></div><span>Demonstração — dados ilustrativos</span></div>}
        <div className={styles.screenshotFrame + (preview ? ' ' + styles.previewScreenshot : '')}><ScreenImage screen={item.id} /></div>
        <div className={styles.captureFooter}><p>Captura de tela · {productScreens[item.id].caption}</p><button type="button" onClick={() => setExpanded(true)} aria-label={'Ampliar captura de ' + item.label}><ZoomIn aria-hidden className="size-4" />Ampliar captura</button></div>
      </>}
    </div>)}
    <dialog ref={dialog} className={styles.captureDialog} aria-label={'Captura ampliada de ' + active.label} onCancel={event => { event.preventDefault(); setExpanded(false) }} onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setExpanded(false)
    }}>
      <div className={styles.captureDialogHeader}><div><h2>{active.label}</h2><p>Demonstração — dados ilustrativos</p></div><button type="button" aria-label="Fechar captura ampliada" onClick={() => setExpanded(false)}><X aria-hidden className="size-5" /></button></div>
      {expanded && <div className={styles.screenshotFrame}><ScreenImage screen={active.id} enlarged /></div>}
      <p className={styles.captureDialogNote}>Captura da interface do Team Link. Acesse sua conta para utilizar os recursos.</p>
    </dialog>
  </div>
}
