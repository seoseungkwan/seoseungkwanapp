# 설계: 통계 PC 화면 정리

## 개요
- 화면 틀만 바꾼다. 숫자를 만드는 곳(`view.ts`·`treatmentView.ts`·`rxPickView.ts`·`againView.ts`·Worker·저장)은 건드리지 않는다
- 새 부품 넷: 접는 단추·접는 설명(`HowCounted.tsx`), 처방 탭 칸(`RxSection.tsx`), 목차 띠(`StatsToc.tsx`). 칸 틀 `Section`(`parts.tsx`)에 두 모드를 더한다
  1. **목차 자리(anchor)**: 감싼 쪽이 준 id를 `section`에 붙이고 목차 띠에 가리지 않는 scroll-margin을 준다
  2. **탭 패널 모드**: 탭 안에서는 `section`·h2를 그리지 않고, 설명(desc)·오른쪽 단추(action)를 탭 칸 머리 줄에 그린다(고른 탭일 때만)
- 이 두 모드 덕분에 처방 세 칸(`TreatmentTrendSection`·`RxSplitSection`·`RxPickerSection`)의 코드와 상태는 거의 그대로이고 따로 그린 시험도 그대로 돈다(따로 그리면 지금처럼 h2 칸이다)
- 불러오기 상자는 `SourcePicker` 안에서 띠 + 펼칠 칸으로 나눈다. '불러올 기간'·'오늘 진료 끝' 상태를 `BitLoad`에서 `SourcePicker`로 올려 띠의 [비트에서 불러오기]가 같이 쓴다. 자료 글(지금 `SourceLine`)은 `StatsScreen`이 만들어 띠 왼쪽 자리(`summary`)로 넘긴다

## 코드로 확인한 것
| # | 사실 | 확인 결과 | 근거 |
|---|---|---|---|
| 1 | 앱 머리줄 높이와 같은 scroll-margin 값 | 넓은 화면 102px(`scroll-mt-25.5`) · 휴대폰 94px(`max-md:scroll-mt-23.5`). 머리줄은 `sticky top-0 z-10` | `AppShell.tsx:36`·`:59`, `parts.tsx:39` |
| 2 | 처방 세 칸은 열린 줄·그래프 모양·고치기·고른 날 수를 칸 React 상태에 둔다(기간별 key 없음) | 맞음 → 탭이 패널을 내려놓으면 잃는다. 고르지 않은 패널도 그린 채 `hidden`으로 둔다 | `TreatmentTrendSection.tsx` 머리 주석, `RxPickerSection.tsx` 머리 주석 |
| 3 | 처방별 추세 [묶음 고치기]는 칸 머리 줄 오른쪽(`Section action`)이고 고치기를 열면 h2에 초점, 닫으면 단추에 초점 | 맞음(`headingRef`·`editRef`). 탭 패널 모드에서도 두 ref가 살아 있어야 한다 | `TreatmentTrendSection.tsx` `focusNext` |
| 4 | 자료 줄은 기간 글 아래(`SourceLine`)이고 덮은 기간 끝 글은 `coverClause` | 맞음. 보이는 조건 `showSections && (!readFailed \|\| unsaved !== null)` | `StatsScreen.tsx:165`·`:184`·`:468` |
| 5 | 개인정보 줄은 `StatsScreen`에 있다 | 맞음 → 펼칠 칸 안(`SourcePicker`)으로 옮긴다 | `StatsScreen.tsx:400` |
| 6 | 펼친 상자의 파일 칸 나눔 줄은 768px 기준(`max-md:border-t`)뿐 | 맞음 → 768~1023px에서 아랫줄로 내려가도 세로줄만 남는다(시안 6(b)). 1024px 기준으로 바꾼다 | `SourcePicker.tsx:68` |
| 7 | 환자 구성 세 열은 `lg:grid-cols-3` 하나 | 맞음 → 1024px에서 16px 넘침(notes.md '확인') | `PatientMixSection.tsx:70` |
| 8 | 아래 글과 [표 복사]가 `flex-wrap justify-between` 한 줄 | 맞음 → 글이 길면 [표 복사]가 다음 줄 왼쪽으로 떨어진다(시안 6(c)) | `PatientMixSection.tsx:199`, `DoctorsSection.tsx:120` |
| 9 | 클래스 규칙 시험이 화면 폭 접두사를 `md`·`lg`·`max-md`·`max-lg`만 두고 `xl:`·`min-[…]:`를 막는다. 그림자는 `shadow-float`만 | 맞음 → 1280px 경계는 예외로 적어야 하고(기본값 12), 목차 띠 그림자는 뺀다(기본값 5) | `ui/classes.test.ts` `ruleBreaks`·`SCREEN_OK` |
| 10 | 섹션 소스 규칙 시험이 `sections/` 폴더 모든 파일에서 `location.`·`history.`·저장소·fetch를 막는다 | 맞음 → 새 `HowCounted.tsx`·`RxSection.tsx`도 지킨다. 목차 띠는 주소를 바꾸지 않는다 | `PeriodSummary.test.tsx` 'AC-513.9' |
| 11 | Testing Library `getByRole`은 `hidden` 안을 찾지 않고 `getByText`·`textContent`는 찾는다 | 맞음 → 접는 설명·탭 패널·펼칠 칸을 `hidden`으로 그려 두면 글을 찾는 지금 시험은 대부분 그대로이고, 단추·칸을 role로 찾는 시험만 먼저 펼치거나 탭을 고르게 고친다 | jsdom `[hidden]{display:none}` |
| 12 | E2E 셋이 `/저장했어요/`(자료 줄 끝 글)·`처방 찾기`·`시작하고`·`처방별 추세 · 묶음 고치기`를 찾는다 | 맞음 → 자료 글이 짧아지고 처방 골라 보기가 셋째 탭으로 들어가서 고친다 | `e2e/rx-picker-privacy.spec.ts:193`·`:196`, `e2e/fu-rate-privacy.spec.ts:246`·`:299`, `e2e/treatment-trend-privacy.spec.ts:225`·`:237` |
| 13 | `/stats` 페이지 시험은 `StatsScreen`을 가짜로 바꿔 넘기는 값만 본다 | 맞음 → 고치지 않는다 | `src/app/(app)/stats/page.test.tsx` |

## 부품과 인터페이스

### `sections/parts.tsx` — `Section` 두 모드
```ts
// 목차 자리: StatsSections가 칸마다 감싼다. Section이 이 id를 section에 붙이고 안쪽에는 넘기지 않는다(겹친 id 없음)
export function SectionAnchor({ id, children }: { id: string; children: ReactNode })
// 탭 패널: RxSection이 패널마다 준다. active = 고른 탭, slot = 머리 줄 안 설명·단추 자리
export type SectionPanel = { active: boolean; slot: HTMLElement | null }
export const SectionPanelContext: Context<SectionPanel | null>
export const TOC_SCROLL: string // 목차 띠에 가리지 않는 scroll-margin(아래 '배치')
```
- 보통(둘 다 없음): 지금 마크업 그대로(시험 'Section headingRef'가 지킨다)
- 목차 자리: `<section id={anchor} className={… TOC_SCROLL}>`
- 탭 패널: `section`·h2를 그리지 않고 `children`만. 고른 탭이면 `desc`·`action`을 `createPortal`로 `slot`에 그린다. `headingRef`가 있으면(고치기) 패널 맨 위에 `h3`(`text-subtitle`, `tabIndex -1`, `TOC_SCROLL`)로 `title`을 그리고 그 ref를 붙인다. `className`(col-span 등)은 쓰지 않는다
- 초점 받는 제목(`FOCUS_HEADING`)의 scroll-margin도 `TOC_SCROLL`로 바꾼다: 붙는 목차 띠 밑에 제목이 숨지 않게

### `sections/HowCounted.tsx` (새)
```ts
// 글자 단추 + 꺾쇠(chev, 펼치면 rotate-180). ds.textButton, min-h-8(휴대폰은 ds가 44px)
export function FoldButton({ label, open, controls, onClick }: { label: string; open: boolean; controls: string; onClick(): void })
// "어떻게 세나요?" 접는 설명. side를 주면 [어떻게 세나요?](왼쪽) · side(오른쪽 끝) 한 줄을 그리고 펼친 글은 그 줄 아래.
// 768px 미만은 side가 먼저(전체 폭) 오고 단추가 그 아래(order). side가 없으면 단추 아래 펼친 글
export function HowCounted({ children, side }: { children: ReactNode; side?: ReactNode })
```
- 펼친 글 칸은 늘 그려 두고 접히면 `hidden`이다(`aria-controls`가 가리키는 칸이 늘 있다). 상태는 이 부품의 React 상태뿐(처음 접힘)
- `SourcePicker`의 [불러오기 설정]도 `FoldButton`을 쓴다

### `sections/RxSection.tsx` (새)
```ts
export type RxTab = { name: string; panel: ReactNode }
export function RxSection({ tabs, className }: { tabs: readonly RxTab[]; className?: string })
```
- 마크업: `section`(목차 자리 id) > 머리 줄(h2 `처방` + 설명·단추 자리) > `div role="tablist" aria-label="처방 보기"` > 탭 단추 > 패널마다 `div role="tabpanel" hidden={!고름}` + `SectionPanelContext`
- 모양은 `Section`과 같은 위 줄·여백(`SECTION`·`HEADING` 상수를 같이 쓴다), 탭 줄은 시안 `.mk-tabs`(아래 1px `line`, 고른 탭 `ink` 600 + 2px `accent` 밑줄, 휴대폰 44px, 넘치면 탭 줄 안에서만 밀림)
- 고른 탭 = React 상태(처음 0). 키: → ← 돌기, Home · End, 고르면 초점 이동(롤빙 tabIndex). 고른 탭을 남기지 않는다
- 휴대폰 머리 줄 오른쪽 단추 전체 폭(지금 `PHONE_FULL_ACTION`)은 이 칸 머리 줄이 맡는다. 단추 자리가 비면 자리도 없다(`empty:hidden`)

### `StatsToc.tsx` (새)
```ts
export const TOC_LINKS: readonly { id: string; name: string }[] // 아홉, AC-4002.1 차례
export function tocRangeText(range: StatsRange, lastDay: string): string // AC-4002.2
export function activeTocIndex(tops: readonly number[], line: number, atEnd: boolean): number // AC-4002.5, 없으면 -1
export function StatsToc({ range, lastDay }: { range: StatsRange; lastDay: string })
```
- `<nav aria-label="칸 바로 가기" className="sticky top-25.5 z-9 … max-md:top-23.5">`: 왼쪽 기간 글(`text-caption muted`, 오른쪽 1px `line`) · 링크 줄(`overflow-x-auto`, 스크롤 막대 숨김). 링크: `text-small` 500 `ink-2`, 지금 칸 `aria-current="true"` = `accent-strong` + 2px `accent` 밑줄, 넓은 화면 42px · 휴대폰 44px
- 스크롤(passive)·크기 바꿈마다: 붙음 = 띠 위끝 ≤ 붙는 위치(계산한 `top`)면 위 줄 대신 아래 1px `line`. 지금 칸 = `activeTocIndex(칸 위끝들, 띠 아래끝 + 48, 쪽 맨 아래)`. 강조 링크를 링크 줄 가운데로 민다(링크 줄만 `scrollTo`, 쪽은 안 움직임)
- 누름: `preventDefault` → 대상 `scrollIntoView({ block: 'start', behavior: 모션 줄이기 ? 'auto' : 'smooth' })` → 누른 링크 강조 → 스크롤이 끝날 때(`scrollend`, 없으면 1.5초)까지 스크롤 따라가기를 멈춘다. `location`·`history`를 쓰지 않는다
- jsdom에는 `scrollIntoView`·`matchMedia`·요소 `scrollTo`가 없다 → 있는지 보고 부른다(시험은 가짜를 넣는다)

### `SourcePicker.tsx` 바뀜
```ts
type Props = 지금 Props & {
  summary?: ReactNode  // 띠 왼쪽 자료 글(StatsScreen이 만든다). 없으면 빈 자리
  canFold?: boolean    // 접은 채 시작해도 됨(저장된 숫자 있음 · 읽는 중 · 읽기 실패). 주지 않으면 false = 지금처럼 펼침
}
```
- 상자(`bg-canvas rounded-control`, 끌어다 놓기 받음) = 띠(왼쪽 `summary` · 오른쪽 'ready'면 [비트에서 불러오기] + [불러오기 설정]) + 펼칠 칸(위 1px `line`, `hidden`). 펼칠 칸 = 두 칸(1024px 이상 `lg:flex-row` · 파일 칸 `lg:border-l`, 미만 세로 · 파일 칸 `max-lg:border-t`) + 개인정보 줄. 읽는 중 줄은 상자 아래 그대로
- 펼침 = `사용자가 고른 값 ?? (!canFold || 주의 상태)`. 주의 상태 = 끊김 · 바쁨 · 연결 확인 오류(`helloError`) · 도우미 없음 · 도우미/확장 업데이트. 주의 상태로 바뀌는 때 사용자가 고른 값을 지운다(다시 펼침)
- '불러올 기간'(`span`)·'오늘 진료 끝'(`closeToday`) 상태를 `SourcePicker`로 올린다. `BitLoad`는 [비트에서 불러오기] 없이 고르는 줄·체크·안내 두 줄만 그린다

### `StatsScreen.tsx` 바뀜
- `SourceLine`을 지우고 같은 글을 `summary`로 넘긴다(같은 보이는 조건). `coverClause` 끝 글을 `까지`로 줄인다. 개인정보 줄을 지운다(`SourcePicker` 안으로)
- `canFold = !(showSections && !readFailed && !saved)`('아직 저장된 통계가 없어요'가 보이는 때만 펼침)
- `WAITING` 셋(`처방별 추세`·`처방별 신환·재진`·`처방 골라 보기`)을 `처방` 하나로
- 기간 줄 `div` 다음, 칸들 앞에 `{showSections && <StatsToc range={range} lastDay={lastDayOf(today, todayDone)} />}`. **목차 띠는 화면 바깥 `div`의 바로 아래 자식**이어야 끝까지 붙는다(작은 `div` 안에 넣으면 그 `div`가 끝날 때 떨어진다)

### `sections/StatsSections.tsx` 바뀜
- 아홉 칸을 `SectionAnchor`로 감싼다(id는 `TOC_LINKS`). 처방 세 칸 자리에 `RxSection`(col-span-12) 하나: 탭 `묶음별 추세` → `TreatmentTrendSection`, `처방별 신환·재진` → `RxSplitSection`, `처방 골라 보기` → `RxPickerSection`(셋 다 지금 props 그대로, className 없음)
- 칸 묶음의 첫 칸 위 여백을 줄인다(아래 '배치')

### 칸마다 설명 접기·[표 복사] 줄
| 칸 | "어떻게 세나요?" 안 | 그대로 보이는 것 | 자리 |
|---|---|---|---|
| 묶음별 추세 `TreatmentTrendSection` | `NOTES` 네 글 | 비교 안내 · 비교하지 않는 묶음 안내 | 표 아래, 보이는 안내 다음. 고치기 제목 `EDIT_TITLE` → `묶음별 추세 · 묶음 고치기`. 따로 그릴 때의 h2 `TITLE`(`처방별 추세`)은 그대로 둔다: 앱에서는 탭 이름이 대신하고, Phase 사이에 화면 시험(칸 제목 목록)이 깨지지 않게 |
| 처방 골라 보기 `RxPickTable` | `줄을 누르면 …` · `COUNT_NOTE` · `NEW_NOTE` · (합계 줄) `TOTAL_NOTE` | `GAP_NOTE` · 비교 안내 | 표 바로 아래 `HowCounted side=[표 복사]`, 보이는 안내는 그 아래. 직접 복사 칸(textarea)은 줄 아래 |
| 같은 처방 재방문 `RxPickAgain` | `HOW(win)`(굵은 머리 없이) · `Example`(열림 상태는 이 칸 상태 그대로) · 표가 있으면 `NOTES` | 날 수 단추 · 기간 막대 · 표 | 칸 맨 아래(처방을 골랐을 때) |
| 신환 재방문율 `RevisitSection` | `'30일 넘어 다시 옴'은 …` | — | 첫 재방문 목록 아래, [자세히] 칸 앞(지금 자리) |
| 원장님 보고 문장 `ReportSection` | `shown.notes`(· 글들) | 날짜 줄 · 확정 못 함 · 개인정보 줄 | 보고 글 아래(지금 자리) |
| 환자 구성 `PatientMixSection` | `FOOT` | 견줘요 줄 | 세 열 아래 `HowCounted side=[표 복사]` |
| 시간대별 접수 `VisitHoursSection` | `FOOT` | 범례 · 접수 시각 모름 | [자세히] 칸 다음(지금 자리) |
| 원장님별 `DoctorsSection` | `FOOT` | — | 표 아래 `HowCounted side=[표 복사]` |
| 처방별 신환·재진 `RxSplitSection` | 없음 | `명 = …` | 바꾸지 않음([모두 보기] · [표 복사] 줄 그대로) |

## 상태 흐름
- 불러오기 펼침: `SourcePicker`의 `useState<boolean | null>(null)`(null = 고르지 않음) → 보이는 값 = 고른 값 ?? 자동(`!canFold || 주의`). 주의 상태로 들어가는 때 null로 되돌린다. 다시 열면 처음부터(기억 없음)
- 탭: `RxSection`의 `useState(0)`. 패널 셋은 늘 그린다 → 각 칸의 훅·상태(묶음 훅은 `StatsScreen`이 한 번 부름, 찾기 목록·고른 처방·같은 처방 재방문 날 줄 읽기)는 지금처럼 셋 다 돈다
- 목차: `StatsToc`의 지금 칸 index · 붙음 · 누른 뒤 잠금. 칸 자리를 DOM에서 id로 찾는다(칸을 그리는 쪽과 props로 잇지 않음)
- 접는 설명: 칸마다 `HowCounted` 상태. 기간을 바꿔도 같은 부품이면 펼친 채다(칸 key를 바꾸지 않는 곳)

## 접근성
- 목차: `nav aria-label="칸 바로 가기"`, 지금 칸 `aria-current="true"`, 초점 고리 안쪽 2px `accent`
- 탭: `tablist`(`aria-label="처방 보기"`) · `tab`(`aria-selected`, `aria-controls`, 롤빙 `tabIndex`) · `tabpanel`(`aria-labelledby`). 자동 고름(키로 옮기면 바로 고름)
- 접기: `button aria-expanded` + `aria-controls` → `hidden` 칸. 꺾쇠는 `aria-hidden` 꾸밈
- 휴대폰 누름 영역 44px: 목차 링크 · 탭 · [불러오기 설정] · [어떻게 세나요?]

## 배치
- 목차 띠: 기간 줄 아래 20px(`mt-5`, 휴대폰 16px), `sticky top-25.5 max-md:top-23.5 z-9 bg-surface`. z-9 = 머리줄(z-10) 아래, 처방 찾기 층(z-5) 위
- `TOC_SCROLL` = 머리줄 + 목차 띠 높이 − 1px(칸 위 줄은 띠 뒤로 숨고 제목이 띠 바로 아래 20px): 넓은 화면 약 145px(`scroll-mt-36.25`) · 휴대폰 약 139px(`max-md:scroll-mt-34.75`). 화면 확인으로 맞춘다
- 목차 띠와 기간 요약 사이: 지금 칸 위 여백 48px(휴대폰 32px)이 띠 아래에 그대로 붙어 넓다 → 칸 묶음 첫 칸만 24px(휴대폰 20px)로 줄인다(`StatsSections` 감싸개에서 첫 자식 `mt`를 덮는 클래스). 다른 칸 사이는 그대로
- 환자 구성 세 열 감싸개: 1023px 이하 한 열(지금) · 1024~1279px `lg:grid-cols-2`(연령대 `lg:row-span-2`, 동네 `lg:col-start-2 lg:row-start-2 lg:pt-6` + 왼쪽 세로줄 유지) · 1280px 이상 `min-[80rem]:` 세 열(지금 모양으로 되돌림). `min-[80rem]:` 클래스만 `ui/classes.test.ts` 예외 목록(`RULE_EXCEPTIONS`)에 이 파일로 적고, UI_GUIDE '화면 폭'에 한 줄 더한다
- 펼친 불러오기 칸: 1024px 이상 두 칸 사이 32px + 세로줄, 미만 위아래 + 가로줄(위 12px)
- 클래스 규칙(간격 단계 0.5~24 정해진 값 · 그림자 `shadow-float` 하나)에 맞춘다: 시안의 띠 위아래 10px → 8px(`py-2`), 목차 링크 옆 10px → 12px(`px-3`, 휴대폰 8px 그대로), 동네 위 28px → 24px(`pt-6`). 목차·탭의 2px `accent` 밑줄은 그림자 클래스가 아니라 `border-b-2`(또는 2px 막대)로 그린다

## 시안과 다른 곳
- 목차 띠가 붙을 때 그림자 없음(아래 1px 줄만): 그림자 토큰 규칙(기본값 5)
- 간격 몇 곳을 규칙 단계로 맞춤(띠 위아래 8px · 목차 링크 옆 12px · 환자 구성 동네 위 24px, 위 '배치'). 눈에 띄는 차이는 없다
- 시안은 목차 이동을 JS 위치 계산으로 했다. 앱은 칸의 scroll-margin + `scrollIntoView`로 같은 자리에 온다
- 고치기 화면 제목(시안에 없음): 기본값 7

## 결정과 트레이드오프
- **탭 안 칸을 고치지 않고 `Section` 모드로 넣는다**: 세 칸을 '머리 없는 몸통'으로 쪼개면 설명·단추·고치기 초점 상태를 위로 올려야 하고 세 칸 시험(약 2,000줄)을 크게 고친다. 대신 `Section`이 탭 안인지 알고 설명·단추를 머리 줄 자리에 portal로 그린다. 값: 따로 그린 시험은 그대로 돈다. 비용: portal 한 번 더(자리 요소가 붙은 뒤 그려짐 — 첫 그림 한 번 늦음)
- **고르지 않은 탭·접힌 설명·접힌 상자를 `hidden`으로 그려 둔다**: 상태를 잃지 않고 `aria-controls` 대상이 늘 있다. 숨은 탭의 훅도 돈다(지금 세 칸이 다 그려지는 것과 같은 일)
- **목차 id는 context로 붙인다**: 아홉 칸 파일마다 `id` prop을 여러 return에 더하지 않으려고. `Section`이 안쪽으로 넘기지 않아 겹친 id가 없다
- **불러오기 띠 상태를 올린다**: 띠의 단추가 펼칠 칸의 고른 값을 써야 해서다. 펼칠 칸을 접어도 고른 값이 남는다
- **1280px 경계 예외 하나**: 승인 시안(1024~1279 두 열)을 지키려면 세 번째 폭 경계가 필요하다. 규칙 시험 예외로 적어 다른 파일은 그대로 막는다

## 위험
- **지금 시험 고치기가 많다**: `StatsScreen.test.tsx`(칸 제목 목록 · 처방 칸을 h2로 찾는 곳 · 자료 줄 글 · 접힌 상자 안 단추를 누르는 곳 · 개인정보 줄 자리), `PeriodSummary.test.tsx`(`StatsSections` 제목 목록 · 처방 칸), `SourcePicker.test.tsx`(상자 구조), 접는 글 자리를 보는 칸 시험. AC-4006.1: 기대값은 이 명세가 바꾸는 글·구조만 고치고, 고친 시험 이름에 이 명세 AC를 함께 적는다
- **열어 둔 상태 유지**: 탭 패널을 조건부로 그리면 바로 깨진다. AC-4003.5 시험이 '연 줄을 연 채 탭을 옮겼다 돌아옴'을 본다
- **portal 자리**: 고른 탭이 바뀔 때 설명·단추가 두 번 그려지거나 남지 않아야 한다(고른 패널만 그림). 고치기 초점 ref가 portal 안 단추에 붙는지 시험한다
- **붙는 띠 부모**: 목차 띠를 기간 줄 `div` 안에 넣으면 붙지 않는다(위 'StatsScreen')
- **스크롤 따라가기 비용**: 스크롤마다 아홉 칸 위치를 읽는다(passive, 가벼움). 무거우면 `requestAnimationFrame`으로 묶는다
- **E2E는 이 PC에서 `.env.local`이 있어야 돈다**: 셋을 고쳐 두고 돌릴 수 있을 때 돌린다(못 돌리면 끝에 알린다)
