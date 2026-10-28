# 설계: 통계 엔진: 파일럿 계산 이식 + 새 지표

## 개요
- 파일럿(`seoseungkwan/tonggye-bunseok` main `fbb303a`)의 `src/lib/parsers`·`src/lib/analytics`·`src/lib/payload`·`src/workers`·`src/types`(그중 필요한 것)·`fixtures`를 경로 그대로 옮긴다. 옮긴 시험은 고치지 않고 `describe` 이름 앞에 AC ID만 붙인다. 바뀌는 모양(v2) 때문에 기대값이 달라지는 시험만 고친다
- 새 지표는 파일럿 흐름 안에 끼워 넣는다. 새 모듈을 만들지 않는다
  - 세기(`aggregate`)가 처방별 재진·그룹·재방문 **원래 숫자**를 센다(환자 번호를 아는 곳은 여기뿐이다)
  - 요약(`compare`)이 비율과 재방문 '집계 중' 여부를 정한다(덮은 기간·오늘을 아는 곳)
  - 저장 모양(`payload`)은 요약에 나온 것만 옮긴다
- 프로젝트 뼈대는 파일럿 버전 그대로(Next.js 15.5.28, React 19.1, vitest 4, ESLint 9). 이 기능에 쓰지 않는 Supabase·Tailwind·Playwright·Testing Library는 아직 넣지 않는다

## 구성 요소 / 인터페이스

### 뼈대 (TASK-1)
- `package.json`: scripts `dev`·`build`(`next build`)·`lint`(`eslint .`)·`test`(`vitest run`)·`fixtures`(`tsx fixtures/make-fake-fixtures.ts`). dependencies `next`·`react`·`react-dom`·`xlsx`(SheetJS CDN 0.20.3). devDependencies `typescript`·`@types/*`·`eslint`·`eslint-config-next`·`@eslint/eslintrc`·`vitest`·`iconv-lite`·`tsx`
- `vitest.config.ts`: `process.env.TZ = 'Asia/Seoul'`, `@` → `./src`, node 환경 하나, include `src/**/*.test.ts`·`fixtures/**/*.test.ts`
- `src/app/layout.tsx`·`page.tsx`: 빌드용 빈 자리(제목 한 줄). 화면 디자인이 아니다. 랜딩을 만들 때 바뀐다

### 울타리 (TASK-2)
- `eslint.config.mjs`: 파일럿의 환자 자료 구역 블록과 `react/no-danger`만. `lib/storage` 블록은 저장 기능 때 옮긴다
- `src/guardrails.test.ts`: 파일럿 시험 중 구역·구역 밖·no-danger 부분

### 타입 (`src/types/`)
- `dates.ts`·`parse.ts`·`consumption.ts`·`errors.ts`·`analyze.ts`: 파일럿 그대로. `errors.ts`의 `ErrorCode`는 이 기능이 쓰는 `E-PARSE-*`·`E-ANALYZE-*`만
- `analysis.ts`에 더하는 것:
```ts
export type RxGroupDef = { id: string; codes: string[] } // id: 영문·숫자·붙임표 1~64자(나중 rx_groups.id)

export type RxStats = { /* 파일럿 그대로 */ returning: number } // newPatients + returning ≤ patients
export type GroupStats = { id: string; patients: number; newPatients: number; returning: number; followup: FollowUp }
export type RevisitCounts = { cohort: number; within7: number; within14: number } // 덮은 기간과 상관없이 센 그대로

export type BucketStats = { /* 파일럿 그대로 */ groups: GroupStats[]; revisit: RevisitCounts }

export type Rates = { newRate: number | null; returningRate: number | null } // 0~1, 전체 0명이면 null
// withinN null = '집계 중'. rateN = withinN / cohort (집단 0명이거나 집계 중이면 null)
export type RevisitView = { cohort: number; within7: number | null; within14: number | null; rate7: number | null; rate14: number | null }

export type BucketRef = { /* 파일럿 그대로 */ rates: Rates; revisit: RevisitView }
export type RxCompare = { /* 파일럿 그대로 */ returningRate: number | null }
export type GroupCompare = {
  id: string; current: number; previous: number | null; delta: Delta
  newRate: number | null; returningRate: number | null; followupRate: number | null
}
export type DayView = { /* 파일럿 그대로 */ groups: GroupCompare[] }
export type GrainView = { /* 파일럿 그대로 */ groups: GroupCompare[] }
```
- `payload.ts` (v2):
```ts
type RevisitPayload = { cohort: number; within7: number | null; within14: number | null }
export type MonthPayload = {
  schemaVersion: 2; quality: 'valid'; month: string; partial: boolean
  totals: Totals
  rx: Array<{ code; name; type; patients; newPatients; returning; followup: FollowUp }>
  groups: Array<{ id; patients; newPatients; returning; followup: FollowUp }>
  revisit: RevisitPayload
  regions: Array<{ name; patients }> // 5명 이상만
}
export type DayPayload = {
  schemaVersion: 2; quality: 'valid'; day: string; partial: boolean
  totals: Totals
  rx: Array<{ code; name; type; patients; newPatients; returning }> // 하루라 F/U는 늘 1회 → 뺀다
  groups: Array<{ id; patients; newPatients; returning }>
  revisit: RevisitPayload
} // 동네 없음(하루 칸은 작다)
```

### 함수
```ts
// lib/parsers/bit/parseBit.ts
export function looksLikeNationalId(value: string): boolean           // 붙임표 모양(파일럿 그대로)
export function looksLikeJoinedNationalId(value: string): boolean     // 붙여 쓴 13자리: YY + 월(01~12) + 일(01~31) + 성별(1~8) + 6자리, 앞뒤에 숫자 없음
// parseBitGrid: 모든 허용 칸에 looksLikeNationalId, 처방코드 칸 밖 허용 칸에 looksLikeJoinedNationalId

// lib/analytics/aggregate.ts
export function aggregate(rows: ConsumptionRow[], groups?: RxGroupDef[]): Aggregates

// lib/analytics/compare.ts
export function buildSummary(input: { aggregates; covered; quality; today }): Summary // 모양만 늘어난다

// lib/payload
export function toMonthPayload(result: AnalysisResult): MonthPayload[] | null
export function toDayPayloads(result: AnalysisResult): DayPayload[] | null
export function validateMonthPayload(value: unknown): MonthPayload | null
export function validateDayPayload(value: unknown): DayPayload | null

// workers
export function analyzeFiles(files, today, groups: RxGroupDef[], onProgress?): AnalyzeOutput
export async function runAnalysis(files: File[], opts?: { …파일럿 그대로, groups?: RxGroupDef[] }): Promise<AnalyzeOutput>
// WorkerRequest = { files; today; groups: RxGroupDef[] }
```
- `lib/payload/validate.ts`는 글자 검사 두 가지를 둔다: 처방코드용(전화·붙임표 주민번호·메일), 그 밖 글자용(+ 붙여 쓴 주민번호). 그룹 id는 `^[A-Za-z0-9-]{1,64}$`

## 데이터 흐름
```
화면 ─(바이트·오늘·그룹 정의)→ Worker: parseBitFile → ConsumptionRow[]
   → aggregate(rows, groups) → Aggregates(칸마다 숫자·처방 재진·그룹·재방문 원래 숫자)
   → buildSummary → Summary(비율·재방문 집계 중 판정·그룹 비교)
   → 화면 ← AnalyzeOutput
화면 → toMonthPayload / toDayPayloads(Aggregates + Summary.series) → validate → (나중: lib/storage가 저장)
```

### 재방문 세는 법 (aggregate)
1. 줄을 훑으며 환자마다 '첫 신환일'(`firstVisit === true`인 외래 줄의 가장 이른 날)과 외래 방문 날 묶음을 모은다. 입원 줄(`outpatient === false`)은 넣지 않는다. `outpatient === null`은 파일럿처럼 외래로 본다
2. 첫 신환일 f가 있는 환자마다: 방문 날 v 중 `1 ≤ diffDays(f, v) ≤ 7`이 있으면 7일 재방문, `≤ 14`면 14일 재방문
3. f가 든 일·주·월 칸의 `cohort`·`within7`·`within14`에 더한다. 그 칸들은 f의 줄이 있어 반드시 있다

### 재방문 '집계 중' (compare)
- N일 숫자를 낸다 ⇔ `bucketState({ from: 칸 첫날, to: addDays(칸 끝날, N) }, merged, today) === 'complete'`
- 칸 자체가 덮이고(집단이 다 모임) N일 뒤까지 덮이고 끝나야 한다. 14일이 숫자면 7일도 숫자다

### 처방·그룹의 신환·재진
- 파일럿 규칙 그대로 '칸에서의' 신환·재진이다. 예: 10월 2일 신환, 10월 15일(재진 줄) 도수치료 → [월] 10월 도수치료의 신환 1명. [일] 10월 15일에서는 재진
- 그룹은 코드 묶음을 처방 하나처럼 센다: 환자 = 그룹 코드 중 하나라도 받은 환자, F/U = 그룹 코드 중 하나라도 받은 서로 다른 날 수

## 결정과 트레이드오프
- **원래 숫자는 aggregate, 판정은 compare**: aggregate는 덮은 기간을 모른다(파일럿 구조). 재방문 '집계 중'은 덮은 기간이 있어야 정할 수 있어 compare에서 한다
- **첫 신환일은 묶음 전체에서**: 한 환자가 신환으로 두 번 찍혀도 집단에는 한 번만 들어간다(plan 7절). 대신 칸 합계의 신환 수는 파일럿 그대로 둔다 → 재방문 집단 ≤ 그 칸 신환. 검사(AC-008.4)가 이 관계를 본다
- **저장은 세기 숫자만, 비율은 읽을 때 계산**: 비율을 저장하면 합과 어긋날 수 있다
- **v1 읽기는 만들지 않는다**: 새 Supabase라 v1 줄이 없다
- **일 숫자에 동네·F/U를 넣지 않는다**: 하루 동네 칸은 작아(개인 식별 위험) 5명 기준을 넘는 칸이 거의 없고, 하루 F/U는 늘 1회다
- **붙여 쓴 주민번호 검사는 처방코드 칸에서 하지 않는다**: 의약품 표준코드(880…)는 88년생 1~9월 주민번호와 모양이 같아 숫자로 가를 수 없다
- **그룹 이름은 저장하지 않는다**: id만 저장하고, 이름은 나중에 `rx_groups`에서 붙인다. 그룹을 바꾸면 지난 달 숫자는 파일을 다시 넣어야 바뀐다(plan 7절)
- **뼈대에 쓰지 않는 패키지는 넣지 않는다**: Supabase 등은 쓰는 기능에서 넣는다

## 위험 / 미해결 질문
- 처방명칭·주소·차트번호 칸에 13자리 의약품 표준코드나 우연히 주민번호 모양인 13자리 숫자가 있으면 파일 전체가 거부된다. 안전한 쪽으로 둔다. 실제 파일에서 걸리면 그때 칸별로 다시 정한다
- 비트 '초재진구분'이 실제로 환자의 첫 방문만 '신환'으로 찍는지는 파일럿에서도 확인하지 않았다. 재방문 집단이 이 값에 기댄다
- 재방문 창이 파일 범위를 넘으면 '집계 중'이 오래 간다(예: 매일 '지난달 1일~어제'로 뽑으면 지난달 말 신환의 14일 재방문은 이번 달 14일 무렵에야 숫자가 된다). 저장한 달 숫자는 파일을 다시 넣을 때 새 값으로 바뀐다
- 파일럿 시험은 차트번호·주민번호 모양을 소스에 통째로 쓰지 않고 조각을 이어 만든다. 새 시험도 그렇게 한다
