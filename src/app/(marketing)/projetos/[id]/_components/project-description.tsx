'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Markdown from 'react-markdown'

import { Button } from '@/components/ui/button'

export function ProjectSummary({ text }: { text: string }) {
  return (
    <div className="break-words whitespace-pre-line text-base leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline">
      <Markdown skipHtml disallowedElements={['img']}>{text}</Markdown>
    </div>
  )
}

export function ProjectDescription({ text }: { text: string }) {
  const contentId = useId()
  const content = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [dimensions, setDimensions] = useState({ height: 0, limit: 0 })

  useEffect(() => {
    const element = content.current
    if (!element) return
    const measure = () => setDimensions({
      height: element.getBoundingClientRect().height,
      limit: parseFloat(getComputedStyle(element).lineHeight) * 4,
    })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const overflow = dimensions.height > dimensions.limit + 1
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Sobre o projeto</h2>
      <div id={contentId} className="relative overflow-hidden motion-safe:transition-[max-height] motion-safe:duration-300"
        style={{ maxHeight: expanded && dimensions.height ? dimensions.height : dimensions.limit || '6.5rem' }}>
        <div ref={content} className="flow-root break-words whitespace-pre-line text-base leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_code]:break-all [&_ol]:list-decimal [&_ul]:list-disc [&_ol]:pl-5 [&_ul]:pl-5 [&_p+p]:mt-2 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold">
          <Markdown skipHtml disallowedElements={['img']}
            components={overflow && !expanded ? { a: ({ children }) => <span>{children}</span> } : undefined}>
            {text}
          </Markdown>
        </div>
        {overflow && !expanded && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent" />}
      </div>
      {overflow && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-primary"
          aria-controls={contentId} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Ler menos' : 'Ler mais'}
        </Button>
      )}
    </div>
  )
}
