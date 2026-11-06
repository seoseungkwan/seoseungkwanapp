# 설계: 환자 탭: 도우미 83 표 끝 총계 줄을 환자 줄로 읽지 않기

## 개요
- `src/workers/patients/jobs.ts`(도우미 표 → 원본 함수 잇기, 환자 자료 구역)의 `scheduleOf`가 원본 `prepareSchedule`을 부르기 전에 도우미 83 표에서 총계 줄만 뺀다
- `scheduleOf`는 F/U(`buildFollowup`, 조각을 이은 표)와 정기 주사(`mergeRecall`, 달 조각마다) 둘 다 지나는 한 곳이라 여기 하나만 고친다
- 원본 옮김(`lib/patients`)·도우미(`helper/`)·화면은 바꾸지 않는다

## 구성 요소 / 인터페이스
- `src/workers/patients/jobs.ts`
  - `function isHelperTotalRow(row: readonly string[], chartColumn: number): boolean` (내보내지 않음)
    - 참: `chartColumn >= 0`이고, `row[chartColumn]`에서 공백 글자(`/\s/g`)를 모두 지운 글이 `/^\d+(?:,\d{3})*건$/`이고, 다른 칸이 모두 `trim()` 뒤 빈 글자
    - 원본 `isChartSummaryRow`의 건수 모양 그대로이되 `【총계】` 글자를 보지 않는다(도우미 표에는 그 칸이 없다)
  - `function dropHelperTotalRows(chart: string[][]): string[][]` (내보내지 않음)
    - `chart[0]`(머리 줄)은 그대로. 차트번호 칸은 머리 줄에서 `headKey(cell) === '차트번호'`인 칸(`readTargets`가 다섯 이름이 꼭 하나씩임을 이미 확인했다)
    - 머리 줄 뒤 줄 중 `isHelperTotalRow`가 참인 줄만 뺀다(자리와 상관없이. 조각을 이은 F/U 표에서는 총계 줄이 가운데에도 있다)
  - `scheduleOf(chart)`: `prepareSchedule(dropHelperTotalRows(chart))`. `no-visits`를 빈 내원으로 바꾸는 지금 규칙은 그대로(총계 줄만 있는 조각 = 그 기간 진료 없음)

## 데이터 흐름
- 도우미 `contact.targets` 답 → `readTargets`(칸 이름 검사) → 조각 `chart` → `scheduleOf` → `dropHelperTotalRows` → 원본 `prepareSchedule` → F/U 보기 모양 / 정기 주사 기록

## 결정과 트레이드오프
- 웹에서 거른다: 도우미를 고치면 의원 PC마다 새 도우미를 깔아야 한다. 웹은 배포 한 번으로 끝난다. 도우미가 나중에 총계 줄을 안 보내도 이 거르기는 아무것도 빼지 않아 해가 없다
- 좁게 거른다: 건수 칸 말고 한 칸이라도 글자가 있거나 건수 모양이 아니면 거르지 않고 원본처럼 멈춘다. 환자 줄을 잘못 빼 명단에서 환자가 사라지는 일을 막는다(차트번호가 `N건`인 환자 줄은 없다)
- 원본 함수를 고치지 않는다: `lib/patients`는 양지바른 원본을 그대로 옮기고 골든 시험으로 원본과 같음을 증명한다. 도우미 표 모양에 맞추는 일은 잇는 층(`jobs.ts`)의 몫이다
- 총계 줄을 자리(맨 끝)로 찾지 않는다: F/U는 조각 넷을 이어 붙여 총계 줄이 가운데에도 생긴다

## 위험 / 미해결 질문
- 실제 비트 화면의 총계 줄 건수 칸이 `N건`이 아닌 다른 모양이면(예: `N명`) 여전히 `row-unreadable`이다. 진단 판의 이유 낱말이 그대로 보이므로 올린 뒤 바로 알 수 있다
- 총계 줄 말고도 환자명·기록날짜가 빈 줄이 실제 자료에 있으면 그 줄에서 다시 `row-unreadable`이 난다(범위 밖, 올린 뒤 이유 낱말로 확인)
- 운영에 올리기·깃허브 올리기는 사용자가 그때마다 OK 한 뒤 한다
