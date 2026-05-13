'use client'

import { HeroSection } from '@/components/ui/hero-section'
import { FeaturedIdeas } from '@/components/ui/featured-ideas'
import { HowItWorks } from '@/components/ui/how-it-works'
import { CategoriesShowcase } from '@/components/ui/categories-showcase'
import { StudentBenefitsSection } from '@/components/ui/student-benefits'
import { CTASection } from '@/components/ui/cta-section'
import { ScrollSection } from '@/components/ui/scroll-section'
import { useSmoothScroll } from '@/hooks/use-smooth-scroll'

export default function HomePage() {
  useSmoothScroll()

  return (
    <main id="topo" className="bg-background">
      <HeroSection />
      <ScrollSection>
        <HowItWorks />
      </ScrollSection>
      <ScrollSection>
        <FeaturedIdeas />
      </ScrollSection>
      <ScrollSection>
        <CategoriesShowcase />
      </ScrollSection>
      <ScrollSection>
        <StudentBenefitsSection />
      </ScrollSection>
      <ScrollSection>
        <CTASection />
      </ScrollSection>
    </main>
  )
}
