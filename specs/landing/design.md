# 설계: 랜딩 페이지

## 개요
- 승인된 목업(`docs/mockups/landing/landing-mockup.dc.html`)의 inline 스타일을 섹션별 CSS Module로 옮긴다. 색·글꼴 값은 `src/app/globals.css`의 CSS 변수 한 곳에 둔다 (UI_GUIDE 표 값. 호박 글자는 `#A84B08`)
- 기본은 Server Component다. 값이 바뀌는 히어로 차트 하나만 `'use client'`다
- 목업의 `DCLogic`(2600ms마다 tick + 1, 모션 줄이기면 멈춤)은 순수 함수 `heroFrame`·`startHeroTicker`로 옮겨 시험한다
- 새 패키지는 넣지 않는다. 화면 시험은 Vitest node 환경에서 `react-dom/server`의 `renderToStaticMarkup`으로 마크업 글자를 본다

## 구성 요소 / 인터페이스
```
src/app/
  globals.css            # 색·글꼴 변수, body(흰 배경·keep-all), 모션 줄이기 규칙
  layout.tsx             # next/font/google: IBM Plex Sans KR(400·500·600·700), Space Grotesk(500·600·700) → --font-sans, --font-num
  page.tsx               # 섹션을 목업 순서로 놓기만 한다
src/components/landing/
  links.ts               # export const START_HREF = '/login'
  images.ts              # export const LANDING_IMAGES: Record<ImageKey, { src: `/landing/${string}.jpg`; alt: string; width: number; height: number }>
  heroFrames.ts          # 아래 시그니처
  HeroChart.tsx (+ .module.css)   # 'use client'. 도넛·막대 6개·떠 있는 카드 3개·"숫자는 예시"
  SiteHeader.tsx · Hero.tsx · PromiseBand.tsx
  AiSection.tsx · OrthoSection.tsx · FeaturesSection.tsx
  PrivacySection.tsx · HowSection.tsx · StartSection.tsx · SiteFooter.tsx
  (각자 같은 이름의 .module.css)
public/landing/          # 승인본 그림 6장 복사
```

```ts
// heroFrames.ts
export const HERO_INTERVAL_MS = 2600
export type HeroFrame = { visits: number; newRate: string; ringPct: number; bars: readonly number[] } // bars 길이 6, 단위 %
export function heroFrame(tick: number): HeroFrame
export function startHeroTicker(opts: {
  reduce: boolean
  onTick: (tick: number) => void
  intervalMs?: number // 기본 HERO_INTERVAL_MS
}): () => void // 정리 함수. reduce면 타이머를 만들지 않고 빈 함수를 돌려준다
```
- `HeroChart`: `useState(0)`으로 틱을 들고, `useEffect`에서 `matchMedia('(prefers-reduced-motion: reduce)').matches`를 `reduce`로 넘겨 `startHeroTicker`를 시작하고 정리 함수를 돌려준다. 서버 그림은 틱 0
- 도넛: `<circle pathLength="100" stroke-dasharray="{ringPct} 100">`. 막대: `height: {n}%` + `transition: height 1.2s`. 막대 색은 UI_GUIDE 순서(`#9CC2FF → … → #0B1530`)
- 그림: `next/image`에 `unoptimized`를 준다 — 50~110KB jpg라 최적화 서버가 필요 없고, 경로가 `/landing/…` 그대로 나온다. `width`·`height`는 실제 파일 크기

## 데이터 흐름
- 없음. 서버·DB·브라우저 저장소·네트워크를 쓰지 않는다. 히어로 틱은 화면 안 state뿐이다

## 결정과 트레이드오프
- CSS Modules (사용자 결정): 새 패키지 없음. 목업 inline 값을 그대로 옮기기 쉽다. 섹션마다 파일을 나눠 TASK끼리 같은 파일을 고치지 않게 한다
- 모션 줄이기: CSS 쪽은 `globals.css` 전역 규칙 하나로 모든 `animation`·`transition`을 끈다. JS 쪽은 `startHeroTicker`가 타이머를 만들지 않는다. 멈춘 화면도 틱 0 값으로 읽힌다
- 목업의 질문 칩·보내기 버튼·질문 입력칸·파일 놓는 칸은 `button`·`input`이 아닌 `span`·`div`로 그린다. 랜딩은 아무것도 받지 않는다(개인정보 약속과 같은 결). 누를 수 있어 보이지 않게 `cursor`는 기본값
- `svg`는 모두 `aria-hidden="true"`. 예시 숫자는 떠 있는 카드 글자로 읽힌다
- 시험: 마크업 글자 검사(정규식·`includes`)만 한다. 픽셀이 목업과 같은지는 시험하지 않는다 → 구현 뒤 `npm run dev` 화면을 사용자가 캔버스와 비교해 본다
- Vitest 설정에 `src/**/*.test.tsx`를 더하고 JSX를 automatic 런타임으로 변환한다(tsconfig는 Next용 `jsx: preserve`라 그대로 두면 시험이 못 읽는다)
- 좁은 화면(폭 720px 미만)에서는 메뉴의 섹션 링크 4개를 숨기고 로고와 [구글로 시작하기]만 둔다. 두 칸 배치는 `flex-wrap`으로 아래로 쌓인다 **(Claude 판단, 목업은 PC 1440px만 있음)**
- `layout.tsx`의 `next/font`는 Next 빌드에서만 돈다 → 시험 대신 `npm run build`로 확인한다
- 문서: CLAUDE.md "스타일링: 미정" → CSS Modules, ARCHITECTURE.md "화면 컴포넌트 폴더·Server/Client" 미정 → 이번 결정, ADR-012(히어로 영상 → 코드 차트) 고침 + ADR-013(CSS Modules) 추가. 한두 줄씩만 고친다

## 위험 / 미해결 질문
- `next/image`·CSS Module을 Vitest node 환경에서 import할 때 오류가 나면, 시험 설정에서 CSS Module을 빈 클래스 객체로 돌려주게 하거나 그림만 `<img>`로 바꾼다(`@next/next/no-img-element` 경고는 이유와 함께 끈다). TASK-1에서 먼저 확인한다
- `next/font/google`은 빌드할 때 Google에서 글꼴을 받는다. 빌드 환경에 네트워크가 없으면 실패한다 (Vercel은 됨)
- 서비스 이름·문의 메일이 정해지면 `[서비스 이름]`·`[이메일 주소]`와 그 시험(AC-005.2)을 함께 고친다
