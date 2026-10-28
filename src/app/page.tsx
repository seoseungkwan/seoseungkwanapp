import AiSection from '@/components/landing/AiSection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import Hero from '@/components/landing/Hero'
import HowSection from '@/components/landing/HowSection'
import OrthoSection from '@/components/landing/OrthoSection'
import PrivacySection from '@/components/landing/PrivacySection'
import PromiseBand from '@/components/landing/PromiseBand'
import SiteFooter from '@/components/landing/SiteFooter'
import SiteHeader from '@/components/landing/SiteHeader'
import StartSection from '@/components/landing/StartSection'

// 랜딩(/): 승인된 목업(docs/mockups/landing/landing-mockup.dc.html) 순서로 섹션을 놓기만 한다.
// 메뉴 띠·푸터는 main 밖에 둬서 banner·contentinfo 영역으로 읽히게 한다
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <PromiseBand />
        <AiSection />
        <OrthoSection />
        <FeaturesSection />
        <PrivacySection />
        <HowSection />
        <StartSection />
      </main>
      <SiteFooter />
    </>
  )
}
