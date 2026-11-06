# 설계: 환자 탭 E-PATIENTS-SOURCE 오류 이유 낱말 보이기

## 개요
- Worker(`workers/patients/handler.ts`)가 F/U·정기 주사 계산에서 `PatientsSourceError`를 잡을 때 번호(`codes`)와 함께 이유(`reasons`)도 남겨 `views` 답에 싣는다
- 화면(`usePatientsWorker` → `PatientsScreen` → `ErrorCard`)은 정해 둔 아홉 낱말만 받아 번호 줄 끝에 ` (<낱말>)`로 붙인다. 그 밖의 글은 버린다
- 환자 값이 실릴 길이 없다: 이유는 `PatientsSourceReason` 낱말 목록에서만 오고, 화면은 그 목록에 있는 글만 그린다

## 구성 요소 / 인터페이스
- `src/types/patients.ts`
  - `export const PATIENTS_SOURCE_REASONS = ['header-missing', 'header-duplicate', 'row-unreadable', 'visit-number-empty', 'visit-conflict', 'no-visits', 'phone-column-missing', 'phone-column-duplicate', 'phone-conflict'] as const`
  - `export type PatientsSourceReason = (typeof PATIENTS_SOURCE_REASONS)[number]` (지금 union과 같은 아홉 개)
  - `export function isPatientsSourceReason(x: unknown): x is PatientsSourceReason`
  - `export type ViewReasons = { followup?: PatientsSourceReason; recall?: PatientsSourceReason }`
  - `PatientsWorkerMessage`의 `views`: `{ type: 'views'; …; codes: ViewCodes; reasons?: ViewReasons }`
- `src/workers/patients/handler.ts`
  - `let reasons: ViewReasons = {}`. `startCycle`·`runBuild`에서 `codes`와 함께 비운다
  - `makeFollowup`·`makeRecall`의 catch: `codes.<kind> = codeOf(error)` 다음에 `if (error instanceof PatientsSourceError) reasons.<kind> = error.reason`
  - `postViews`: `reasons`에 칸이 하나라도 있을 때만 `reasons: { ...reasons }`를 더한다(없으면 칸 자체가 없다, AC-2101.3)
- `src/components/patients/usePatientsWorker.ts`
  - `PatientsViews`에 `reasons?: ViewReasons`. `views` 답을 받을 때 `followup`·`recall` 각각 `isPatientsSourceReason`인 값만 옮긴다(아무것도 없으면 칸 없음)
- `src/components/patients/PatientsScreen.tsx`
  - `ToolState`가 `load.views?.reasons?.[tool]`을 `ErrorView`에 넘기고, `ErrorView`는 `<ErrorCard code={code} detail={reason} />`
- `src/components/common/ErrorCard.tsx`
  - `ErrorCard({ code, detail }: { code: ErrorCode; detail?: string })`. 번호 줄은 글자 한 덩어리 `` `오류 번호 ${code}${detail ? ` (${detail})` : ''}` ``. 다른 화면은 `detail`을 넘기지 않아 지금과 같다(AC-2102.3)

## 데이터 흐름
- 비트 조각 → Worker `buildFollowup`/`mergeRecall` → `PatientsSourceError(reason)` → handler `codes`·`reasons` → `views {codes, reasons?}` → `usePatientsWorker`(목록에 있는 낱말만) → `PatientsScreen` `ErrorView` → `ErrorCard` 번호 줄

## 결정과 트레이드오프
- 이유를 `codes` 글자에 섞지 않는다(`'E-PATIENTS-SOURCE (row-unreadable)'`): `isErrorCode`가 틀려져 오류 카드 글이 사라지고, 건수 올리기·다른 검사도 번호를 그대로 본다
- 낱말을 한국어로 풀지 않는다: 진단용이고, 사용자가 읽어 주는 글을 개발 쪽에서 그대로 찾을 수 있어야 한다. 화면 글(`lib/errors.ts`)은 바꾸지 않는다
- 화면 쪽에서도 목록 검사를 한 번 더 한다: Worker 답은 우리 코드지만, 번호 줄은 화면에 그대로 찍히는 곳이라 목록 밖 글이 올 길을 막는다
- 시안(클릭 목업)은 새로 만들지 않는다: 새 칸·새 단추가 없고 지금 있는 번호 줄 글자 끝에 괄호 낱말만 붙는다

## 위험 / 미해결 질문
- 이유를 안 뒤에야 진짜 고치기를 정한다(범위 밖). 두 명단이 다 멈춘 것으로 보아 두 쪽이 함께 쓰는 83 증상 표(`prepareSchedule`)일 가능성이 크다: `row-unreadable`·`visit-conflict`·`visit-number-empty` 중 하나로 짐작한다
- 운영 사이트에 올리는 일(main에 합치기·Vercel 배포)은 사용자가 이 고치기를 하자고 한 결정(2026-11-06)에 따른다
