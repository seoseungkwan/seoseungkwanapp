# 설계: 탭 13개 틀과 대시보드 첫 화면 (1안 오늘 브리핑)

## 개요

**무엇이 바뀌나.** 앱 틀의 탭 줄을 13개로 다시 짜고, 아직 없는 기능도 모두 진짜 링크로 만든다. 그 링크는 기능마다 자기 주소의 '준비 중' 화면으로 간다. `/dashboard`는 빈 안내 상자 대신 총괄이 고른 "1안 오늘 브리핑"이 된다: 날짜 줄과 큰 문장 하나 + [비트 PC 연결 시작] + 연결 순서 5단계 → 지금 바로 쓸 수 있어요(사전점검) → 오늘 하루 분석(숫자 4칸) → 기간별 흐름(기간 단추 + 그래프 넷) → 기능 목차(12개). 관리자 탭은 계정 메뉴의 [가입 승인]으로 옮긴다.

**자료.** 서버에는 아직 저장된 통계가 없고, 이 명세는 표·API·DB를 만들지 않는다. 대시보드는 자료 읽는 자리(`dashboardSummarySource()`) 하나에서 값을 받는다. 지금 그 자리는 늘 `{ kind: 'none' }`이라 화면은 '연결 전' 모양이다(빈 상태 문구만, 지어낸 숫자 없음). 자료가 오면(`{ kind: 'data', days }`) '연결한 뒤 짜임'으로 바뀐다: 큰 문장 자리에 원장님 보고 문장 + [복사], 연결 순서 자리에 사전점검. 이 짜임은 이미 있는 저장 모양 `DayPayload`(`src/types/payload.ts`, stats-core REQ-008)를 그리게 만들고 시험 안의 가짜 자료로만 시험한다. 진짜 연결(저장 표·RLS·브라우저 읽기)은 다음 통계 명세다.

**바뀌지 않는 것.** 로그인·가입·승인 흐름, 문지기(`lib/auth/gate.ts`)·middleware·콜백, DB·RLS·API, `/claim`·`/claim/setup`·`/admin` 화면과 그 컴포넌트, 디자인 토큰·`globals.css`·`classes.ts`. 차트 부품은 두 곳만 뒤로 맞는 옵션을 더한다(REQ-314). 로그인하면 `/dashboard`에 닿는 길은 지금 이미 그렇다. 코드를 바꾸지 않고 이 명세 번호의 시험으로 못 박는다(REQ-301).

**어떻게 나누나.** 먼저 차례로 공용 준비를 한다(문서·시안·UI_GUIDE → 규칙 시험 → 차트 부품 → 아이콘). 그 다음 네 갈래가 서로 다른 파일만 고치도록 짠다(병렬 작업, tasks.md): 탭 줄·계정 메뉴(가) ∥ 준비 중 화면(나) ∥ 브리핑·지금 바로·기능 목차(다, `dashboard/briefing/`) ∥ 분석·보고 문장·자료 읽는 자리(라, `dashboard/summary/`). 다와 라는 서로 불러오지 않는다. 대시보드 페이지에서 둘을 합치는 일과 이름·주소·순서 맞춤은 합친 뒤 통합 TASK가 한다(REQ-307).

**기준 시안.** 총괄이 고른 최종 시안 `mockup-dashboard-v3/index.html`과 만드는 분을 위한 메모 `notes.md`(작업 공간) → TASK-1이 `docs/mockups/dashboard-home/`으로 옮긴다. 모양 값(토큰·클래스·글자 단계·간격·칸·문구)은 **메모가 기준**이다(아래에서 "메모 §n"). 이 문서는 짜임·인터페이스·동작과 메모가 "구현 명세에서 정한다"고 남긴 것의 답을 적는다.

## 구성 요소 / 인터페이스

```
docs/mockups/dashboard-home/{index.html,notes.md}   # TASK-1 (시안·메모 그대로)
src/components/ui/classes.test.ts                   # TASK-2 (규칙 시험: 짧은 반응·대시보드 범위)
src/components/charts/{KpiStat,StackedBarChart}.tsx # TASK-3 (뒤로 맞는 옵션 하나씩)
src/components/common/Icon.tsx                      # TASK-4 (copy·userCheck)

src/components/shell/                 # 갈래 가 (TASK-5)
  menu.ts          MENU 13개 · MenuItem{label,path,href,owns?} · ADMIN_LINK · isUnder · currentMenuLabel
  TabBar.tsx       TabBar() — props 없음. 13개 모두 Link. 올림 색 150ms
  AccountMenu.tsx  관리자면 메뉴 첫 항목 [가입 승인](/admin, userCheck), ↓↑ 이동, 나타날 때만 150ms
  AppShell.tsx     <TabBar />. main에 has-[[data-page-surface]]:bg-surface
src/components/common/                # 갈래 나 (TASK-6)
  notReadyFeatures.ts  NOT_READY_FEATURES 10개 · notReadyFeature(path)
  NotReadyScreen.tsx   NotReadyScreen({ feature })
src/app/(app)/{stats,notices,patients,revenue,ai-report,forms,staff,worklog,inventory,contacts}/page.tsx
src/components/dashboard/briefing/    # 갈래 다 (TASK-7) — 새 폴더
  features.ts      DASHBOARD_FEATURES 12개(목차 자료)
  dateLine.ts      dateLine(today) — 날짜 줄 글자
  DashboardHome.tsx 대시보드 짜임(서버). 브리핑 · 지금 바로 · analysis 자리 · 기능 목차
  StickyConnect.tsx 'use client' — 휴대폰 아래 단추(IntersectionObserver)
  (그 밖의 안쪽 부품 파일 이름은 구현이 정한다: 큰 문장 묶음·연결 순서·지금 바로 두 모양·기능 목차)
src/components/dashboard/summary/     # 갈래 라 (TASK-8) — 새 폴더
  source.ts        SummarySource · dashboardSummarySource() (지금은 늘 none) · isConnected()
  view.ts          순수 함수: 오늘 숫자·기간·그래프 칸·재방문·요일·처방·보고 문장
  DashboardAnalysis.tsx 'use client' — 기간 상태. 오늘 하루 분석 + 기간별 흐름 두 섹션
  ReportBlock.tsx  'use client' — 원장님 보고 문장 + [복사]
src/components/dashboard/DashboardEmpty.tsx · todayTitle.ts  # 그대로(더는 그리지 않지만 지우지 않는다)
src/app/(app)/dashboard/page.tsx      # 다가 DashboardHome(연결 전)으로 바꾸고, 통합 TASK가 분석·보고 문장을 끼운다
src/app/(app)/tabFrame.test.tsx       # 통합 시험 (TASK-9)
```

### 탭 목록 (`menu.ts`)

```ts
export type MenuLabel =
  | '대시보드' | '통계' | '청구' | '고시·공지' | '환자' | '매출' | 'AI 리포트'
  | '서식' | '직원' | '업무일지' | '재고' | '주소록' | '설정'
export type MenuPath =
  | '/dashboard' | '/stats' | '/claim' | '/notices' | '/patients' | '/revenue' | '/ai-report'
  | '/forms' | '/staff' | '/worklog' | '/inventory' | '/contacts' | '/claim/setup'
/** 기능 자신의 화면이 있는 주소. 다음 명세가 화면을 만들면 여기에 더한다 */
export type MenuHref = '/dashboard' | '/claim'

export type MenuItem = {
  label: MenuLabel
  /** 탭이 가는 곳(모두 있다). 화면이 없는 기능은 그 기능 주소의 '준비 중' 화면, 설정은 비트 PC 연결 화면 */
  path: MenuPath
  /** 기능 자신의 화면. 아직 없으면 null. 있으면 path와 같다.
   *  SetupScreen이 설정의 이 값으로 [청구·연락] 링크를 정한다(null = 준비 중) */
  href: MenuHref | null
  /** 이 탭 자리에 속하는 다른 화면 경로(지금은 쓰는 항목 없음. 설정이 /settings를 가지면 /claim/setup을 여기에 둔다) */
  owns?: readonly string[]
}

export const MENU: readonly MenuItem[]                       // 아래 표 순서
export const ADMIN_LINK: { label: '가입 승인'; href: '/admin' }
export const isUnder: (pathname: string, base: string) => boolean   // 지금 그대로
export function currentMenuLabel(pathname: string): MenuLabel | null  // path·owns 중 가장 길게 맞는 것
```

`ADMIN_ITEM`(관리자 탭)은 지운다. 쓰는 곳은 `TabBar`와 `shell.test.tsx`뿐이다.

| 탭 | `path` | `href` | 그 주소의 화면 |
|---|---|---|---|
| 대시보드 | `/dashboard` | `/dashboard` | 1안 오늘 브리핑 |
| 통계 | `/stats` | null | 준비 중 |
| 청구 | `/claim` | `/claim` | 청구 사전점검(있음) |
| 고시·공지 | `/notices` | null | 준비 중 |
| 환자 | `/patients` | null | 준비 중 |
| 매출 | `/revenue` | null | 준비 중 |
| AI 리포트 | `/ai-report` | null | 준비 중 |
| 서식 | `/forms` | null | 준비 중 |
| 직원 | `/staff` | null | 준비 중 |
| 업무일지 | `/worklog` | null | 준비 중 |
| 재고 | `/inventory` | null | 준비 중 |
| 주소록 | `/contacts` | null | 준비 중 |
| 설정 | `/claim/setup` | null | 비트 PC 연결(설치·연결 확인, 있음) |

지금 탭: `/claim/setup`은 [청구]의 `/claim`(6자)보다 [설정]의 `/claim/setup`(12자)이 길게 맞아 [설정]이다. 지금 `owns`로 하던 일을 `path`가 대신한다.

### 탭 줄 (`TabBar.tsx`)·앱 틀 (`AppShell.tsx`)
- `export function TabBar(): JSX.Element` — `isAdmin` prop을 뺀다. `MENU.map`으로 모두 `TabLink`(`next/link`)를 그린다. `href={item.path}`, 지금 탭이면 `aria-current="page"`.
- 탭 모양 클래스는 지금 `tabIdle`·`tabCurrent` 그대로에 `transition`(올림 글자색 150ms, 메모 §7)만 더한다. `tabNotReady`·`NotReadyTab`·툴팁·`useId`·Esc 처리·관리자 구분선을 지운다.
- 좁은 폭 옆 밀기와 지금 탭 보이게 옮기기(`useEffect`)는 그대로다. `TabLink`는 지금처럼 줄의 바로 아래 자식이다(감싸개 없음). 띠 끝 흐림은 넣지 않는다(사용자 결정).
- `AppShell`: `<TabBar />`. `isAdmin`은 `AccountMenu`에만 넘긴다. `main` 클래스에 `has-[[data-page-surface]]:bg-surface`를 더한다 — 대시보드 뿌리 요소가 `data-page-surface`를 달면 본문 전체가 흰 종이 한 장(메모 §2)이 되고, 다른 페이지는 지금처럼 `canvas`다. 안쪽 감싸개는 그대로.

### 계정 메뉴 (`AccountMenu.tsx`)
- props 그대로 `{ email, hospitalName, isAdmin }`.
- `role="menu"` 안 항목: 관리자면 `<Link href={ADMIN_LINK.href} role="menuitem" className={itemClass}>` + 꾸밈 `Icon name="userCheck"`(16px, `ink-2`, TASK-4) + [가입 승인] → [로그아웃](`SignOutButton`, 지금 그대로).
- 열 때 초점: 메뉴 안 첫 `[role="menuitem"]`. 지금은 `querySelector('button')`에 역할을 붙이는데, 링크는 처음부터 `role="menuitem"`을 주고 `SignOutButton`의 단추에만 역할을 붙인다.
- 키보드: 열린 동안 `keydown`에서 ArrowDown/ArrowUp → 항목 목록(`menuRef` 안 `[role="menuitem"]`)에서 다음/이전으로 초점(돈다). Esc·Tab·바깥 누름은 지금 그대로.
- [가입 승인]을 누르면 `setOpen(false)` 뒤 링크 이동.
- 반응(메모 §7): 계정 단추 올림·열림 `bg-canvas` + `transition`. 항목 `itemClass`에 `transition active:translate-y-px`. 메뉴 층(지금처럼 열릴 때만 그림)에 `transition starting:opacity-0 starting:-translate-y-1` — 새로 그려질 때만 움직이고, 닫으면 그리지 않으므로 바로 사라진다.

### 준비 중 화면 (`components/common/notReadyFeatures.ts`·`NotReadyScreen.tsx`)

```ts
export type NotReadyPath = '/stats' | '/notices' | '/patients' | '/revenue' | '/ai-report'
  | '/forms' | '/staff' | '/worklog' | '/inventory' | '/contacts'
export type NotReadyFeature = { path: NotReadyPath; name: string; intro: string; items: readonly string[] }
export const NOT_READY_FEATURES: readonly NotReadyFeature[]          // 10개, 탭 순서
export function notReadyFeature(path: NotReadyPath): NotReadyFeature

export function NotReadyScreen({ feature }: { feature: NotReadyFeature }): JSX.Element
```
- 서버 컴포넌트(`'use client'` 없음). 자료를 읽지 않는다. 시안 화면 5(주소록)와 메모 §3 '준비 중 화면'을 따른다.
- 짜임: h1 `feature.name`(`text-title` 600) → 바깥 상자 하나(`ds.panel` 틀, `relative`)
  - 꾸밈 선 묶음(`aria-hidden="true"`, 상자 안 절대 위치): 1px 선 4개, 마지막만 `line-strong`. 글자 없음.
  - 글 묶음(가운데, `surface` 바탕으로 선을 가림): "준비 중" 칩(`ds.chip.neutral`) → "준비 중인 기능입니다"(subtitle 600) → `feature.intro`(`ink-2`) → `feature.items`를 `ul`로(small, muted) → `Link href="/dashboard"` `ds.button.secondary` + `arrow` 아이콘(왼쪽을 보게 돌림, `aria-hidden`) + "대시보드로 돌아가기".
  - 768px 이상(768~1023px 포함, 시안은 폰 아닌 폭에 한 값): 상자 높이 420px, 글 묶음 가운데(글 묶음 안쪽 위아래 20px·좌우 24px). 768px 미만: 높이는 글에 맞고, 상자 `py-12`(48px) + 글 묶음 `py-3 px-4`(12·16px) = 상자 끝에서 글까지 60px(시안 40 + 20과 같은 거리), 꾸밈 선 inset 24·16px, 돌아가기 링크 44px(`ds.button.*`의 폰 규칙). 간격 시험(`classes.test.ts`의 간격 단계)에 40px이 없어 이렇게 나눈다('시안과 다른 점').
  - 모서리·넘침 자르기에 `overflow-hidden` 클래스를 쓰지 않는다(`src/app/theme.test.ts`가 그 클래스가 만들어지지 않는 것을 본다). 꾸밈 선은 상자 안쪽 여백(inset) 안에만 둔다.
- 각 주소의 페이지는 한 줄이다:

```tsx
// src/app/(app)/contacts/page.tsx
import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { notReadyFeature } from '@/components/common/notReadyFeatures'
export default function ContactsPage() {
  return <NotReadyScreen feature={notReadyFeature('/contacts')} />
}
```

준비 중 문구(주소록만 시안 그대로, 나머지는 같은 말투로 옛 계획 §2에서 옮겼다. 숫자를 쓰지 않는다):

| 주소 | 이름 | 소개 | 만들 것 |
|---|---|---|---|
| `/stats` | 통계 | 환자 흐름과 처방 추세를 그래프로 볼 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 환자 수 추이(신환·재진) · 신환 재방문율 · 처방 추세 · 요일별 환자 수 · 원장님 보고 문장 |
| `/notices` | 고시·공지 | 심사·고시 새 글을 한곳에서 볼 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 심평원 공지·심사기준 변경 · 보건복지부 고시·공지 · 건강보험공단 공지 · 글마다 AI 세 줄 요약 |
| `/patients` | 환자 | 다시 오실 환자와 문자 보낼 환자를 챙길 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 다시 오실 환자 명단 · 정기 주사 문자 명단 · 문자 문구 복사 |
| `/revenue` | 매출 | 매출 흐름을 나눠 볼 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 매출 추이 · 급여와 비급여 · 치료별 매출 · 한 사람당 평균 진료비 |
| `/ai-report` | AI 리포트 | 보고 자료를 정해 둔 양식으로 채울 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 월간보고 발표 자료 · 주간 요약 · 분기와 연간 보고 |
| `/forms` | 서식 | 대충 적은 글을 양식에 맞게 정리할 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 진료일정·휴진 안내 · 환자 안내문 · 직원 공지·회의록 · 근무표·보고서 |
| `/staff` | 직원 | 직원과 급여·휴가를 한곳에서 볼 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 직원 명단 · 급여 계산과 명세서 · 연차와 휴가 |
| `/worklog` | 업무일지 | 엑셀 업무일지를 그대로 옮겨 쓸 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 엑셀 양식과 똑같은 칸 · 날짜별로 적고 다시 보기 |
| `/inventory` | 재고 | 물품이 얼마나 남았는지 챙길 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 물품 목록·남은 수량 · 부족 표시 · 들어온 것과 쓴 것 |
| `/contacts` | 주소록 | 거래처와 업체 연락처를 한곳에 모아 둘 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요. | 거래처 · 수리·관리 업체 · 뉴메디코어 연락처 |

### 대시보드 짜임 (`components/dashboard/briefing/DashboardHome.tsx`, 갈래 다)

```ts
// features.ts — 목차 자료 한 곳. shell·summary·common/notReadyFeatures를 불러오지 않는다(병렬 작업 동안 독립)
export type DashboardFeature = {
  name: string    // 탭 이름과 같다(통합 시험이 맞춤을 본다)
  desc: string    // 메모 §6 설명 그대로. 줄바꿈 문자·숫자 없음
  href: string    // 탭 주소와 같다
  ready: boolean  // true = 그 주소에 이미 쓰는 화면이 있다 → "사용 가능"
}
export const DASHBOARD_FEATURES: readonly DashboardFeature[]  // 12개, 탭 순서 (requirements AC-316.3 표)

// dateLine.ts — 날짜 줄 글자. dates.ts의 weekdayOf·addDays·monthOf를 쓴다
export function dateLine(today: string): { date: string; note: string | null }
// '2026-10-31' → { date: '10월 31일 토요일', note: '이번 달 마지막 날' } · '2026-10-29' → { date: '10월 29일 목요일', note: null }

// DashboardHome.tsx — 서버 컴포넌트
export function DashboardHome(props: {
  today: string              // 'YYYY-MM-DD' 한국 날짜(날짜 줄)
  report: ReactNode | null   // null = 연결 전. 있으면 연결 뒤: 큰 문장 자리에 그대로 그린다
  analysis?: ReactNode       // 오늘 하루 분석 + 기간별 흐름(갈래 라). 다는 무엇이 오는지 모른다
}): JSX.Element
```

뿌리 `<div data-page-surface className="pt-2 pb-4 max-md:pt-1 max-md:pb-0">`(앱 틀 안쪽 여백 24·48 / 16·32에 더해 메모 §3 '본문' 32·64 / 20·32) 안에 차례로:

1. **브리핑**(`section`, 이름 "오늘 브리핑"): `lg:grid lg:grid-cols-12 lg:gap-x-6`.
   - 왼쪽(`lg:col-span-7`, 768~1023px 글 최대 32em): 날짜 줄(`dateLine`) → 연결 전이면 큰 문장 묶음(h1 · 안내 문장 · [비트 PC 연결 시작] · 안심 줄, 메모 §3 '큰 문장'), 연결 뒤면 `report`.
   - 오른쪽(`lg:col-start-9 lg:col-span-4 lg:pt-1`, 768~1023px 아래 전체 폭 위 32px): 연결 전이면 연결 순서, 연결 뒤면 '지금 바로 쓸 수 있어요' 옆 모양.
2. **지금 바로 쓸 수 있어요** 한 줄(연결 전만, `section` + h2, 메모 §3).
3. `analysis` 자리(받은 그대로).
4. **기능 목차**(`section` + h2, 메모 §3 '기능 목차').
5. 휴대폰 아래 단추 `StickyConnect`(연결 전만, `md:hidden`).

섹션 2·4(와 라의 두 섹션)는 같은 나눔을 쓴다: `mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4`(메모 §3 '덩어리 사이'). 섹션 머리 줄은 h2 `text-title font-semibold` + 옆 보조(small muted), 사이 12px, 넘치면 줄바꿈, 아래 16px.

- **연결 순서**: 연결 상태를 판정하지 않으므로 칩·지금 단계 강조 없이 번호 상자(20×20, 1px `line-strong`, caption 600 muted)와 이름(body `ink-2`)만. 이름 다섯은 `components/claim/setup/steps.ts`의 단계 이름과 같은 글자를 이 파일에 적는다(브리핑은 `claim/**`를 불러오지 않는다, 통합 시험이 `setupSteps()`의 `title`과 견준다). 768px 이상은 펼친 `ol`(`max-md:hidden`), 768px 미만은 같은 목록을 넣은 `<details>`(`md:hidden`, 처음 접힘, 요약 줄 56px 이상, `chev`에 `transition group-open:rotate-180`). 두 벌 중 하나는 늘 `display: none`이라 화면 읽기는 하나만 읽는다.
- **큰 문장의 h1**: 연결 전에는 큰 문장이 화면의 하나뿐인 h1이다. 연결 뒤에는 `DashboardHome`이 h1을 그리지 않고 `report`(라의 `ReportBlock`)가 첫 문장을 h1로 그린다.
- **주 단추**: `${ds.button.primaryLarge} group transition not-disabled:active:translate-y-px max-md:w-full` + 오른쪽 `Icon arrow` 16(`transition group-hover:translate-x-0.5`). 화면의 주 단추는 이것과 폰 아래 단추뿐이다.
- **휴대폰 아래 단추** (`StickyConnect.tsx`, `'use client'`): 뿌리의 마지막 자식 `sticky bottom-0 md:hidden`(surface, 위 1px line, 안쪽 12·16). 위 주 단추의 요소를 `IntersectionObserver`로 보다가(주 단추에 `id`를 주고 `document.getElementById`로 찾는다 — 다른 부품을 클라이언트로 바꾸지 않으려고) 화면 밖이면 보이고 안이면 숨는다. 숨김 = `invisible translate-y-full` + `aria-hidden="true"` + 링크 `tabIndex={-1}`, 보임 = `visible translate-y-0`, `transition duration-200`. IntersectionObserver가 없으면 숨긴 채 둔다. 처음 그림(서버)도 숨김이다.
- **지금 바로 쓸 수 있어요**: 연결 전 한 줄(`lg:grid-cols-12`: 이름 1~3 · 설명 4~9 · 단추 10~12, 768~1023px 1~4 · 5~9 · 10~12, 폰 쌓기)과 연결 뒤 옆 모양(머리 + 이름 + 설명 두 줄 — 둘째 줄 "청구 점검은 비트 PC의 크롬에서 엽니다."(small muted) — + 단추 줄 [사전점검 열기] 보조 + [비트 PC 연결 다시 확인] 글자 단추) 두 모양. 문구는 메모 §4 그대로. 옆 글 "기능 12개 가운데 2개예요. 다른 하나는 위의 비트 PC 연결이에요."는 연결 전 한 줄에만.
- **기능 목차**: `ul aria-label="기능"`, `grid gap-x-6 md:grid-cols-2 lg:grid-cols-3`. 칸 = `<li>` 안 `Link` 하나(`group block border-t border-line pt-3 pb-4 max-md:min-h-14 max-md:py-3 transition not-disabled:active:translate-y-px focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`). 머리 옆 글 "12개 가운데 2개를 지금 쓸 수 있어요"는 `DASHBOARD_FEATURES`에서 센 값으로 만든다(12·2). 칸마다 테두리 상자가 없다(선 하나만).
- 새 `ds` 키를 만들지 않는다. 반응 클래스(`transition`·`active:translate-y-px`·`group-hover:translate-x-0.5`)는 `ds` 뒤에 화면 파일 안 글자로 붙인다.

### 오늘 하루 분석 · 기간별 흐름 · 보고 문장 (`components/dashboard/summary/*`, 갈래 라)

```ts
// source.ts — 자료 읽는 자리. 지금은 늘 none
import type { DayPayload } from '@/types/payload'
export type SummarySource = { kind: 'none' } | { kind: 'data'; days: readonly DayPayload[] }
export function dashboardSummarySource(): SummarySource                 // { kind: 'none' }
export function isConnected(s: SummarySource): s is { kind: 'data'; days: readonly DayPayload[] }  // data && days.length > 0

// view.ts — 순수 함수(React 없음). 날짜는 lib/analytics/dates.ts, 증감은 compareNumbers, 숫자 글자는 charts/format
export type Period = 7 | 30 | 90
export const PERIODS: readonly Period[]          // [7, 30, 90]
export const DEFAULT_PERIOD: Period              // 30
export type DayState = 'none' | 'open' | 'closed' // 오늘 줄 없음 · 덜 끝남(partial true) · 끝남(partial false)
export type TodayView = {
  state: DayState
  counts: { patients: number; newPatients: number; returning: number } | null   // 오늘 줄의 totals
  compare:
    | { kind: 'wait' }                          // 오늘이 끝나지 않음 → "오늘 진료가 끝나면 비교해요"
    | { kind: 'no-last-week' }                  // 7일 전 줄 없음·덜 끝남 → "지난주 자료가 없어요"
    | { kind: 'delta'; delta: Delta; weekday: string } // weekday: '토' → "지난주 토요일"
}
export type PeriodRange = { from: string; to: string; label: string }   // to = 어제, label "10월 1일 – 10월 30일"
export function todayView(today: string, days: readonly DayPayload[]): TodayView
export function periodRange(today: string, period: Period): PeriodRange
export function tickLabels(range: PeriodRange, period: Period): { day: string; label: string }[]  // 7일 날마다 · 30일 from부터 7일마다 · 90일 21일마다, label "{월}.{일}"
export function trendBuckets(days: readonly DayPayload[], range: PeriodRange, period: Period): BarBucket[] | null
export function revisitView(days: readonly DayPayload[], range: PeriodRange): { d7: RateCell; d14: RateCell }
export type RateCell = { kind: 'rate'; value: number } | { kind: 'in-progress' } | { kind: 'none' }
export function weekdayBuckets(days: readonly DayPayload[], range: PeriodRange): BarBucket[] | null
export function topRx(days: readonly DayPayload[], range: PeriodRange): RankedItem[] | null
export function reportSentence(view: TodayView): { first: string; rest: string; full: string } | null  // 오늘 줄이 없으면 null

// DashboardAnalysis.tsx ('use client') — 기간 상태 하나(useState, 처음 30)
export function DashboardAnalysis(props: { today: string; source: SummarySource }): JSX.Element
// ReportBlock.tsx ('use client') — 연결 뒤 큰 문장 자리
export function ReportBlock(props: { today: string; days: readonly DayPayload[] }): JSX.Element
```

- **연결 판정**: `isConnected(source)`가 거짓이면 연결 전 모양(메모 §1 상태 ①). 참이면 연결 뒤. 오늘 상태는 오늘 날짜 줄의 `partial`로 정한다(메모 §11 제안 채택): 없음 → `none`, `true` → `open`(상태 ②), `false` → `closed`(상태 ③).
- **오늘 하루 분석**(`section` + h2, 메모 §3 '오늘 하루 분석'): 숫자 줄 = `grid grid-cols-4 max-md:grid-cols-2`, 아래 1px `line`, 칸 사이 1px `line` 세로선(폰은 둘째 줄 위 1px `line`). 칸 안 위아래 16·좌우 20, 첫 칸 왼쪽 0(폰 12·16).
  - 첫 세 칸 = `KpiStat`(md, 'count', 단위 "명"). 값이 없을 때 글: 연결 전 `emptyText="연결하면 보여요"`, 연결 뒤 기본 "자료 없음".
  - 넷째 칸: 값이 없으면 `KpiStat`(value null) + `emptyText`("연결하면 보여요" / "오늘 진료가 끝나면 비교해요" / "지난주 자료가 없어요"). `compare.kind === 'delta'`이면 같은 이름·자리의 이 폴더 안 칸(`KpiStat`과 같은 글자 단계: 이름 small muted → 값 줄 metric 600)에 증감을 값으로 그린다: 화살표(늘어남·줄어듦만, 꾸밈) + 화면 읽기 글자 + `formatDelta(delta, '명').text`, 아래 "지난주 {요일}요일"(small muted). `KpiStat`의 값은 숫자 하나라 증감을 값으로 쓸 수 없어 따로 둔다.
  - 연결 전만: 머리 옆 `ds.chip.neutral` "비트 PC 연결 전", 줄 아래 caption muted 한 줄(위 12px).
- **기간별 흐름**(`section` + h2): 머리 줄 = h2 · 오른쪽 끝 기간 글자(small muted) · 기간 단추 묶음. 기간 = 어제까지 N일(`from = addDays(today, -N)`, `to = addDays(today, -1)`), 오늘은 숫자 줄이 보여 주므로 그래프에 넣지 않는다.
  - 기간 단추 묶음(`role="group" aria-label="기간"`, 메모 §3 '기간 단추' 값을 이 파일 안 클래스로): 바깥 1px `line-strong` + `rounded-control` + `overflow-clip`, 단추 사이 1px 세로선, 32px(폰 44px · `max-md:grid max-md:grid-cols-3 max-md:w-full`), 눌린 것 `bg-accent-soft text-accent-strong font-semibold` + `aria-pressed="true"`, 올림 `bg-canvas` + `transition`(눌린 표시는 상태라 바로 바뀐다), 초점 고리 안쪽. 연결 전에도 눌리고 기간 글자와 환자 수 추이 빈 틀의 날짜 눈금이 바뀐다(날짜는 자료가 아니다).
  - 그래프 칸 = 제목 h3(subtitle 600) + 설명(small muted) + 그림. 짜임은 `lg:grid-cols-12` 두 줄(메모 §2).
  - **연결 전 빈 틀**(`aria-hidden="true"` 꾸밈, 메모 §3 '연결 전 빈 그림'): 환자 수 추이 = 높이 200px(폰 140px) 안 가로선 다섯(마지막 `line-strong`) + 가운데 문구(흰 바탕 좌우 12·위아래 4, 이 문구만 `aria-hidden` 밖 글자) + 아래 날짜 눈금(`tickLabels`, caption muted — 연결 뒤 막대 아래 글자와 같은 날짜), 범례는 `ChartLegend`(신환 `accent` · 재진 `chart-3`). 재방문율 = 줄 셋(이름 · 값 "–" `faint` · 8px 빈 막대 칸 `bg-canvas` + 1px `line`). 요일별 = 높이 150px(폰 110px) 빈 막대 칸 7개(`bg-canvas` + 1px `line`, 아래 `line-strong`) + 요일 글자. 처방 상위 = 36px 빈 줄 다섯(번호 caption 600 muted · 빈 칸 · "–").
  - **연결 뒤 그래프**:
    - 환자 수 추이 = `StackedBarChart`(`series` 신환 `accent` · 재진 `chart-3`, `unit` "명"). 칸 = 기간 안 자료가 있는 날 하나씩(`key` 날짜, `rangeLabel` "{월}월 {일}일", `state` `partial`이면 `'partial'` 아니면 `'complete'`, `values` [신환, 재진]). 아래 글자 `label`은 `tickLabels`가 고른 날에만 "{월}.{일}"(나머지 빈 글자, 메모 §3·시안 `AXES`와 같은 날짜). 30·90일은 `dense`(막대 위 합계 없음, REQ-314).
    - 신환 재방문율 = 줄 셋(빈 틀과 같은 짜임). 7·14일 = Σ`within7`(`within14`) ÷ Σ`cohort`, 그 값이 `null`인 날은 분자·분모 모두에서 뺀다. 모든 날이 `null`이면 "집계 중", 남은 분모가 0이면 "–" + "자료 없음". 값은 `formatRate` + "%", 막대 폭은 비율(%), 이 폴더 안 8px 막대(`InlineBar`는 140px 고정이라 전체 폭 막대로 쓰지 않는다). 30일은 늘 "자료 없음" + caption "30일 기록은 아직 모으지 않아요"(막대 없음).
    - 요일별 = `StackedBarChart` 한 계열(`accent`, 이름 "환자 수", `unit` "명"), 월 → 일 가운데 기간 안 자료 있는 요일만 칸. 값 = 그 요일 자료 있는 날의 `totals.patients` 평균을 버린 정수(`Math.floor`), 그 요일에 `partial` 날이 있으면 `'partial'`.
    - 처방 상위 = `RankedBars`(`unit` "건", 기간 안 `rx` 코드별 `patients` 합 큰 5개, 같으면 코드 순). 이름은 그 코드가 나온 가장 최근 날의 `name`. 값 = 날마다 받은 환자 수의 합.
    - 기간 안 날짜 자료가 하나도 없으면(`null`) 각 그래프는 빈 틀 + 가운데 "자료 없음".
  - 차트 그림은 폭과 상관없이 기본 크기(`compact` 없음)로 그린다(차트 부품의 크기는 폭에 따라 바뀌지 않는다, '시안과 다른 점').
- **원장님 보고 문장**(`ReportBlock`, 메모 §3 '원장님 보고 문장'): 머리 줄(이름 + [복사]) → 8px + 1px `line` → h1 첫 문장 → 나머지 문장 → 안심 줄.
- **보고 문장 틀**(`reportSentence`, 숫자는 `formatCount`, 요일은 `weekdayOf`):
  - 덜 끝남(`open`): "오늘 지금까지 환자 {환자}명이 왔습니다. 신환 {신환}명, 재진 {재진}명입니다."
  - 끝남(`closed`): "오늘 환자 {환자}명이 왔습니다. 신환 {신환}명, 재진 {재진}명입니다." + 비교가 있으면 " 지난주 {요일}요일보다 {차이}명 많습니다."(줄면 "적습니다.", 같으면 " 지난주 {요일}요일과 같습니다.")
  - `first` = 처음 "다."까지(위 틀은 늘 "…왔습니다."), `rest` = 그 뒤(앞뒤 빈칸 뺌), `full` = 둘을 빈칸 하나로 이은 글. [복사]는 `full`을 쓴다. 환자 이름·차트번호·처방 이름은 쓰지 않는다(`totals`만).
- **복사**(`navigator.clipboard.writeText(full)`): 단추 `ds.button.secondarySmall` + `min-w-28 transition not-disabled:not-aria-disabled:active:translate-y-px` + `Icon copy` 14 + "복사". 성공 → 2초 동안 `Icon check` 14 `text-positive` + "복사했어요"(타이머는 언마운트 때 지운다), 실패·`navigator.clipboard` 없음 → 아래 `aria-live="polite"` 자리에 "복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요."(caption). 성공 때 같은 자리에 "복사했어요"(화면 읽기용). 문구는 이 파일 안(로그인 화면 `LoginCard`의 [주소 복사]와 같은 방식). `lib/errors.ts`는 '무엇이 · 어떻게 고치나 · 번호' 오류 문구 자리이고 이 명세가 고치지 않는다.
- **오늘 자료 없음(연결 뒤)**: h1 "오늘 받은 진료 자료가 아직 없어요" + 안내 글. [복사]는 `aria-disabled="true"`(누름 처리에서 아무것도 안 함) + `aria-describedby` → `role="tooltip"` "문장이 생기면 복사할 수 있어요"(감싸개 `group`, 툴팁 `invisible opacity-0 translate-y-0.5 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:…` + `transition`, `ds.layer` 모양).
- 차트 부품은 불러 쓰기만 한다: `KpiStat`(`emptyText`), `StackedBarChart`(`dense`), `RankedBars`, `ChartLegend`, `format`. 그 밖의 차트 부품 고침이 필요하면 이 갈래에서 고치지 않고 멈춰 보고한다(그때 따로 차례 TASK).
- 가짜 자료는 시험 파일 안에서만 만든다. 앱 코드에 예시 숫자가 없다.

### 대시보드 페이지 조립 (통합 TASK)

```tsx
// src/app/(app)/dashboard/page.tsx (TASK-9에서)
export const dynamic = 'force-dynamic'
export default function DashboardPage() {
  const today = todayInKorea()
  const source = dashboardSummarySource()
  return (
    <DashboardHome
      today={today}
      report={isConnected(source) ? <ReportBlock today={today} days={source.days} /> : null}
      analysis={<DashboardAnalysis today={today} source={source} />}
    />
  )
}
```
- 갈래 다는 `<DashboardHome today={todayInKorea()} report={null} />`만 그린다. 갈래 라는 페이지를 고치지 않는다. 합친 뒤 통합 TASK가 위처럼 바꾼다.
- 연결 뒤 짜임 시험: `page.test.tsx`에서 `vi.mock('@/components/dashboard/summary/source')`로 `dashboardSummarySource`만 가짜 자료를 돌려주게 하고(`isConnected`는 진짜), 페이지 전체를 그려 본다(AC-307.6). 앱 코드에 시험용 길을 만들지 않는다.

### 규칙 시험 (`ui/classes.test.ts`, TASK-2)
- **대시보드 범위.** 지금 `DASHBOARD_DIRS`(`src/components/dashboard`·`src/app/(app)/dashboard`)는 규칙 시험(AC-204.6)과 `ui` 금지 검사(AC-221.1)에서 통째로 빠진다. 이 명세가 그 다음 대시보드 명세라, 빠지는 범위를 옛 빈 자리 `src/components/dashboard/DashboardEmpty.tsx` 한 파일로 좁힌다. 병렬 묶음 **전에** 좁혀 두어 갈래 다·라가 자기 워크트리에서 새 파일을 만들자마자 규칙을 받는다(합친 뒤에 몰아 고치지 않는다).
- **짧은 반응.** `ruleBreaks`에 움직임 규칙을 더한다: `transition-…`(맨 `transition` 밖), `duration-…`(`duration-200` 밖), `delay-…`, `ease-…`를 "짧은 반응 밖"으로 잡는다. `animate-…`는 지금처럼 장식으로 잡는다. 변형(`active:`·`group-hover:`·`starting:`·`group-open:`)과 `translate-*`·`rotate-*`·`opacity-*`는 이 규칙이 막지 않는다(크기 제한은 UI_GUIDE와 리뷰가 본다).
- 지금 저장소에서 앱 화면의 `transition` 클래스를 막는 시험은 없다(찾아본 결과): `classes.test.ts`는 `animate-*`만, `charts/rules.test.ts`는 차트 부품 안 `animate-*`·`transition*`, `landing/rules.test.ts`는 랜딩 CSS의 `transition`·`animation`, `globals.test.ts`·`theme.test.ts`는 모션 줄이기 규칙(`transition: none !important`)이 있는지만 본다. 차트·랜딩·전역 규칙 시험은 그대로 둔다(그래프·랜딩은 움직이지 않는다). 그래서 고칠 시험은 `classes.test.ts` 하나이고, 다른 갈래가 쓸 규칙이라 병렬 묶음 전 차례 TASK가 맡는다.
- `NEXT_DASHBOARD_KEYS`는 그대로 둔다(쓰는 화면이 생기면 '쓰는 키'가 될 뿐 시험은 맞는다).

### 차트 부품 (`KpiStat`·`StackedBarChart`, TASK-3)

```ts
// KpiStat
export type KpiStatProps = { …지금 그대로; emptyText?: string }   // 값 null일 때 "–" 아래 글. 기본 '자료 없음'
// StackedBarChart
type Props = { …지금 그대로; dense?: boolean }   // true면 막대 위 합계·상태 글자를 그리지 않는다
```
- 둘 다 주지 않으면 지금 그림과 한 글자도 같다(미리보기 `DashboardPreview`와 지금 시험이 그대로 통과한다). 훅·`'use client'`·움직임이 없다는 차트 규칙도 그대로다.
- `dense`의 화면 읽기 표는 그대로 모든 칸의 숫자를 준다. 빈 `label`은 지금도 빈 글자로 그려지므로 아래 날짜 글자 고르기는 부르는 쪽 몫이다.

### 아이콘 (`Icon.tsx`, TASK-4)
- `ICON_NAMES` 끝에 `copy`·`userCheck`를 더한다. 그림은 시안 그대로:
  - `copy`: `<rect x="5.25" y="5.25" width="8" height="8" rx="1"/>` + `<path d="M10.75 5.25V3.75a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1.5"/>`
  - `userCheck`: `<circle cx="6.5" cy="5.25" r="2.5"/>` + `<path d="M1.75 13.5c.5-2.4 2.4-3.75 4.75-3.75 1.15 0 2.2.3 3.05.9"/>` + `<path d="m10 12 1.6 1.6 3-3.35"/>`
- 시험은 지금 16개를 b2b 시안(`parts.mjs`)과, 새 둘을 `docs/mockups/dashboard-home/index.html`의 [복사]·[가입 승인] svg와 견준다.

## 데이터 흐름
- 탭·목차·준비 중 화면·브리핑 문구는 소스 안 고정 글자다. 분석과 보고 문장은 `dashboardSummarySource()` 한 곳에서만 값을 받고, 지금은 늘 `{ kind: 'none' }`이다. 서버·Supabase·브라우저 저장소를 새로 읽거나 쓰지 않는다.
- 다음 통계 명세: 저장 표·RLS를 만든 뒤 브라우저에서 내 병원의 `DayPayload`를 읽어 `{ kind: 'data', days }`를 준다(서버 코드는 `app/api/ai/`만이라는 ADR-004 때문에 서버 페이지에서 읽지 않는다). 그때 페이지 조립이 클라이언트 읽기로 바뀐다. 화면(`DashboardHome`·`DashboardAnalysis`·`ReportBlock`)은 그대로다. "오늘 진료 끝"(`partial: false`)을 언제 주는지도 그 명세가 정한다.

```
구글 로그인 → /auth/callback → /dashboard
승인된 사람이 /login·/signup·/pending → (middleware·guard) → /dashboard
/dashboard → (app)/layout 판정 → AppShell(main 흰 바탕) → DashboardHome(브리핑 · 지금 바로 · DashboardAnalysis(source) · 기능 목차)
              source = none → 연결 전 / data(days ≥ 1) → 연결 뒤(report = ReportBlock)
/stats 등 → middleware(로그인 안 했으면 /login) → (app)/layout guardPage('/dashboard' 판정) → AppShell + NotReadyScreen
/admin → (app)/layout 판정 → admin/page guardPage('/admin')(관리자 아니면 /dashboard)
```

## 결정과 트레이드오프

### 설정 탭은 `/claim/setup`으로 간다
- **고른 것.** [설정] 탭과 설정 칸은 이미 있는 비트 PC 연결 화면 `/claim/setup`으로 바로 간다. `MENU`의 설정 항목은 `path: '/claim/setup'`, `href: null`이다.
- **이유.**
  1. 새 화면·새 주소가 없다. 지금 쓰는 유일한 설정 화면으로 한 번에 간다(시안의 [비트 PC 연결 시작]·목차 설정 칸도 같은 곳).
  2. 탭과 목차 칸이 같은 주소다(통합 시험이 "칸 href = 탭 path"를 한 규칙으로 본다).
  3. `SetupScreen`(사전점검 명세의 파일, 다른 작업 줄에서 계속 고친다)은 `MENU`의 설정 `href`로 [청구·연락] 링크를 정한다. `href`를 null로 두면 그 파일과 시험을 한 글자도 고치지 않고 [청구·연락]은 지금처럼 '준비 중'이다.
  4. 사전점검 설정 TASK가 `/settings`를 만들면 그 TASK가 설정 항목을 `path: '/settings'`, `href: '/settings'`, `owns: ['/claim/setup']`으로 바꾼다. 그 TASK의 Files에 이미 `menu.ts`가 있다.
- **버린 것.**
  - `/settings` 준비 중 화면 + 그 안에 비트 PC 연결 링크: 클릭이 하나 늘고, 탭(준비 중)과 칸(사용 가능)의 주소가 달라진다. `SetupScreen`의 [청구·연락]이 준비 중 화면 링크로 바뀌어 사전점검 시험이 깨진다.
  - 설정 `href`를 `/claim/setup`으로: [청구·연락]이 자기 자신을 가리키는 링크가 된다. 막으려면 사전점검 파일 `SetupScreen.tsx`를 고쳐야 한다.
- **값.** 탭 주소(`path`)와 기능 자신의 화면(`href`) 두 칸이 생겨 조금 겹친다. "`href`가 있으면 `path`와 같다"를 시험으로 묶는다.

### 주소 이름
- 짧은 영어 낱말, 같은 origin 고정 경로. 사전점검 명세가 이미 정한 주소와 맞춘다: 통계 `/stats`(사전점검 통계 TASK가 같은 파일 `src/app/(app)/stats/page.tsx`를 진짜 화면으로 바꾼다), 설정 `/settings`는 그 명세 몫으로 남겨 둔다.
- 환자는 `/patients`. 사전점검 명세는 환자 연락 화면을 `/contact`로 적었지만, 그 화면은 이제 [환자] 탭 안 화면이다. 그 단계에서 `/patients`(또는 그 아래)로 옮기는 것을 그 명세에 남긴다. 주소록 `/contacts`와 `/contact`가 헷갈리지 않게 하려는 뜻도 있다.
- AI 리포트 `/ai-report`. 서버 AI 경로 `app/api/ai/`와 겹치지 않는다.

### 준비 중 화면은 주소마다 얇은 페이지 파일 하나 + 문구 파일 하나
- `[feature]/page.tsx` 같은 동적 경로를 쓰지 않는다. 동적 경로는 모르는 주소(`/foo`)까지 받아 404를 가리고, 허용 목록을 따로 둬야 하며, 나중에 진짜 화면이 생기면 같은 자리에 두 길이 생긴다.
- 기능별 소개·만들 것 문구는 갈래 나의 `notReadyFeatures.ts` 한 곳에 둔다. 페이지는 그 항목을 꺼내 넘기기만 한다.
- 페이지는 `(app)` 묶음 안이라 앱 틀과 승인 검사(`(app)/layout`)를 저절로 받는다. 문지기 규칙은 바꾸지 않는다.
- 꾸밈 선과 대시보드 빈 그래프 틀은 UI_GUIDE '빈 상태'의 "그림을 쓰지 않는다"와 다르지만 고른 시안이라 따른다. 글자 없는 1px 선·빈 칸뿐이고 `aria-hidden`이다. UI_GUIDE에 이 예외를 적는다(통합 TASK).

### 준비 중 탭도 보통 탭 모양
- 이제 모든 탭이 누를 수 있는 링크다. `faint`는 흰 바탕에서 대비 3:1이 안 되고, UI_GUIDE는 "누를 수 없는 단추라 WCAG 1.4.3 예외"로만 허락했다. 링크에 쓰면 그 예외가 없어진다. 준비 중 여부는 탭 줄이 아니라 기능 목차의 상태 글자와 준비 중 화면이 알린다.
- 목차의 "준비 중" 상태 글자는 시안대로 `faint`다. 누를 수 있는 칸 안이지만 같은 칸에 이름(`ink-2`)과 설명이 있고 상태는 덧붙은 표시라 정보가 색에만 기대지 않는다. UI_GUIDE 대비 절에 이 쓰임을 적는다(통합 TASK).

### 관리자 탭 → 계정 메뉴 [가입 승인]
- 혼자 쓰는 운영자의 드문 일이라 탭 한 자리를 쓰지 않는다(시안 화면 4).
- 항목이 둘이 되므로 메뉴 패턴대로 ↓↑ 이동을 더한다(지금은 Tab을 누르면 닫혀 키보드로 두 번째 항목에 갈 길이 없다).
- `/admin`에 있을 때 탭 줄의 지금 탭은 없다. 계정 메뉴에 지금 표시를 따로 두지 않는다(범위를 작게).
- 아이콘은 시안의 `userCheck`(TASK-4로 더함). 차례 TASK라 갈래 가가 고칠 때는 이미 있다.

### 브리핑(다)과 분석(라)을 나누는 자리
- 연결 전·뒤에 따라 큰 문장 자리의 주인이 바뀐다(연결 전 = 다의 큰 문장, 연결 뒤 = 라의 보고 문장). 다가 라를 모르게 하려고 `DashboardHome`은 `report: ReactNode | null` 하나로 상태를 안다: null이면 연결 전 모양 전부(큰 문장·연결 순서·지금 바로 한 줄·폰 아래 단추), 있으면 그 자리에 그대로 그리고 오른쪽에 사전점검을 둔다. 분석은 `analysis` 자리에 받는다.
- 무엇을 넘길지(연결 판정 `isConnected`, `ReportBlock`, `DashboardAnalysis`)는 통합 TASK의 페이지 세 줄이 정한다. 다·라는 서로 불러오지 않고, 섹션 나눔 클래스·날짜 글자 만들기처럼 겹치는 작은 글자는 각자 둔다(값은 메모 한 곳).
- 버린 것: `DashboardHome`이 `SummarySource`를 받아 스스로 판정 — 다가 라의 타입을 불러와 병렬 독립이 깨진다. 공용 파일을 차례 TASK로 먼저 만드는 것 — 판정 하나 때문에 차례를 늘린다.

### 연결 판정과 "오늘 진료 끝"
- 연결 전 = 자료 읽는 자리가 날짜 자료를 하나도 주지 않음(`none` 또는 빈 `days`). 연결 뒤 = 하나 이상.
- 오늘 끝남 = 오늘 날짜 줄 `partial === false`(메모 §11 제안). "지난주 같은 요일보다"는 끝남이고 7일 전 줄도 끝났을 때만 숫자가 나온다(사용자 결정, stats-core '증감은 둘 다 완전할 때만'과 같은 뜻).
- 기간 그래프는 어제까지 N일이다(메모 §3 기간 글자 "끝 날짜는 어제"). 오늘은 숫자 줄과 보고 문장이 맡는다.

### 대시보드는 연결 상태를 판정하지 않는다
- 시안 메모는 "`useBridge` 판정을 할 수 있을 때만 단계 칩"이라 했다. 대시보드에 확장 통로(`lib/bridge`, 환자 자료 구역)를 들이면 서버 컴포넌트가 클라이언트가 되고 확장·도우미와 말을 주고받게 된다. 판정은 `/claim/setup` 한 곳에 두고, 대시보드는 번호와 이름만 보인다(메모가 허락한 "칩 없이"). 그래서 연결 전 판정도 자료 읽는 자리 하나로만 한다.

### 환자 수 추이는 모든 기간을 하루씩
- 메모 §3: 설명 "신환·재진, 하루씩", 날짜 글자 다섯(30일 7일마다, 90일 21일마다)이고 "90일을 하루씩 그릴지 주별로 그릴지는 구현 명세에서 정한다". **하루씩**으로 정한다: 설명 글이 늘 맞고 규칙이 하나다. 막대가 많으면(30·90일) 막대 위 합계가 겹치므로 `dense`로 숨기고 숫자는 화면 읽기 표가 준다(REQ-314). 90일 폰 막대는 2px 안팎으로 가늘다(위험).
- 자료 없는 날은 칸을 만들지 않는다. `BarBucket`에는 '자료 없음' 상태가 없고(`types/`는 고치지 않는다) 값 0 칸은 지어낸 0이 된다. 날짜 글자가 붙은 칸이 건너뛰어 보이는 것으로 빈 날을 알 수 있다.

### 짧은 반응은 이 명세의 화면 파일 안에서만
- 사용자가 움직임 규칙을 '짧은 반응 허용'으로 바꿨다(UI_GUIDE는 TASK-1). 반응 클래스를 `ds.button.*`에 넣으면 `/claim`·`/admin`·인증 화면까지 한꺼번에 바뀌고 `classes.ts`(REQ-308)와 여러 화면 시험이 함께 움직인다. 이번에는 이 명세가 그리는 탭·계정 메뉴·대시보드에서만 `ds` 뒤에 붙인다. `ds`에 넣는 일은 다음에 따로 한다(UI_GUIDE 단추 줄에 그렇게 적는다).
- 모션 줄이기 전역 규칙(`globals.css`의 `transition: none !important`)이 모두 끄므로 새 CSS는 없다.

### 새 `ds` 키·토큰 없음
- 메모 §9가 제안한 `ds.segment`는 쓰는 곳이 기간 단추 하나라 `summary/` 안 클래스 글자로 둔다(TabBar·SetupScreen과 같은 방식). `classes.ts`를 고치지 않아 병렬 갈래가 같은 파일을 기다리지 않는다.

### 목차·준비 중 자료는 각 갈래 자기 파일 (병렬)
- 다가 `menu.ts`를, 나가 `features.ts`를 불러오면 다른 갈래가 고치는 중인 파일에 기대게 된다. 그래서 이름·주소를 세 곳(`menu.ts`·`briefing/features.ts`·`notReadyFeatures.ts`)에 적고, 합친 뒤 통합 시험이 셋을 견준다. 한쪽만 바꾸면 `tabFrame.test.tsx`가 깨져 알려 준다.
- 상태는 `ready` 하나로 정한다. 설정은 `MENU`의 `href`가 null인데도 `ready: true`다(쓰는 화면이 있는 곳으로 가므로). 그래서 "준비 중 칸 ⇔ 그 주소가 `NotReadyScreen`"을 통합 시험이 본다.

### 분석 계산은 `summary/view.ts`
- `lib/analytics`는 이 명세가 고치지 않는 환자 자료 구역이라 거기에 더하지 않는다. 다음 통계 명세가 `/stats`와 함께 쓰려면 그때 옮긴다.
- 30일 재방문은 저장 모양(`RevisitPayload`: 7·14일만)에 없다. 지어내지 않고 늘 '자료 없음' + 이유로 둔다(사용자 결정).

### 옛 빈 자리 `DashboardEmpty`는 남긴다
- 요구 6("아무것도 지우지 않는다")을 따른다. `/dashboard`는 더 이상 그것을 그리지 않는다. 남기면 `fonts.test.ts`·`classes.test.ts`가 그 파일을 이름으로 가리키는 검사와 옛 `ui` 세 키가 그대로 맞는다. 지우기는 총괄 확인 뒤 다음 명세다.

### 병렬 작업과 TDD 기록
- 네 갈래는 서로 다른 파일만 고친다(tasks.md 표). 공용으로 읽는 파일(`Icon.tsx`·차트 부품·`classes.test.ts`의 규칙)은 병렬 묶음 전에 차례 TASK가 끝낸다. 대시보드 페이지는 다(TASK-7)와 통합(TASK-9)이 차례로 고친다.
- 갈래마다 자기 워크트리에서 `specs/tab-frame/tdd-log.jsonl`에 줄을 더한다. 합칠 때 줄 단위로 모두 남게 `.gitattributes`에 `merge=union`을 둔다(TASK-1).
- 활성 기능은 `.harness/active`(= `tab-frame`)로 정해진다. 그래서 갈래 브랜치 이름이 `feat-tab-frame`이 아니어도 하네스가 이 명세를 본다.

## 시안과 다른 점
- **폰 탭 띠 오른쪽 흐림.** 시안 휴대폰 화면은 탭 띠 오른쪽 끝을 흐리게 보인다. UI_GUIDE의 그라데이션 금지와 부딪혀 넣지 않는다(사용자 결정, 얇은 스크롤바가 더 있음을 알린다).
- **[가입 승인] 회색 바탕.** 시안 화면 4는 새 항목을 알리려고 [가입 승인]에 `canvas` 바탕을 칠했다(시안 설명용). 앱에서는 [로그아웃]과 같은 모양이고 올릴 때만 `canvas`다. 시안의 "예시 관리자"는 실제 이메일이다.
- **연결 순서 칩.** 시안 컴퓨터 화면의 "지금 할 일"·"대기" 칩과 지금 단계 강조를 넣지 않는다(위 '대시보드는 연결 상태를 판정하지 않는다').
- **그래프·숫자 칸 크기.** 숫자 칸은 연결 전·뒤 모두 `KpiStat` md를 모든 폭에 쓴다(메모는 폰 `sm`. `KpiStat`의 크기는 폭에 따라 바뀌지 않고, 두 벌을 그리면 같은 글이 두 번 생긴다). 연결 뒤 그래프는 차트 부품 기본 크기(환자 수 추이·요일별 그림 높이 220px)를 모든 폭에 쓰고, 메모의 200·150px(폰 140·110px)는 연결 전 빈 틀에만 맞춘다. 차트 부품 크기를 폭마다 바꾸는 일은 범위 밖이다. 그래프 쪽 차이는 지금 화면에서는 보이지 않는다(자료 없음).
- **준비 중 화면 폰 여백.** 시안은 상자 위아래 40px + 글 묶음 20px(글까지 60px)이다. 40px은 간격 단계 밖이라(`classes.test.ts`, 갈래 나가 고칠 수 없다) 48px + 12px로 같은 60px을 만든다. 768~1023px은 시안대로 PC 값(높이 420px)이다.
- **복사 실패 문구 자리.** 메모 §3은 "오류 문구는 `lib/errors.ts`에 더한다"이다. 이 명세는 `src/lib/`를 고치지 않고(REQ-308), 로그인 화면 [주소 복사]처럼 화면 파일(`ReportBlock.tsx`) 안에 둔다. 문구는 메모 그대로다. 오류 번호가 없는 안내 글이라 `lib/errors.ts`의 '무엇이 · 어떻게 고치나 · 번호' 틀에도 맞지 않는다.
- **넷째 숫자 칸 값 모양.** 시안은 자리 그림뿐이다. 값은 증감 글자(화살표 + "N명 (+N.N%)")이고 아래가 "지난주 {요일}요일"이다.

## 다음 명세가 탭을 채울 때
- 기능 하나에 진짜 화면이 생기면 같은 TASK에서 네 곳을 같이 바꾼다: `menu.ts`의 그 항목 `href`(와 필요하면 `path`), `briefing/features.ts`의 `ready`·`href`, `notReadyFeatures.ts`에서 그 항목 빼기, 그 주소의 `page.tsx`(준비 중 → 진짜 화면). 사용 가능 칸 수가 바뀌면 '지금 바로 쓸 수 있어요' 옆 글도 고친다. 하나라도 빠지면 `src/app/(app)/tabFrame.test.tsx`가 깨진다. 그 TASK의 Files에 이 파일들과 통합 시험을 넣는다.
- 사전점검 명세의 해당 TASK(설정·환자 연락·통계)는 Files에 `menu.ts`·`shell.test.tsx`만 있다. 그 단계에서 위 파일들을 더하는 명세 고침이 필요하다.
- 통계 명세는 `dashboardSummarySource()`를 진짜 읽기로 바꾸고, 오늘 끝남을 주는 때와 30일 재방문을 더한다.

## 위험 / 미해결 질문
- **"지난주 같은 요일보다"가 오래 비어 있다.** 저장 모양 주석상 오늘 줄은 늘 `partial`(덜 끝남)이다. 그래서 진짜 자료가 와도 통계 명세가 "오늘 진료 끝"을 주기 전에는 넷째 칸이 "오늘 진료가 끝나면 비교해요"이고 보고 문장도 '지금까지' 틀이다. 사용자 결정대로 둔다.
- **90일 막대가 가늘다.** 하루씩 90칸이면 390px에서 막대가 2px 안팎이다. 자료가 오고 보기 어렵다면 통계 명세에서 주별로 바꾼다(차트 부품은 그대로).
- **탭 13개의 폭.** 1024px에서 안쪽 폭 976px에 탭 13개(어림 870px)가 들어간다. 마지막 TASK에서 1440·1024로 재고, 넘치면 탭 줄의 넘침 기준만 그 폭으로 옮긴다(클래스만).
- **흰 바탕 선택자.** `has-[…]`(CSS `:has`)는 크롬 105·사파리 15.4·파이어폭스 121부터다. 그보다 옛 브라우저는 지금처럼 `canvas` 바탕으로 보일 뿐 다른 문제는 없다. 계정 메뉴의 `starting:`(CSS `@starting-style`)도 옛 브라우저에서는 움직임 없이 바로 보인다.
- **옛 시험 고치기.** `shell.test.tsx`의 툴팁·관리자 탭 시험 등, `dashboard/page.test.tsx`의 "오늘 + 날짜" h1 시험, `classes.test.ts`의 "대시보드 두 폴더" 시험, `Icon.test.tsx`의 "16개" 시험을 바꿔야 한다(tasks.md 각 TASK '고치는 옛 시험'). 목록 밖 시험은 그대로 통과해야 한다.
- **링크 미리 불러오기.** 탭 13개·목차 12개가 모두 `next/link`라 운영에서 화면에 보이는 링크를 미리 불러온다. 준비 중 페이지는 아주 작아 부담이 없다.
- **`SetupScreen`의 기대.** 설정 `href`가 null이 아니게 되는 순간 [청구·연락]이 링크로 바뀐다. `menu.ts` 주석에 적고, `href` null을 시험으로 못 박는다.
- **사전점검 문서와 어긋남.** 사전점검 명세의 '[환자 연락] 탭'·'`/contact`'는 이 명세의 [환자]·`/patients`와 다르다. 그 명세를 다음에 고칠 때 맞춘다(이 명세는 그 파일을 고치지 않는다).
- **시안 파일 크기.** `docs/mockups/dashboard-home/index.html`은 1.2MB(글꼴이 들어 있다)다. 다른 시안 폴더와 같은 방식으로 저장소에 둔다.
