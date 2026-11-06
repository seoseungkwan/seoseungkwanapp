# 요구사항: 환자 탭 E-PATIENTS-SOURCE 오류 이유 낱말 보이기

> 기능 ID: `patients-source-reason` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
- 2026-11-06 사용자: 의원 PC에서 환자 탭을 열면 오래 읽은 뒤 **F/U 명단과 정기 주사 문자 명단이 둘 다** `E-PATIENTS-SOURCE`로 끝난다
- 이 번호는 비트 표를 계산하다가 원본(양지바른)이 멈추는 아홉 곳(`PatientsSourceReason`: `header-missing`·`header-duplicate`·`row-unreadable`·`visit-number-empty`·`visit-conflict`·`no-visits`·`phone-column-missing`·`phone-column-duplicate`·`phone-conflict`) 중 하나에서 난다. Worker는 이유를 알지만(`PatientsSourceError.reason`) 화면에는 번호만 간다
- 실제 환자 자료는 이 PC 밖으로 내보내거나 개발 대화에 붙일 수 없다. 이유 낱말은 정해 둔 영어 낱말 아홉 개뿐이라 환자 값이 없다
- 목표: 오류 번호 줄에 이유 낱말을 함께 보여, 사용자가 화면 글만 읽어 주면 어느 규칙에서 멈췄는지 알게 한다. 그 뒤의 진짜 고치기는 따로 명세한다
- 사용자 결정(2026-11-06): "네, 이유도 보이게" — 운영 사이트에 올려 다시 열어 본다

## 요구사항

### REQ-2101: Worker가 E-PATIENTS-SOURCE의 이유를 보기 모양 답에 싣는다
- AC-2101.1: Given F/U 계산(`buildFollowup`)이 `PatientsSourceError`로 멈춘 build, When Worker가 `views`를 보내면, Then `codes.followup`은 그대로 `E-PATIENTS-SOURCE`이고 `reasons`는 `{followup: <그 reason>}`이며, `reasons`를 JSON으로 바꾼 글에 환자 값(가짜 이름·차트번호·전화)이 없다
- AC-2101.2: Given 정기 주사 계산(`mergeRecall`·`buildRecall`)이 `PatientsSourceError`로 멈춘 build, When `views`를 보내면, Then `reasons`는 `{recall: <그 reason>}`이다
- AC-2101.3: Given `PatientsSourceError`가 아닌 오류(예: 조각이 깨진 `E-BRIDGE-BAD-REPLY`)만 있는 build, When `views`를 보내면, Then `views`에 `reasons` 칸이 없다(지금 답 모양 그대로)

### REQ-2102: 화면이 오류 번호 줄에 이유 낱말을 함께 보인다
- AC-2102.1: Given `views`의 `codes.followup = 'E-PATIENTS-SOURCE'`·`reasons.followup = 'row-unreadable'`, When F/U 도구를 보면, Then 오류 카드의 번호 줄 글자가 정확히 `오류 번호 E-PATIENTS-SOURCE (row-unreadable)`이다. 정기 주사 도구도 자기 이유로 같다
- AC-2102.2: Given `reasons`의 값이 정해 둔 아홉 낱말이 아닌 글(예: 가짜 환자 이름), When 그 도구를 보면, Then 번호 줄은 `오류 번호 E-PATIENTS-SOURCE`뿐이고 그 글은 화면 어디에도 없다
- AC-2102.3: Given 다른 화면이 쓰는 오류 카드(`ErrorCard`에 이유를 넘기지 않음), When 그리면, Then 번호 줄은 지금처럼 `오류 번호 <번호>`다

## 범위 밖
- E-PATIENTS-SOURCE가 나는 진짜 까닭 고치기(이유를 안 뒤 따로 명세)
- 환자 탭이 오래 걸리는 일(조각 12개 × 비트 화면 2개를 차례로 집계, F/U가 정기 주사를 기다림, 실패하면 정기 주사 읽은 데까지를 저장하지 않음) — 따로 명세
- 오류 카드의 글(`lib/errors.ts`)·모양·다른 번호, 도우미(`helper/`)
- 이유 낱말을 한국어로 풀어 쓰기(진단용 낱말 그대로 둔다)
