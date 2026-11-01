import type { Metadata } from 'next'
// 공통 모양을 섹션 모듈보다 먼저 불러온다. CSS가 이 순서로 붙어, 구체성이 같으면 섹션 모듈이 이긴다(design.md 'CSS 적용 순서')
import base from '@/components/landing/base.module.css'
import AiSection from '@/components/landing/AiSection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import Hero from '@/components/landing/Hero'
import HowSection from '@/components/landing/HowSection'
import OrthoSection from '@/components/landing/OrthoSection'
import PrivacySection from '@/components/landing/PrivacySection'
import SiteFooter from '@/components/landing/SiteFooter'
import SiteHeader from '@/components/landing/SiteHeader'

// 브라우저 탭 이름 (ui-90 AC-402.2)
export const metadata: Metadata = { title: '숫자로 보는 우리 의원' }

// 랜딩(/): 승인된 시안(docs/mockups/ui-90/entry/screens.mjs landingPC·landingPhone) 순서로 섹션 6개를 놓기만 한다(specs/b2b-redesign AC-211.2).
// 옛 시작하기 섹션(#start)은 #how에 합쳤다. 메뉴 띠·푸터는 main 밖에 둬서 banner·contentinfo 영역으로 읽히게 한다.
// 첫 조작 요소는 건너뛰기 링크이고 본문 main#main을 가리킨다(specs/ui-90 AC-421.1, 키보드 초점일 때만 보임).
// 뿌리 감싸개(base.root) 하나가 랜딩 초기화·기본 글자를 맡는다. 앱 화면에는 새지 않는다(specs/landing-v2 AC-105.1)
export default function Home() {
  return (
    <div className={base.root}>
      <a href="#main" className={base.skip}>
        본문으로 건너뛰기
      </a>
      <SiteHeader />
      {/* 건너뛰기 링크가 가리키는 본문. 앱 틀처럼 초점을 받을 수 있게 tabIndex -1(Tab 차례에는 들지 않는다) */}
      <main id="main" tabIndex={-1} className={base.main}>
        <Hero />
        <AiSection />
        <OrthoSection />
        <FeaturesSection />
        <PrivacySection />
        <HowSection />
      </main>
      <SiteFooter />
    </div>
  )
}
