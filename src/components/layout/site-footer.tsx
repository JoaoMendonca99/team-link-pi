"use client"

import Link from "next/link"
import { Link2 } from "lucide-react"

import { Container } from "@/components/layout/container"
import { useNavigationSession } from "@/components/profile/friendships-provider"
import styles from "./site-footer.module.css"

const platformLinks = [
  { href: "/explorar", label: "Projetos publicados" },
  { href: "/sobre", label: "Sobre" },
  { href: "/ajuda", label: "Ajuda" },
]
const memberLinks = [
  { href: "/meu-espaco", label: "Meu Espaço" },
  { href: "/meu-espaco/perfil", label: "Meu perfil" },
]
const guestLinks = [
  { href: "/login", label: "Entrar" },
  { href: "/cadastro", label: "Criar conta" },
]

export function SiteFooter() {
  const { loading, isAuthenticated } = useNavigationSession()
  const accountLinks = isAuthenticated ? memberLinks : guestLinks

  return (
    <footer className={`dark ${styles.footer}`}>
      <Container>
        <div className={styles.grid}>
          <div className={styles.brand}>
            <Link href="/" className={styles.logo}>
              <span className={styles.logoMark}><Link2 className="h-5 w-5" aria-hidden /></span>
              Team Link
            </Link>
            <p className={styles.tagline}>Seu projeto inteiro. Um só lugar.</p>
          </div>

          <nav aria-labelledby="footer-platform-title">
            <h2 id="footer-platform-title" className={styles.heading}>Plataforma</h2>
            <ul className={styles.links}>
              {platformLinks.map(link => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}
            </ul>
          </nav>

          <nav aria-labelledby="footer-account-title" aria-busy={loading}>
            <h2 id="footer-account-title" className={styles.heading}>{!loading && isAuthenticated ? "Minha conta" : "Conta"}</h2>
            {loading ? (
              <p role="status" className={styles.loading}>Carregando conta…</p>
            ) : (
              <ul className={styles.links}>
                {accountLinks.map(link => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}
              </ul>
            )}
          </nav>
        </div>

        <div className={styles.bottom}>
          <p>&copy; {new Date().getFullYear()} Team Link. Todos os direitos reservados.</p>
        </div>
      </Container>
    </footer>
  )
}
