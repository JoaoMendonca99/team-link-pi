import Link from "next/link"
import { Link2, Sparkles } from "lucide-react"

import { Container } from "@/components/layout/container"

const footerColumns = [
  {
    title: "Produto",
    links: [
      { href: "/explorar", label: "Explorar" },
      { href: "/nova-ideia", label: "Nova ideia" },
      { href: "/#como-funciona", label: "Como funciona" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { href: "/sobre", label: "Sobre" },
      { href: "/ajuda", label: "Ajuda" },
      { href: "/contato", label: "Contato" },
    ],
  },
  {
    title: "Conta",
    links: [
      { href: "/login", label: "Login" },
      { href: "/cadastro", label: "Cadastro" },
      { href: "/perfil", label: "Perfil" },
      { href: "/meus-projetos", label: "Meus projetos" },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 pb-10 pt-14 text-foreground dark:border-border dark:bg-card/50">
      <Container>
        <div className="grid gap-12 text-center md:grid-cols-2 md:text-left lg:grid-cols-4">
          <div className="flex flex-col items-center space-y-4 md:items-start">
            <div className="flex items-center gap-2 text-lg font-bold">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Link2 className="h-5 w-5" aria-hidden />
              </span>
              Team Link
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Plataforma para publicar projetos, encontrar colaboradores e formar equipes.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-card-outline bg-card px-4 py-2 text-xs font-semibold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              Conecte ideias a pessoas
            </div>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title} className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                {column.title}
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-primary focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-2 border-t border-border/80 pt-8 text-center text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:text-left">
          <p>&copy; {new Date().getFullYear()} Team Link. Todos os direitos reservados.</p>
          <p className="text-xs md:text-sm">Conectando ideias, pessoas e projetos.</p>
        </div>
      </Container>
    </footer>
  )
}
