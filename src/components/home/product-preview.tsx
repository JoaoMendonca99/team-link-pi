import { LayoutDashboard } from 'lucide-react'
import { ProductShowcase, type ShowcaseItem } from './product-showcase'
import styles from './home.module.css'

const screens = [
  { id: 'panel', label: 'Painel do projeto', description: 'O painel que a equipe utiliza: período atual, resumo de atividades, metas e integrantes.' },
  { id: 'space', label: 'Meu Espaço', description: 'Sua área pessoal: projetos, atividades, candidaturas, revisões e conexões em uma navegação centralizada.' },
] as const satisfies readonly ShowcaseItem[]

export function ProductPreview() {
  return <figure className={styles.productFigure}>
    <figcaption className={styles.previewCaption}><span><LayoutDashboard aria-hidden className="size-3.5" />Uma visão do seu ambiente</span><span>Demonstração — dados ilustrativos</span></figcaption>
    <ProductShowcase id="environment" label="Telas reais do Team Link" items={screens} preview />
  </figure>
}
