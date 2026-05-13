'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Cpu, Droplets, HeartPulse, Layers, Radar } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { CategoryBadge } from '@/components/team-link/category-badge'
import { projectCategories } from '@/data/mock-projects'

const icons = [Cpu, Radar, Droplets, HeartPulse, Layers] as const

export function CategoriesShowcase() {
  return (
    <section className="border-b border-border bg-background py-20">
      <Container className="space-y-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Áreas de interesse</p>
          <h2 className="mt-4 text-balance text-4xl font-bold">Catálogo multidisciplinar</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Use categorias para encontrar projetos alinhados aos seus interesses e habilidades.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {projectCategories.map((category, index) => {
            const Icon = icons[index % icons.length]!
            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.3, delay: index * 0.04, ease: 'easeOut' }}
                className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-[1.65rem] border border-border bg-card p-6 shadow-sm md:mx-0 md:max-w-none"
              >
                <Icon className="h-9 w-9 text-[#2563EB]" aria-hidden />
                <CategoryBadge label={category} className="w-fit bg-secondary/70" />
                <p className="text-sm text-muted-foreground">
                  Veja os projetos abertos nesta área e descubra equipes para colaborar.
                </p>
                <Button asChild variant="ghost" className="justify-start px-0 font-semibold text-primary">
                  <Link href={`/explorar?category=${encodeURIComponent(category)}`}>Filtrar no explorar</Link>
                </Button>
              </motion.div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
