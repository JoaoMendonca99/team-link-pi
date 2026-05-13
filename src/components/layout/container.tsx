import * as React from "react"

import { cn } from "@/lib/utils"

const sizeClass = {
  /** Eixo principal do site (80rem / ~1280px) */
  site: "max-w-7xl",
  /** Formulários e leitura focada */
  narrow: "max-w-4xl",
  /** Textos curtos / confirmações */
  article: "max-w-3xl",
} as const

export type ContainerSize = keyof typeof sizeClass

export interface ContainerProps extends React.ComponentProps<"div"> {
  size?: ContainerSize
}

/**
 * Conteúdo centralizado com o mesmo eixo em header, footer e páginas.
 * Fundo full-bleed fica na `section`/`header`/`footer` pai; o conteúdo vem aqui dentro.
 */
export function Container({ className, size = "site", ...props }: ContainerProps) {
  return (
    <div
      className={cn("w-full px-4 sm:px-6 lg:px-8", sizeClass[size], "mx-auto", className)}
      {...props}
    />
  )
}
