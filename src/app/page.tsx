// 공통 모양을 섹션 모듈보다 먼저 불러온다. CSS가 이 순서로 붙어, 구체성이 같으면 섹션 모듈이 이긴다(design.md 'CSS 적용 순서')
import base from '@/components/landing/base.module.css'
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

// 랜딩(/): 승인된 시안(docs/mockups/landing-v2/index.html) 순서로 섹션을 놓기만 한다.
// 메뉴 띠·푸터는 main 밖에 둬서 banner·contentinfo 영역으로 읽히게 한다.
// 뿌리 감싸개(base.root) 하나가 랜딩 초기화·기본 글자를 맡는다. 앱 화면에는 새지 않는다(specs/landing-v2 AC-105.1)
export default function Home() {
  return (
    <div className={base.root}>
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
    </div>
  )
}
