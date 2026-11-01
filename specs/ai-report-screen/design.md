# 설계: AI 리포트 탭 화면

> 기준: `plan.md`, `docs/UI_GUIDE.md`, ADR-004·ADR-024, 승인 시안 `docs/mockups/ai-report/index.html`. 뒷단 설계는 `specs/ai-report/design.md`.

## 흐름

```
/ai-report page.tsx (서버, today만 넘김)
  └─ AiReportScreen (브라우저, 상태를 가짐)
       ├─ loadMonth(month)    → GET  /api/ai/report?month=  → readMe 승인 확인
       │                                                    → readSavedReport · readUsage (사용자 세션, RLS)
       │                                                    → 리포트가 있으면 isReportStale(loadReportMonths)
       └─ analyzeMonth(month) → POST /api/ai/report { month } → generateReport (뒷단 그대로)
            끝나면(성공·실패 모두) loadMonth를 다시 불러 사용량과 숫자 바뀜을 새로 한다
```

## 결정과 트레이드오프

### 읽기는 브라우저 직접 읽기 대신 `GET /api/ai/report`
`ai_reports`·`ai_usage`는 RLS 읽기 권한이 있어 브라우저에서 바로 읽을 수도 있다. 그래도 서버 경로 하나로 모은다.
- '숫자가 바뀐' 판단에는 `loadReportMonths`와 입력 만들기가 필요한데 둘 다 서버 쪽이다. 브라우저에서 읽으면 읽는 길이 둘이 되고, 통계 명세가 읽기를 바꿀 때 두 곳을 고쳐야 한다. 두 길이 어긋나면 모든 리포트에 '숫자가 바뀌었어요'가 잘못 뜰 수 있다.
- 한 번 불러 리포트·바뀜·사용량을 함께 받으니 "반쯤 읽힌" 상태가 없다.
- ADR-004(`app/api/ai/` 밖에 서버 코드 없음)와 맞고 주소도 늘지 않는다. 서버는 사용자 세션으로 읽으므로 RLS가 그대로 막는다. service role 키는 쓰지 않는다.
- 대가: 달을 옮길 때마다 서버를 한 번 거친다. 그래서 '읽는 중' 상태가 필요하다.

### 저장 지문은 화면에 보내지 않는다
화면에는 `stale` 참·거짓만 필요하다. 응답 타입 `ReportView.report`는 `Omit<SavedReport, 'inputHash'>`다.

### 숫자 바뀜 비교는 만들 때와 같은 코드로
`generateReport` 안의 "세 달 검사 → 입력 만들기 → 지문"을 `generate.ts`의 내부 함수 하나로 꺼내 두 곳에서 쓴다. 같은 함수를 쓰지 않으면 AC-705.1이 깨지기 쉽다. 달이 안 맞는 자료는 없는 달로 보는 판정(뒷단 4단계)도 그대로 따라온다.

### 달을 옮겨도 저장하지 않는다
고른 달은 화면 상태에만 둔다(주소에 넣지 않음). 새로 고치면 지난달로 돌아온다. 시안과 같고 코드가 적다.

### 처음 달은 상수
`REPORT_FIRST_MONTH = '2026-01'`(시안 값). 통계 명세가 진짜 자료 범위를 알게 되면 바꾼다.

## 구성 요소

### 타입 (`src/types/aiReport.ts`에 더함)
```ts
export type AiUsageView = { calls: number; tokens: number; costMicroUsd: number }
export type ShownReport = Omit<SavedReport, 'inputHash'>
export type ReportView = { report: ShownReport | null; stale: boolean; usage: AiUsageView }
```
`AiErrorCode`(뒷단 네 번호)는 그대로 둔다. `E-AI-READ`는 `POST`가 쓰지 않으므로 `ErrorCode`에만 더한다. `POST`의 상태표 `Record<AiErrorCode, number>`가 넓어지지 않게 하려는 것이다.

### 순수 함수 (`src/lib/ai/`, 울타리 그대로: supabase·next·react·SDK·`node:` 없음)
- `savedReport.ts`: `parseSavedReport(row: unknown): SavedReport | null`. 저장 JSON도 믿지 않는다. `output.ts`와 같이 정해 둔 칸만 골라 새 객체로 돌려준다. 브라우저가 서버 답을 검사할 때 쓰는 `parseShownReport(value: unknown): ShownReport | null`도 여기 둔다(`POST` 답에 든 `inputHash`는 여기서 버려진다).
- `reportScreen.ts`:
  - `firstMonth(today)`, `canGoPrev(month)`, `canGoNext(month, today)`
  - `compareLine(month)`, `longMonth(month)`, `shortMonth(month)`
  - `madeAtText(createdAt, now)`: 한국 시각, `Intl.DateTimeFormat`에 `timeZone: 'Asia/Seoul'`
  - `modelName(model)`, `usageText(usage)`, `reportCopyText(report)`
  - `partialNotice(report, today)`: `{ chip, title, body } | null`

  금액 규칙은 `plan.md §5`의 '반올림 없음'을 달러 표시에도 따른다(`Math.floor`, 부동소수점을 피해 정수로 자른 뒤 글자로 만든다).

### 서버 (`src/app/api/ai/`)
- `store.ts`에 더함: `readSavedReport(sb, month): Promise<SavedReport | null | 'failed'>`, `readUsage(sb, thisMonth): Promise<AiUsageView | 'failed'>`. 오류 내용은 버린다(기존 원칙).
- `generate.ts`에 더함: `isReportStale(month, savedHash, loadMonths): Promise<boolean>`. 던지거나 고른 달이 없으면 false.
- `report/route.ts`에 `GET` 더함. 순서: 승인 확인(401·403) → 달 검사(400) → 읽기 → 바뀜 → 응답. `POST` 몸통과 순서는 그대로다. 파일이 export하는 이름은 Next가 아는 이름뿐이라는 규칙을 지킨다.

### 브라우저 (`src/components/ai-report/`)
- `reportClient.ts`: `loadMonth(month)`, `analyzeMonth(month)`. `fetch(..., { redirect: 'manual' })`. 결과는 던지지 않고 값으로 돌려준다.
  ```ts
  type Reauth = { kind: 'reauth' }
  type LoadResult = { kind: 'ok'; view: ReportView } | { kind: 'error'; code: 'E-AI-READ' } | Reauth
  type AnalyzeResult = { kind: 'ok'; report: ShownReport } | { kind: 'error'; code: AiErrorCode } | Reauth
  ```
- `AiReportScreen.tsx`: 상태와 동작(달·읽기·분석·타이머·복사). 늦게 온 답은 요청 번호로 버린다.
- `ReportBody.tsx`: 머리 아래 본문 그리기(리포트·빈 화면·기다림·통계 없음·안내 상자·오류 상자). props만 받는다.
- `UsageAside.tsx`: 옆 칸.
- `RedoDialog.tsx`: 확인 창. 모양과 키 처리는 `AdminApplications`의 확인 창과 UI_GUIDE '확인 창'을 따른다.

오류 상자는 `components/common/ErrorCard.tsx`를 먼저 쓴다. 안내 상자·달 고르기·칩은 시안 모양을 `ds` 키와 토큰으로 옮기고, 새 색 값을 쓰지 않는다. 기다림 표시는 `aria-busy` 규칙(UI_GUIDE '단추')을 따르고 움직임을 넣지 않는다. 복사는 `auth/CopyStatus.tsx`의 `useCopy`를 참고하되, 그 파일은 인증 화면 것이라 고치지 않는다.

## 화면 상태 (보이는 글은 requirements.md와 시안)

한 번에 하나를 고른다. 위에 있는 것이 이긴다.

| 조건 | 본문 | 머리 단추 |
|---|---|---|
| 읽는 중 | "읽고 있어요" | 없음 |
| 읽기 실패 | 오류 상자 + [다시 읽기] | 없음 |
| 분석 중, 리포트 없음 | '숫자를 읽고 있어요' + 분석 중 단추 + 초 | 없음 |
| 분석 중, 리포트 있음 | 안내 상자 + 옛 리포트 | 분석 중(보조) |
| `E-AI-NO-DATA`, 리포트 없음 | 통계 없음 + [통계 탭으로] | 없음 |
| 오류, 리포트 없음 | 오류 상자 + 빈 화면 [AI 분석] | 없음 |
| 오류, 리포트 있음(NO-DATA 포함) | 오류 상자 + 리포트 | [다시 분석] |
| 리포트 있음 | 안내 상자(달 끝나기 전·바뀜) + 리포트 | [다시 분석](바뀜이면 주 단추) |
| 리포트 없음 | 빈 화면 [AI 분석] | 없음 |

시안의 9상태는 이 표의 칸에 모두 들어간다. 오류 상자와 안내 상자가 함께면 시안처럼 오류를 위에 둔다.

## 뒷단에서 넘겨받은 것 (`specs/ai-report` '4단계에서 남긴 것')
1. **middleware가 로그인 안 한 `/api/*`를 `/login`으로 보냄**: middleware는 고치지 않는다. `redirect: 'manual'`로 받아 돌려보냄이면 페이지를 다시 읽고, 문지기가 갈 곳을 정한다. 로그인 코드를 건드릴 위험을 지지 않는다. `POST`가 `/login`으로 따라가 HTML을 받는 일도 없다.
2. **로그인 안 한 사람의 잘못된 몸통은 400**: 그대로 둔다. 화면은 늘 맞는 몸통을 보낸다. 새 `GET`은 로그인을 먼저 본다.
3. **Content-Type을 보지 않음**: 그대로 둔다. 세션 쿠키가 `sameSite: lax`라 다른 사이트의 POST에는 쿠키가 실리지 않아 401로 끝난다(코드로 판단, 진짜 브라우저로는 아직 확인 안 함).
4. **승인 사용자 연타**: 화면은 기다리는 동안 다시 보내지 않는다(AC-710.3). 창 두 개는 막지 않는다(아래 '위험').

## 시험 방법
- 순수 함수·경로·클라이언트: 기존처럼 가짜 의존성.
- 화면: 기존 화면 시험처럼 Testing Library. `fetch`만 가짜로 두고 9상태와 추가 상태를 모두 그려 본다. 타이머는 가짜 시계.
- **눈으로 보기**: 구현 뒤 이 PC에서 Playwright로 로그인 없이 그려 볼 수 없다(시험용 우회 길 금지). 그래서 지금 실제로 닿는 두 상태는 사용자가 운영(또는 개발 서버)에서 보고, 나머지는 시험과 시안 대조로 본다. 통계 명세가 들어온 뒤 진짜 리포트를 한 번 더 본다.

## 위험
1. **분석 도중 창을 닫거나 다른 탭으로 감**: 서버는 끝까지 돌아 저장하고 비용이 든다. 돌아오면 저장된 리포트가 보이지만, 끝나기 전에 돌아오면 '안 만든 달'로 보여 또 누를 수 있다. 시안의 "이 화면을 그대로 두고 기다려 주세요"가 막는 전부이고, 혼자 쓰는 MVP라 받아들인다.
2. **창 두 개에서 함께 누름**: 비용이 두 번 든다. 나중 저장이 덮어쓴다. 상한은 콘솔 한도.
3. **응답을 못 받았는데 서버는 성공**: `E-AI-BUSY`를 보이지만 곧이어 다시 읽어 새 리포트가 그 아래 보인다. 오류 상자는 다음 동작까지 남는다.
4. **운영 DB에 표가 없는 채 배포**: 탭이 `E-AI-READ`만 보인다. 그래서 표 추가를 배포 앞에 둔다(tasks.md).
5. **큰 파일 시안 대조**: 시안은 글꼴을 품어 1.1MB다. 통째로 읽지 말고 `<body>` 아래만 읽는다.
6. **옛 명세의 AC 글자**: ui-90·tab-frame의 "준비 중 10개" 시험을 고치는데 옛 명세 파일은 고치지 않는다. 이 명세의 REQ-714가 그 수를 대신한다. 옛 AC ID를 시험 이름에 그대로 두어 추적이 끊기지 않게 한다.
