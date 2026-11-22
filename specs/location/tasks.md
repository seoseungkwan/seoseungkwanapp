# 작업 분할: 입지 분석
> TASK-8(예상 환자)은 사용자가 계산을 빼서 지웠다(2026-11-22, 번호는 다시 매기지 않음). 나중에 더한 TASK: 49(점수 세부 설정 판, Phase 3) · 51(Phase 1 맞추기)·50(의료급여·차상위)(둘 다 Phase 2) · 52~79(Phase 6~9 덧붙임 — 시안 승인 3·진짜 열쇠 결과·합칠 때 모은 어긋남, 2026-11-22) · TASK-48은 Phase 10으로 옮김. 형식: `## Phase n` 아래 `## TASK-n: 제목` · `- REQ:`(REQ · AC) · `- Files:`(수정 범위, glob 허용) · `- Tests:` · `- TDD:`. 승인되면 Files/Tests 경로만 고친다. TASK마다 일꾼 하나(각자 git worktree). **Phase 안 TASK(step)는 모두 동시에 하고 Files가 서로 겹치지 않는다**(Phase 머리에 겹침 확인, 2026-11-22). 다음 Phase는 앞 Phase를 모두 합친 뒤. 여러 TASK가 같이 쓰는 것(DB·타입·종류 검사·서버 공통·출처 목록)은 Phase 1에 둔다. 같은 Phase에서 만드는 파일은 서로 부르지 않는다(Phase 1 계산 파일은 자기 입력·출력 타입을 스스로 내보낸다).
> **검토는 마지막 Phase 10에서 한 번만**(화면 사진 확인 + 독립 검토, 재검토는 사용자에게 묻고). 중간 Phase에 검토 TASK는 없고 일꾼은 자기 시험만, 합칠 때 그 Phase 시험만 돌린다. **시험 먼저(TDD)**: 시험 이름에 AC ID, 실패를 본 뒤 만든다. 바깥 자료는 **가짜 응답으로 먼저**(`fixtures/location/api/<묶음>/`, 지어낸 이름만), 진짜 열쇠는 TASK-47. **화면 TASK(26~29·31~44·46·49)는 승인된 시안(`docs/mockups/location/`, 사용자 승인 2026-11-22·승인 2) 자리 그대로, 글은 requirements.md '화면 글 기본값'이 먼저**(점수 처음 값은 design.md 8절이 먼저, 그 밖은 requirements.md 머리 규칙), 폰 전용 모양 없음(`max-md:` 금지, 폰 폭 사진 없음), 화면 부품은 props·콜백만(design.md 14절).
> **사용자 단계**: (1) 시안 승인 (2) `/sdd approve location` (3) 공공데이터포털 활용신청(design.md 4절)·카카오 앱·사이트 도메인 등록 (4) 열쇠를 `.env.local`·Vercel 환경 변수에 직접(Claude가 한 단계씩 안내, 대화에 붙이지 않음) (5) 배포 전 `supabase/migrations/20261122000000_location.sql`을 SQL Editor에 붙여 넣고 Storage `location-photos`가 Private인지 보기. 배포·합치기(운영 갈래)는 사용자가 말할 때만. 다른 갈래와 겹칠 수 있는 파일(`docs/ADR.md`·`CLAUDE.md`·`plan.md`·errors·`csp.ts`·`next.config.ts`·셸·대시보드)은 합칠 때 앞 갈래를 먼저 받고 번호·수만 맞춘다.
## Phase 1 — 같이 쓰는 바탕 (10명 동시 · 겹침 없음: supabase·문서 / 타입·종류 검사·서버 공통 / 출처·오류 / `lib/location/` 파일이 TASK마다 따로)
## TASK-1: DB 표 여섯·사진 칸·ADR-042~044·문서
- REQ: REQ-7902, REQ-7919 · AC-7902.1, AC-7902.2, AC-7902.3, AC-7902.4, AC-7902.5, AC-7919.5
- Files: supabase/migrations/20261122000000_location.sql, supabase/location.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md, plan.md, CLAUDE.md
- Tests: supabase/location.rls.test.ts
- TDD: required — design.md 7·16절. 본보기 `supabase/contacts.rls.test.ts`·`inventory.rls.test.ts`(PGlite, 진짜 migration 사슬을 데스크·주소록 SQL까지). 관리자·관리자 아닌 원장·다른 병원 관리자·데스크·승인 대기·anon을 모두 본다. `on delete set null (칸)`이 그 칸만 비우는지, 사진 30줄 트리거, `location_score_rule_ok`(design.md 7·8절, 기본값은 통과·틀린 모양은 23514). **실제 Supabase에 붙여 넣지 않는다**
## TASK-2: 공용 모양·종류 검사·서버 공통(관리자 확인·바깥 부르기·두 경로)
- REQ: REQ-7903 · AC-7903.1, AC-7903.2, AC-7903.3, AC-7903.4, AC-7903.5
- Files: src/types/location.ts, src/lib/location/query.ts, src/lib/location/query.test.ts, src/lib/location/source.test.ts, src/app/api/ai/location/guard.ts, src/app/api/ai/location/guard.test.ts, src/app/api/ai/location/fetchSource.ts, src/app/api/ai/location/fetchSource.test.ts, src/app/api/ai/location/registry.ts, src/app/api/ai/location/query/route.ts, src/app/api/ai/location/query/route.test.ts, src/app/api/ai/location/keys/route.ts, src/app/api/ai/location/keys/route.test.ts
- Tests: src/lib/location/query.test.ts, src/lib/location/source.test.ts, src/app/api/ai/location/guard.test.ts, src/app/api/ai/location/fetchSource.test.ts, src/app/api/ai/location/query/route.test.ts, src/app/api/ai/location/keys/route.test.ts
- TDD: required — design.md 3·4·6절 타입 그대로(`SourceId = string`). `checkQuery`는 종류 27개·칸 범위만. 경로 처리 함수는 registry를 받아 시험이 가짜 읽는 곳을 넣고 `registry.ts`는 빈 판(TASK-45가 잇는다). 본보기 `app/api/ai/inventory/invoice/route.ts`. host 밖(사람 흐름 host는 design.md 3절에 채운 값)·redirect·8초·2MB·`not-applied`·열쇠가 로그·답에 없음·카카오 답을 담아 두지 않음·서버 메모리 보관 없음. 새 파일 첫 줄 `import 'server-only'`(route 빼고). `source.test.ts`는 `src/lib/location/` 시험 밖 파일이 순수한지 소스 글자로 본다(본보기 `src/lib/contacts/source.test.ts`)
## TASK-3: 출처 목록·법 근거·없는 자료·오류 번호
- REQ: REQ-7906, REQ-7917 · AC-7906.1, AC-7917.3
- Files: src/lib/location/sources.ts, src/lib/location/sources.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/location/sources.test.ts, src/lib/errors.test.ts
- TDD: required — design.md 2·15절. `SOURCES`는 조사 1~3 표의 기관·번호·이용 조건 그대로(통계청은 '국가데이터처', 부동산원 임대동향·서울 생활인구는 넣지 않음, 학교 15021148·산업단지 고용 15085886 줄 더함, 하루 이용률(15072876)·직원 월급(실태조사·구인 시세)도 넣지 않음, 사람 흐름 15142066·15142032·15142034와 좌표 파일 15067528·15013205 줄은 조사 4 그대로, 사용자 값 `user` 포함), `LAW_BASIS` 아홉 줄, `MISSING`은 requirements '자료가 없는 것'. 오류 다섯은 design.md 15절 글 그대로
## TASK-4: 좌표·지역(EPSG:5174·거리·표본 점·동 찾기·동 몫·코드)
- REQ: REQ-7905 · AC-7905.1, AC-7905.2, AC-7905.3, AC-7905.4
- Files: src/lib/location/coords.ts, src/lib/location/coords.test.ts, src/lib/location/regions.ts, src/lib/location/regions.test.ts, fixtures/location/dongs/**
- Tests: src/lib/location/coords.test.ts, src/lib/location/regions.test.ts
- TDD: required — design.md 5절. 기준점 다섯은 저장소 밖(scratchpad)에서 proj4로 한 번 구해 숫자로만 적는다(proj4를 넣지 않음). 동 경계 견본은 지어낸 동 셋 + `index.json`
## TASK-5: 넓이·돈 글자
- REQ: REQ-7905 · AC-7905.5
- Files: src/lib/location/area.ts, src/lib/location/area.test.ts, src/lib/location/money.ts, src/lib/location/money.test.ts
- Tests: src/lib/location/area.test.ts, src/lib/location/money.test.ts
- TDD: required — design.md 5절. 평↔㎡ 버림, 저장 ㎡ 소수 2자리, `1억 5,000만 원`·`112,500원`·`0원`, 소수 금액은 거부
## TASK-6: 점수(세부 항목·기준·무게 설정)
- REQ: REQ-7911, REQ-7919 · AC-7911.1, AC-7911.2, AC-7919.2
- Files: src/lib/location/score.ts, src/lib/location/score.test.ts
- Tests: src/lib/location/score.test.ts
- TDD: required — design.md 8절 표 그대로 `DEFAULT_SCORE_RULE`(세부 id·방향·처음 기준·무게·훑기 여부, 화면·'근거와 출처'가 그대로 그림)·`checkScoreRule`(칸 검사 글)·`scoreItems(values, rule)`. 많을수록/적을수록 식의 끝(기준과 같음·넘음·사이·음수), 세부·항목 무게 다시 나누기, 다 없음·무게 합 0, 고른 나이대만 밀도에, 동 단위(세 항목·훑기 ○만)와 후보(다섯 항목), 매물 1개면 `k-vsAvg` 없음, 지하층 `s-floor` 0점
## TASK-7: 위험 신호
- REQ: REQ-7911 · AC-7911.3
- Files: src/lib/location/flags.ts, src/lib/location/flags.test.ts
- Tests: src/lib/location/flags.test.ts
- TDD: required — design.md 9절 열 가지의 차례·경계 값(30m·3년·1.3배·500㎡·15%·1,000m), 위반 건축물 안 고름 = `확인 필요`, 매물 2개 미만이면 `rent-high` 없음. 근거 id는 `LAW_BASIS` id 글자(목록 대조는 TASK-3 시험)
## TASK-9: 비용·개원 일정
- REQ: REQ-7913 · AC-7913.1, AC-7913.2
- Files: src/lib/location/costs.ts, src/lib/location/costs.test.ts, src/lib/location/schedule.ts, src/lib/location/schedule.test.ts
- Tests: src/lib/location/costs.test.ts, src/lib/location/schedule.test.ts
- TDD: required — design.md 11절. 정수만(만 원 칸 × 10,000), 이자 버림, 손익분기 소수 첫째 자리 버림, 빈칸 수, 내 돈 음수. 일정은 시안의 할 일 열넷, `lib/analytics/dates.ts`의 `addDays`, 지난 할 일 표시, 할 일 id 고정
## TASK-10: 점검 항목·진료 시간 빈틈
- REQ: REQ-7913, REQ-7909 · AC-7913.3, AC-7909.3
- Files: src/lib/location/checklist.ts, src/lib/location/checklist.test.ts, src/lib/location/hours.ts, src/lib/location/hours.test.ts
- Tests: src/lib/location/checklist.test.ts, src/lib/location/hours.test.ts
- TDD: required — design.md 11절. 점검 셋(건물 요건·계약 전 위험·보러 갈 때)의 id·근거 id, 값 세 가지. 빈틈 표 7×7, 칸 전체를 열어야 셈, 점심 쉼 모름 표시, 공휴일 안 셈
## TASK-11: 바깥 링크·알림 판정·매물 견주기
- REQ: REQ-7910, REQ-7915, REQ-7918 · AC-7910.2, AC-7915.1, AC-7918.4
- Files: src/lib/location/links.ts, src/lib/location/links.test.ts, src/lib/location/watch.ts, src/lib/location/watch.test.ts, src/lib/location/listings.ts, src/lib/location/listings.test.ts
- Tests: src/lib/location/links.test.ts, src/lib/location/watch.test.ts, src/lib/location/listings.test.ts
- TDD: required — design.md 11·12·13절. 네이버 두 모양 + 고르는 상수 하나(확정은 TASK-47), 토지이음 PNU·등기소·법령 주소 `encodeURI`. 알림: 5곳·30일·기간 끝 오늘 − 2일·과목 거르기·범위. 매물: 평당 월세·보증금 평균, 2개 미만이면 견주지 않음, `{n}% 비싸요`·`싸요`·`평균과 같아요`, 평수 거르기
## Phase 2 — Phase 1 맞추기 + 바깥 자료 열세 묶음 (14명 동시 · 겹침 없음: TASK-51 `types/location.ts`·`lib/location/{query,flags,watch,listings,costs,hours,checklist,coords,score}*`·SQL / `app/api/ai/location/sources/<묶음>.ts`·`fixtures/location/api/<묶음>/`이 하나씩, TASK-23만 `lib/location/flow*`, TASK-50만 `lib/location/sources*`·`docs/ADR.md`를 더함)
## TASK-51: Phase 1 맞추기(법 id·겹친 계산·타입 한 곳·글·SQL 처음 값) + 의료급여 칸 자리
- REQ: REQ-7911, REQ-7913, REQ-7909, REQ-7910, REQ-7915, REQ-7905, REQ-7919, REQ-7902 · AC-7911.3, AC-7911.4, AC-7913.1, AC-7913.5, AC-7909.3, AC-7910.2, AC-7915.1, AC-7905.6, AC-7919.6, AC-7902.1
- Files: src/types/location.ts, src/lib/location/query.ts, src/lib/location/query.test.ts, src/lib/location/flags.ts, src/lib/location/flags.test.ts, src/lib/location/watch.ts, src/lib/location/watch.test.ts, src/lib/location/listings.ts, src/lib/location/listings.test.ts, src/lib/location/costs.ts, src/lib/location/costs.test.ts, src/lib/location/hours.ts, src/lib/location/hours.test.ts, src/lib/location/checklist.ts, src/lib/location/checklist.test.ts, src/lib/location/coords.ts, src/lib/location/coords.test.ts, src/lib/location/score.ts, src/lib/location/score.test.ts, supabase/migrations/20261122000000_location.sql, supabase/location.rls.test.ts
- Tests: src/lib/location/query.test.ts, src/lib/location/flags.test.ts, src/lib/location/watch.test.ts, src/lib/location/listings.test.ts, src/lib/location/costs.test.ts, src/lib/location/hours.test.ts, src/lib/location/checklist.test.ts, src/lib/location/coords.test.ts, src/lib/location/score.test.ts, supabase/location.rls.test.ts
- TDD: required — 합칠 때 모은 메모 `~/.claude/state/handoff/location-merge-notes.md` '맞출 것'. 시험을 먼저 고쳐 깨지는 것을 본 뒤: (1) `FLAG_LAW` → `{ violation: 'violation', barrier: 'bf' }`, 위험 신호 글·`src` 칸은 requirements '화면 글 기본값'(AC-7911.4), `barrier`는 후보 층 2층 이상 (2) 겹친 계산을 한 곳으로 — watch `distM` → `coords.ts`, listings·flags·costs ㎡↔평 → `area.ts` `m2ToPyeong`, flags 돈 → `money.ts`, flags 층 읽기 → `score.ts` `floorNumber`(내보냄), 거리 글자 `distText`를 `coords.ts`에 더함 (3) 파일마다 둔 타입을 `types/location.ts`로(`FlagInput`의 그날 값 부분·`GapRival`→`Rival`·`WatchCandidate`·`LicenseRow`·`WatchEvent`·`WatchStatus`·`ListingNumbers`·`ScoreFacts`) — 있던 이름은 바꾸지 않는다(같은 Phase 바깥 자료 TASK가 씀) (4) 점검 줄·`checks.how`·`LUNCH_NOTE`를 design.md 11절·'화면 글 기본값'으로 (5) 의료급여 자리: 종류 `'welfare'`(28개째, `checkQuery`)·`Snapshot.welfare`·`ScoreFacts.welfareRate`·`p-welfare` 줄(design.md 8절, 이 id만 방향 두 모양) (6) SQL: `score_rule` 처음 값 = `DEFAULT_SCORE_RULE` JSON(`score.test` 첫 시험과 글자까지 같음), `terms` ≤ 6,000바이트. 동작이 그대로인 옮김은 원래 시험이 그대로 통과한다
## TASK-12: 바깥 자료 — 카카오 로컬(주소·좌표·장소·학교·산업단지)
- REQ: REQ-7904 · AC-7904.1, AC-7904.2, AC-7904.3
- Files: src/app/api/ai/location/sources/kakao.ts, src/app/api/ai/location/sources/kakao.test.ts, fixtures/location/api/kakao/**
- Tests: src/app/api/ai/location/sources/kakao.test.ts
- TDD: required — `k-address`·`k-point`·`k-near`·`k-keyword`, 카카오 문서의 응답 예 모양에 지어낸 값. 45곳·3쪽 `capped`, 거리 정수, 빈 답 = 빈 목록. TASK-12~23 모두: `Adapter` 모양은 `types/location.ts` 그대로, 요청 주소·칸을 견주고, `src`가 `SOURCES`에 있는지 본다
## TASK-13: 바깥 자료 — 인구·세대
- REQ: REQ-7904 · AC-7904.1, AC-7904.2
- Files: src/app/api/ai/location/sources/people.ts, src/app/api/ai/location/sources/people.test.ts, fixtures/location/api/people/**
- Tests: src/app/api/ai/location/sources/people.test.ts
- TDD: required — `pop-age`(11칸, 동 40개씩)·`household`. 기준 날짜 = 그 연월 말일
## TASK-14: 바깥 자료 — 아파트 단지·입주 예정
- REQ: REQ-7904 · AC-7904.1, AC-7904.2, AC-7904.3
- Files: src/app/api/ai/location/sources/homes.ts, src/app/api/ai/location/sources/homes.test.ts, fixtures/location/api/homes/**
- Tests: src/app/api/ai/location/sources/homes.test.ts
- TDD: required — `apt-list`·`apt-info`·`presale`. 사용승인일 → 지은 해, 입주 예정 연월 모양, 좌표 없는 자료라 점을 돌려주지 않는다
## TASK-15: 바깥 자료 — 실거래(아파트·상업업무용)
- REQ: REQ-7904 · AC-7904.1, AC-7904.2, AC-7904.3
- Files: src/app/api/ai/location/sources/trades.ts, src/app/api/ai/location/sources/trades.test.ts, fixtures/location/api/trades/**
- Tests: src/app/api/ai/location/sources/trades.test.ts
- TDD: required — `apt-trade`·`biz-trade`. '만 원' 글자(쉼표 포함) → 정수, ㎡ 버림, 지번이 일부만 나오는 상업용 줄도 받고, 해제된 거래는 뺀다
## TASK-16: 바깥 자료 — 의원 목록·상세(장비·물리치료사)
- REQ: REQ-7904 · AC-7904.1, AC-7904.2, AC-7904.3
- Files: src/app/api/ai/location/sources/clinics.ts, src/app/api/ai/location/sources/clinics.test.ts, fixtures/location/api/clinics/**
- Tests: src/app/api/ai/location/sources/clinics.test.ts
- TDD: required — `hosp-list`(의원·한의원·큰 병원)·`hosp-detail`. 과목 코드는 한 곳 상수(확인할 것 1). 물리치료사 칸이 없거나 0이면 null, MRI·CT 없음은 false
## TASK-17: 바깥 자료 — 진료 시간
- REQ: REQ-7904 · AC-7904.1, AC-7904.2
- Files: src/app/api/ai/location/sources/clinicHours.ts, src/app/api/ai/location/sources/clinicHours.test.ts, fixtures/location/api/clinicHours/**
- Tests: src/app/api/ai/location/sources/clinicHours.test.ts
- TDD: required — `hosp-hours`. '0900' 글자 → 분, 빈 요일 null, 8칸(월~일 + 공휴일). 의원 맞추기 함수(이름 공백·'의원' 빼고 같음 + 50m 안)도 이 파일에
## TASK-18: 바깥 자료 — 비급여 진료비
- REQ: REQ-7904 · AC-7904.1, AC-7904.2
- Files: src/app/api/ai/location/sources/nonpay.ts, src/app/api/ai/location/sources/nonpay.test.ts, fixtures/location/api/nonpay/**
- Tests: src/app/api/ai/location/sources/nonpay.test.ts
- TDD: required — `nonpay`. 체외충격파 코드 한 곳 상수(확인할 것 2), 값 원 정수, 도수치료 줄이 없으면 그 사실을 돌려준다(화면 글은 design.md 4절)
## TASK-19: 바깥 자료 — 의원 개업·폐업(인허가)
- REQ: REQ-7904 · AC-7904.1, AC-7904.2, AC-7904.3, AC-7904.4
- Files: src/app/api/ai/location/sources/licenses.ts, src/app/api/ai/location/sources/licenses.test.ts, fixtures/location/api/licenses/**
- Tests: src/app/api/ai/location/sources/licenses.test.ts
- TDD: required — `clinic-license` open·close 기간(최대 3년, 30쪽). EPSG:5174 → `lib/location/coords.ts`. 좌표 없는 줄은 뺀다
## TASK-20: 바깥 자료 — 건축물대장(표제부·층별개요)
- REQ: REQ-7904 · AC-7904.1, AC-7904.2
- Files: src/app/api/ai/location/sources/buildings.ts, src/app/api/ai/location/sources/buildings.test.ts, fixtures/location/api/buildings/**
- Tests: src/app/api/ai/location/sources/buildings.test.ts
- TDD: required — `bld-title`·`bld-floor`. 요청 칸은 design.md 5절 코드 규칙, 층 이름(`지1`·`1`·`옥탑`) 차례, 승강기·주차 칸이 없으면 null(확인할 것 4). 위반 건축물 칸은 읽지 않는다
## TASK-21: 바깥 자료 — 가게(상가정보)
- REQ: REQ-7904 · AC-7904.1, AC-7904.2, AC-7904.3
- Files: src/app/api/ai/location/sources/stores.ts, src/app/api/ai/location/sources/stores.test.ts, fixtures/location/api/stores/**
- Tests: src/app/api/ai/location/sources/stores.test.ts
- TDD: required — `stores`(반경, 1,000개·10쪽). 층 칸이 빈 가게는 '층 모름', 업종 대·중분류, 헬스장·필라테스 업종은 따로 센다
## TASK-22: 바깥 자료 — 시설·사고(시장·경로당·체력단련장·교통사고 다발·학교)
- REQ: REQ-7904 · AC-7904.1, AC-7904.2, AC-7904.3, AC-7904.4
- Files: src/app/api/ai/location/sources/facilities.ts, src/app/api/ai/location/sources/facilities.test.ts, fixtures/location/api/facilities/**
- Tests: src/app/api/ai/location/sources/facilities.test.ts
- TDD: required — `market`·`senior`·`gym`(5174, 폐업 뺌)·`accident`(기준 연도)·`school`(15021148, 초·중·고). 표준데이터 API의 시군구 이름 거르기. 역·정류장은 부르지 않는다(좌표 파일, TASK-30)
## TASK-23: 바깥 자료 — 사람 흐름(승하차 인원)
- REQ: REQ-7904, REQ-7909 · AC-7904.1, AC-7904.2, AC-7909.6
- Files: src/app/api/ai/location/sources/flow.ts, src/app/api/ai/location/sources/flow.test.ts, fixtures/location/api/flow/**, src/lib/location/flow.ts, src/lib/location/flow.test.ts
- Tests: src/app/api/ai/location/sources/flow.test.ts, src/lib/location/flow.test.ts
- TDD: required — design.md 4절, 조사 4. `flow-volume`(15142066, 시도·시군구 번호·연월, 30쪽, 승차·하차·날 수)·`flow-bus`(15142032, 이름·ARS)·`flow-rail`(15142034, 역 이름·노선). `lib/location/flow.ts`(순수): ID → 이름 → 좌표(정류장은 ARS, 빈 곳은 이름+시군구 · 역은 이름+노선) → 범위 안 하루 평균(버림)·합·못 이은 수. 좌표 파일 모양은 design.md 5절(시험은 지어낸 견본을 이 시험 안에). 정류장 좌표 파일이 없는 시군구 → `outside`(`이 지역은 자료 없음`)
## TASK-50: 바깥 자료 — 의료급여·차상위(+출처 줄·없는 자료 줄·ADR-042 한 줄)
- REQ: REQ-7904, REQ-7906 · AC-7904.1, AC-7904.2, AC-7906.1
- Files: src/app/api/ai/location/sources/welfare.ts, src/app/api/ai/location/sources/welfare.test.ts, fixtures/location/api/welfare/**, src/lib/location/sources.ts, src/lib/location/sources.test.ts, docs/ADR.md
- Tests: src/app/api/ai/location/sources/welfare.test.ts, src/lib/location/sources.test.ts
- TDD: required — design.md 4절·조사 5. `welfare`(15062448, `api.odcloud.kr`, 공공데이터포털 열쇠, 판 주소는 상수 하나): 시군구 코드(없으면 시도+시군구 이름, 전라북도·전북특별자치도 둘 다, 일반구까지)로 한 줄을 골라 기초 의료급여·기초생활보장 합계·차상위 3종 합·기준 연월, 없는 시군구 = 빈 값, 미등록 열쇠 = `not-applied`. 가짜 응답은 지어낸 지역 이름. `SOURCES`에 `welfare` 한 줄(한국사회보장정보원·이용 제한 없음·해마다·시군구), `MISSING`에 열두째 줄. `LAW_BASIS` 쉬운 한 줄 아홉·`MISSING` 열둘의 글을 requirements '화면 글 기본값' 그대로 맞춘다(지금 글과 다른 곳은 시험을 먼저 고침). `docs/ADR.md` ADR-042에 design.md 16절의 `api.odcloud.kr` 한 줄. 종류 이름 `'welfare'`는 같은 Phase TASK-51이 타입에 더한다 — 이 파일은 `Adapter` 모양을 따르고 타입 검사(tsc)는 합친 뒤 본다
## Phase 3 — 저장 · 모으기 · 공용 화면 · 무게 판 · 지도 · 진짜 자료 파일 (8명 동시 · 겹침 없음: `lib/storage/location*`·`clients*` / `lib/location/{collect,snapshot}*` / `components/location/`의 폴더 하나씩 / `csp*`·`next.config.ts` / `public/location/`·`lib/location/data/`)
## TASK-24: 저장 함수·부르기
- REQ: REQ-7908, REQ-7913, REQ-7919 · AC-7908.2, AC-7913.4, AC-7919.4
- Files: src/lib/storage/location.ts, src/lib/storage/location.test.ts, src/components/location/clients.ts, src/components/location/clients.test.ts
- Tests: src/lib/storage/location.test.ts, src/components/location/clients.test.ts
- TDD: required — design.md 6·7절. 본보기 `lib/storage/contacts.ts`·`inventory.ts`(가짜 client, 보낸 표·칸 견줌, 오류에 Supabase 글 없음). 후보 저장 몸통에 카카오 자료 칸이 없다. 사진 올리기·지우기(경로 모양, 후보를 지우면 파일도). `score_rule` 읽기·저장·기본값으로 되돌리기(병원마다 한 줄 upsert). `clients.ts`: 같은 origin `POST`·`redirect: 'error'`·10초, 동 파일 `/location/dongs/<code5>.json`·좌표 파일 `/location/transit/{index,rail}.json`·`/location/transit/bus/<code5>.json`
## TASK-25: 모으기·그날 값
- REQ: REQ-7908 · AC-7908.2, AC-7908.3
- Files: src/lib/location/collect.ts, src/lib/location/collect.test.ts, src/lib/location/snapshot.ts, src/lib/location/snapshot.test.ts
- Tests: src/lib/location/collect.test.ts, src/lib/location/snapshot.test.ts
- TDD: required — design.md 6절. `collect(point, radius, deps)`는 부르는 함수·동 파일 읽기를 받는다(동시에 4개, 진행 수). 실패 종류는 `ok: false`, 카카오 답은 그날 값에 넣지 않는다. 가장 가까운 역·400m 안 정류장 수는 좌표 파일(경계 근처는 이웃 시군구도), 사람 흐름은 `flow-volume` → `flow-bus`·`flow-rail` → `lib/location/flow.ts`(같은 시군구·달은 한 번, 지난달 없으면 두 달 전까지). `fitSnapshot` 65,536바이트, `mergeSnapshot`의 `prev`. 점수 세부 값에 쓰는 학교·산업단지 고용(시군구)·30m 안 약국(상가정보)도 담는다. 의료급여 `welfare`는 후보 시군구 하나, 비율 인구는 그 판 연월 `pop-age`를 그 시군구 모든 행정동(동 경계 파일)에 40개씩 불러 더한다(못 받으면 `population: null`). 동네 훑기 값 `collectScan(시군구, deps)`도 여기(동마다 design.md 8절 '훑기 ○' 세부 값, 저장 안 함)
## TASK-26: 공용 화면 부품(숫자 칸·출처 줄·자료 없음 글)
- REQ: REQ-7906, REQ-7917 · AC-7906.2, AC-7917.2
- Files: src/components/location/common/**
- Tests: src/components/location/common/
- TDD: required — design.md 14·15절. `Fact`는 출처 id가 없으면 그리지 않는다, 출처 줄 `{기관} {자료} · 기준 {날짜}`와 '근거와 출처' 링크, `WhyLine` 여섯 글(지난 값, `outside` = `이 지역은 자료 없음`)
## TASK-27: 카카오 지도 부품·CSP·Referrer
- REQ: REQ-7916 · AC-7916.1, AC-7916.2
- Files: src/components/location/map/**, src/lib/csp.ts, src/lib/csp.test.ts, next.config.ts, src/location-headers.test.ts
- Tests: src/components/location/map/, src/lib/csp.test.ts, src/location-headers.test.ts
- TDD: required — design.md 13절. `buildCsp` 옛 결과(셋째 인자 없음)는 그대로. `headers()`를 불러 `/location`·`/location/x`는 카카오 origin + `strict-origin-when-cross-origin`, `/dashboard`는 옛 머리 그대로. SDK 한 번만·열쇠 비면 안 부름·실패 `E-LOC-MAP`·로드뷰 50m 없음 글(가짜 `window.kakao`)
## TASK-28: 근거와 출처 화면
- REQ: REQ-7906 · AC-7906.3
- Files: src/components/location/sources/**
- Tests: src/components/location/sources/
- TDD: required — `SOURCES`·`LAW_BASIS`·`DEFAULT_SCORE_RULE`(받은 지금 설정이 다르면 그 값도)·`MISSING`만 읽어 그린다(따로 적은 글 없음, 같은 Phase의 `common/`은 부르지 않음), 이용 조건 출처 문구, 출처 줄 id 닻(`#src-<id>`)
## TASK-29: 처음(후보 없음)·열쇠 없음 화면
- REQ: REQ-7917 · AC-7917.1
- Files: src/components/location/start/**
- Tests: src/components/location/start/
- TDD: required — design.md 15절 글. 열쇠 셋 줄(받는 자료)과 상태(`ok`·`missing`·`rejected`·`failed`)마다 글('화면 글 기본값'), **열쇠 입력 칸이 없음**, 영어 사이트·도구 이름 없음, 열쇠 없이 되는 것 세 가지 단추
## TASK-30: 진짜 자료 파일 — 동 경계·소득·정류장·역 좌표
- REQ: REQ-7918 · AC-7918.1, AC-7918.2, AC-7918.5
- Files: public/location/dongs/**, public/location/transit/**, src/lib/location/data/**
- Tests: src/lib/location/data/
- TDD: required — design.md 5절. 시험(`data.test.ts`)이 먼저 모양·시군구 수·동 넓이 > 0·못 이은 동 수·소득·산업단지 고용 시군구 코드 5자리·정류장 파일 시군구 목록·정류장/역 점 범위(33~39·124~132)를 본다. 원본(SGIS 경계 15129688·국세청 TASIS 4-2-15·산업단지현황통계 15085886(단지 소재지를 시군구로 묶어 고용 인원 합)·버스정류장 위치 CSV 15067528·도시철도역사 XLSX 15013205)은 저장소 밖에서 받아 저장소 밖 스크립트로 줄인다(스크립트·원본은 넣지 않음). 정류장은 동 경계로 시군구를 나눈다. 받기가 로그인에 막히면 사용자에게 파일을 부탁한다. 전체 40MB 안, 파일 하나 2MB 안
## TASK-49: 점수 무게 판(바깥 무게·항목마다 [세부 ▾]·기준 칸·나이대·[기본값으로])
- REQ: REQ-7919, REQ-7907 · AC-7919.1, AC-7919.4, AC-7919.6, AC-7907.2
- Files: src/components/location/weights/**
- Tests: src/components/location/weights/
- TDD: required — 시안 `?s=weights`(승인 2) 자리 + design.md 8절 처음 값(설정은 props, 바뀐 설정·저장은 콜백). 막대 0~50·5씩, 많을수록 좋음은 칸 하나·적을수록 좋음은 칸 둘·고르는 값은 글만, `p-welfare` 방향 고르기, `후보에서만` 표시, 0·빈칸·100점 값 ≥ 0점 값·나이대 0개면 저장 콜백을 부르지 않고 안내 글, [기본 무게로]는 바깥 무게만·항목 [기본값으로]는 그 항목만(`DEFAULT_SCORE_RULE`에서). 글은 '화면 글 기본값'
## Phase 4 — 화면 묶음 열둘 (12명 동시 · 겹침 없음: `components/location/`의 폴더 하나씩)
## TASK-31: 동네 훑기 화면
- REQ: REQ-7907, REQ-7919 · AC-7907.1, AC-7907.2, AC-7907.3, AC-7907.4, AC-7919.3
- Files: src/components/location/scan/**
- Tests: src/components/location/scan/
- TDD: required — 동 점수는 `score.ts`(세 항목, 받은 설정 그대로). 무게 판은 `weights/` 부품(TASK-49)을 끼운다. 설정을 바꿔도 부르기 콜백이 다시 불리지 않고 색·순위가 바로 바뀜, 몇 항목으로 매겼는지, 못 이은 동 글, [여기에 후보 더하기]·[네이버 부동산에서 매물 보기]
## TASK-32: 후보 자세히 — 틀(위험 신호·종합 점수·살필 범위·목차·다시 받기)
- REQ: REQ-7909, REQ-7911, REQ-7908 · AC-7909.1, AC-7911.3, AC-7908.3, AC-7908.4
- Files: src/components/location/detail/frame/**
- Tests: src/components/location/detail/frame/
- TDD: required — 묶음 열둘은 칸(slot)으로 받아 차례대로 놓기만 한다(묶음 부품을 부르지 않음). 위험 신호 맨 위, 범위 일곱 값, [오늘 값으로 다시 받기]·기준 날짜, 목차 건너뛰기
## TASK-33: 후보 자세히 — 사는 사람·소득·앞으로 바뀔 것
- REQ: REQ-7909 · AC-7909.2, AC-7909.7
- Files: src/components/location/detail/people/**
- Tests: src/components/location/detail/people/
- TDD: required — 나이대 넷·60세 이상 비율·세대 수·4년 추세·아파트·홍보할 차례(가까움·세대·지은 해)·입주 예정, 소득은 `동 단위 자료가 없어요`, 의료급여·차상위 세 줄·비율·머리 글(AC-7909.7), 동 기준(행정동·법정동) 아래 글
## TASK-34: 후보 자세히 — 정형외과 수요·교통·사람 흐름·둘레 시설
- REQ: REQ-7909, REQ-7908 · AC-7909.1, AC-7909.6, AC-7908.4
- Files: src/components/location/detail/demand/**
- Tests: src/components/location/detail/demand/
- TDD: required — 고른 나이대 인구·밀도(하루 환자 수 어림 없음)·경로당·체력단련장·교통사고 다발·산업단지(이름·위치, 고용 인원은 시군구 합)·학교(공공), 역(출구 없음)·정류장·사람 흐름(역·정류장마다 하루 평균 승하차, `교통카드 찍은 사람 수예요(걷는 사람 수와 달라요)`, 자료 없는 지역 `이 지역은 자료 없음`)·시장, 약국·마트·큰 병원(카카오, 볼 때만 — 저장 콜백에 넘기지 않음), `capped` 글
## TASK-35: 후보 자세히 — 경쟁 의원·진료비·진료 시간 빈틈
- REQ: REQ-7909 · AC-7909.3
- Files: src/components/location/detail/rivals/**
- Tests: src/components/location/detail/rivals/
- TDD: required — 과목 셋 + 한의원 따로, 물리치료사 `자료 없음`, 같은 건물, 3년 개폐업, 체외충격파 최저·최고·평균 vs 지금 의원 값(적기 콜백), 도수치료 글, 빈틈 표·점심 쉼 모름 글
## TASK-36: 후보 자세히 — 거리 사진·건물 서류·빈 칸 짐작·땅 쓰임
- REQ: REQ-7909 · AC-7909.4, AC-7909.5
- Files: src/components/location/detail/site/**
- Tests: src/components/location/detail/site/
- TDD: required — 로드뷰·하늘 사진(`map/` 부품), 간판 보임 셋, 표제·층별, 층마다 가게 수·가게 없는 층(상가정보만, 공실률 없음), 토지이음·등기소 링크, 위반 건축물 안내·고르는 칸
## TASK-37: 매물 화면
- REQ: REQ-7910 · AC-7910.1, AC-7910.2, AC-7910.3, AC-7910.4
- Files: src/components/location/listings/**
- Tests: src/components/location/listings/
- TDD: required — 네이버 새 창 링크, 붙여 넣기 칸(https만·평/㎡·금액 정수), 평수 거르기, 2개 미만 안내·2개 이상 견주기 글(`listings.ts`), 협상표 여섯, [주소록에 넣기] 콜백 몸통(분류 `other`·하는 일 `부동산 중개`)
## TASK-38: 후보 더하기 판
- REQ: REQ-7908 · AC-7908.1
- Files: src/components/location/add/**
- Tests: src/components/location/add/
- TDD: required — 세 길(주소로 찾기 결과 고르기·지도 찍기·매물 고르기), 이름 1~40자, 범위 일곱 값(기본 1,000m), 저장 콜백 몸통에 카카오 주소 글이 없음(적은 주소 글만)
## TASK-39: 후보 견주기 화면
- REQ: REQ-7914 · AC-7914.1
- Files: src/components/location/compare/**
- Tests: src/components/location/compare/
- TDD: required — 2~4곳 고르기, 항목 점수·종합·평당 월세·위험 신호 수·진행 상태, 무게는 받은 값 그대로, 진행 단계 바꾸기·내려놓기 콜백
## TASK-40: 한 장 보고서
- REQ: REQ-7914 · AC-7914.2
- Files: src/components/location/report/**
- Tests: src/components/location/report/
- TDD: required — A4 한 장(요약·점수·위험·비용·출처 기준 날짜, 예상 환자 줄 없음), [인쇄]·[PDF로 저장]은 `window.print()`만(새 패키지·fetch 없음), 앱 틀을 숨기는 `print:` 클래스
## TASK-41: 개원 준비 — 비용·손익분기·일정
- REQ: REQ-7913 · AC-7913.1, AC-7913.2
- Files: src/components/location/prep/plan/**
- Tests: src/components/location/prep/plan/
- TDD: required — 비용 칸 모두 빈칸으로 열림(기본 숫자 없음)·정수만·빈칸 수·직원 인건비는 직접 적는 빈칸(월급 안내 없음)·매물 값은 참고 글로만, 손익분기는 비용과 직접 적는 '환자 1명당 평균 수입'만으로·`원장 몫` 글(예상 환자 칸·견주는 글 없음), 일정표·다 함 표시
## TASK-42: 개원 준비 — 건물 요건·계약 전 위험·점검표·사진·메모·진행 상태
- REQ: REQ-7913 · AC-7913.3, AC-7913.4, AC-7913.5
- Files: src/components/location/prep/visit/**
- Tests: src/components/location/prep/visit/
- TDD: required — 건물 요건 ○·✕·?·`어떻게 알았나` 40자, 계약서·보러 갈 때는 체크 칸, 임대 조건 메모 300자(`terms.memo`), 법 근거 링크, 등기부 안내·등기소 링크, 사진 올리기(30장 넘으면 `E-LOC-PHOTO`, `shrinkPhoto` 흉내)·지우기, 날짜별 메모, 진행 상태 다섯
## Phase 5 — 잇기 · 알림 · 진짜 열쇠 (5명 동시 · 겹침 없음: 셸·문지기 / 화면 맨 위 파일·페이지·`titles.test` / `registry*` / 대시보드 / `sources/**`·`fixtures/location/api/**`·`lib/location/{flow,links}*`)
## TASK-43: 탭 열기·관리자 문지기
- REQ: REQ-7901 · AC-7901.1, AC-7901.2
- Files: src/components/shell/menu.ts, src/components/shell/MoreMenu.tsx, src/components/shell/TabBar.tsx, src/components/shell/AppShell.tsx, src/components/shell/shell.test.tsx, src/lib/auth/gate.ts, src/lib/auth/gate.test.ts, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/shell/shell.test.tsx, src/lib/auth/gate.test.ts, src/app/(app)/tabFrame.test.tsx
- TDD: required — design.md 14절. `MENU`·기능 목차·준비 중 수는 그대로, `LOCATION_TAB`은 관리자에게만 '주소록' 다음, `더보기 · 입지 분석`, 데스크는 늘 없음. 문지기: 관리자 아닌 원장 `/dashboard`·데스크 `/sunap`·로그인 안 함 `/login`
## TASK-44: 화면 잇기 — 입지 분석 화면·페이지
- REQ: REQ-7901, REQ-7908, REQ-7917, REQ-7919 · AC-7901.3, AC-7901.4, AC-7908.1, AC-7908.2, AC-7908.3, AC-7908.4, AC-7917.1, AC-7919.3, AC-7919.4
- Files: src/components/location/LocationScreen.tsx, src/components/location/LocationScreen.test.tsx, src/components/location/useLocation.ts, src/components/location/useLocation.test.ts, src/app/(app)/location/**, src/app/titles.test.tsx
- Tests: src/components/location/LocationScreen.test.tsx, src/components/location/useLocation.test.ts, src/app/(app)/location/, src/app/titles.test.tsx
- TDD: required — Phase 3·4 부품을 고치지 않고 잇기만. `guardPage('/location')`·탭 이름(`titles.test`는 `'/location'` 글자로 더하고 같은 Phase의 `LOCATION_TAB`을 부르지 않음), `?c=&tab=`, 열 때 표 여섯·`keys` 한 번(지금 의원 환자 숫자는 읽지 않음 — `readDays`를 부르지 않음), 저장·다시 받기, 후보 저장 몸통에 카카오 자료 없음, 후보를 열면 알림 `seen_at`, `E-LOC-READ-FAILED`, 열쇠 없음 화면, 설정을 바꾸면 다시 부르지 않고 훑기·후보 점수·견주기·보고서가 바로 바뀌고 `score_rule`에 저장, 두 칸 틀 최소 폭 1,024px
## TASK-45: 종류 잇기(registry)
- REQ: REQ-7903, REQ-7904 · AC-7903.2, AC-7904.1
- Files: src/app/api/ai/location/registry.ts, src/app/api/ai/location/registry.test.ts
- Tests: src/app/api/ai/location/registry.test.ts
- TDD: required — 열세 묶음을 이어 종류 28개(의료급여 `welfare` 포함)가 빠짐없이 하나씩, 열쇠 종류가 design.md 4절과 같음을 본다
## TASK-46: 대시보드 새 경쟁 의원 알림
- REQ: REQ-7915 · AC-7915.1, AC-7915.2, AC-7915.3
- Files: src/components/dashboard/location/**, src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/location/, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required — design.md 12절, 본보기 `components/dashboard/warranty/`(자리 넷·한 번만·실패 조용히). 관리자 아니면 부르지 않음, 같은 줄 한 번, 셋 + `… {n}건 더`, [닫기]는 보이던 줄의 `seen_at`을 채움(다음 새 줄은 다시 뜸), 링크 `/location?c=…&tab=detail`, 20초, 다른 숫자가 기다리지 않음. `tabFrame.test.tsx` AC-301.3 정규식 때문에 점 붙은 `location.` 글자를 쓰지 않는다. `components/dashboard/imports.test.ts` 울타리를 지킨다
## TASK-47: 진짜 열쇠 잇기 — 응답 모양·코드·링크·CSP origin 확인
- REQ: REQ-7918, REQ-7904 · AC-7918.3, AC-7918.4, AC-7904.1
- Files: src/app/api/ai/location/sources/**, fixtures/location/api/**, src/lib/location/flow.ts, src/lib/location/flow.test.ts, src/lib/location/links.ts, src/lib/location/links.test.ts
- Tests: src/app/api/ai/location/sources/, src/lib/location/flow.test.ts, src/lib/location/links.test.ts
- TDD: required — 사용자가 `.env.local`에 열쇠를 넣은 뒤. 종류마다 한 번씩 불러 답을 저장소 밖에 받고, 이름·주소를 지어낸 값으로 바꿔 잘라 가짜 응답을 고친다(시험이 먼저 깨짐) → 읽는 코드를 고친다. 확인할 것 1~6·9를 design.md에 적는다. 네이버 링크 둘을 사용자에게 눌러 보게 해 하나로. 지도·하늘 사진·로드뷰를 띄워 CSP 위반 기록을 모아 TASK-48에 넘긴다. 열쇠는 대화·로그·파일·가짜 응답에 남기지 않는다
## Phase 6 — 덧붙임 바탕: 공용 모양·과목 목록·돈 글자·옛 구 묶음 (2명 동시 · 겹침 없음: `types/location.ts`·`lib/location/{query,depts}*` / `lib/location/{money,regions}*`)
> 덧붙임(2026-11-22 명세 고침 — 시안 승인 3 · TASK-47 진짜 열쇠 결과 `~/.claude/state/handoff/location-t47-report.md` · 합칠 때 모은 어긋남 `~/.claude/state/handoff/location-merge-notes.md` · TASK-44 보고). Phase 6~9가 Phase 1~5와 같은 규칙(같은 Phase는 동시·Files 안 겹침·서로 부르지 않음, 시험 먼저)이고 검토는 Phase 10 TASK-48 한 번. 모양을 바꾸는 Phase 6 뒤 Phase 7·8 사이에는 그 칸을 쓰는 다른 파일의 tsc 오류가 남을 수 있다 — 합칠 때는 그 Phase 시험만 보고, tsc는 Phase 9 TASK-79 끝에 location 쪽 0이어야 한다. 화면 TASK(66~78)는 승인 3 시안(`?s=method`·`kinds`·`empty`·`candidate`·`scan`·`report`·`weights`) 자리 그대로, 글은 requirements '화면 글 기본값'이 먼저(점수 숫자는 design.md 8절), 폰 전용 모양·폰 폭 사진 없음, 화면 글에 영어 낱말 없음.
## TASK-52: 공용 모양·몸통 검사·과목 목록(대표 과목)
- REQ: REQ-7921, REQ-7922, REQ-7908 · AC-7921.4, AC-7922.1, AC-7922.4, AC-7908.2
- Files: src/types/location.ts, src/lib/location/query.ts, src/lib/location/query.test.ts, src/lib/location/depts.ts, src/lib/location/depts.test.ts
- Tests: src/lib/location/query.test.ts, src/lib/location/depts.test.ts
- TDD: required — design.md 4·6·18절. (1) `types/location.ts`: `DeptId`(18절 id 스물하나)·`DeptRule`·`Rival` 새 모양(`kind` 지우고 `depts`·`at`·`address`·`detail?`{therapists·mri·ct·week·priced·eswt·manual})·`Snapshot.place`·`Snapshot.sggAvg`(`SggAvg`)·`station.v.at`·`welfare.v.basis`·`LocationSettings.deptRule`·`WatchCandidate`에 `name`·`ScoreFacts.clinicsNear`·`Adapter.timeoutMs?`·`HospGroup`에 `'dental'`. 다른 파일이 쓰는 이름(`Rival`·`Snapshot`·`ScoreFacts`·`FlagFacts`·`RivalKind`는 `DeptId`의 별칭으로 남김)은 지우지 않는다 (2) `checkQuery` 몸통(AC-7922.1): `flow-volume` `part` 0~11 정수(빼면 0) · `flow-bus`·`flow-rail` `ym`(`YYYY-MM`, 2022-10~) · `hosp-hours` `sidoName`·`sggName`(1~20자) · `welfare` `sidoNames`(1~2)·`sggNames`(1~4, 각 1~20자) · `clinic-license` 선택 `addr`(2~40자, 한글·공백만) · `gym` 선택 `sidoName` · `hosp-list` `group: 'clinic'`이면 `depts`(18절 의원 과목 id 1~19, 되풀이 없음, `dental`·`korean` 안 됨), `'dental'` 더함. 종류는 28개 그대로 (3) `depts.ts`: `DEPTS`(18절 표 차례·코드·이름 낱말)·`DEFAULT_DEPT_RULE`·`checkDeptRule`·`fillDeptRule`·`deptRole`·`deptOf`·`deptOfText`·`rivalShortText` — 이름 낱말은 긴 것 먼저(`신경외과` 이름이 `외과`로 잡히지 않음), 안 보기는 어디에도 안 셈, 경쟁 0개, 인허가 업태 `치과`·`한의` 가름. 순수(`source.test.ts`)
## TASK-53: 만 원 금액 글·옛 구 묶음
- REQ: REQ-7905, REQ-7922 · AC-7905.7, AC-7922.3
- Files: src/lib/location/money.ts, src/lib/location/money.test.ts, src/lib/location/regions.ts, src/lib/location/regions.test.ts
- Tests: src/lib/location/money.test.ts, src/lib/location/regions.test.ts
- TDD: required — design.md 5절. `manText(won)`: `78만 원`·`1억 원`·`1억 5,000만 원`·0 `없음`·null `–`·만 원으로 안 나눠지면 `wonText`, 소수·음수 처리는 `wonText`와 같음. `wonText`는 그대로(AC-7905.5 시험이 그대로 통과). `regions.ts`: `OLD_SGG_GROUPS`(5절 표 셋)·`oldGroupOf(code5)` → `{ label: '옛 중구·동구', names: {sido, sgg}[], sggs: code5[] } | null` · `sidoNamesOf(name)`(전남광주통합특별시 → 광주광역시·전라남도, 전북특별자치도 ↔ 전라북도). 있던 함수 이름·모양은 바꾸지 않는다
## Phase 7 — 덧붙임 계산·읽는 곳·저장·글 (12명 동시 · 겹침 없음: 서버 공통 / `sources/{clinics,nonpay,clinicHours,kakao}*` / `sources/welfare*` / `sources/{facilities,people}*` / `lib/location/{collect,snapshot}*` / `lib/location/{facts,explain}*` / `lib/location/score*`·SQL·문서 / `lib/location/{flags,hours,watch,links}*` / `lib/storage/location*`·`clients*` / `lib/location/sources*`·errors / `lib/location/method*` / `components/location/common/`)
## TASK-54: 서버 공통 — 미등록 403·종류마다 시간 한도·경로 한도·열쇠 확인
- REQ: REQ-7903, REQ-7922 · AC-7903.3, AC-7903.4, AC-7903.5, AC-7922.2
- Files: src/app/api/ai/location/fetchSource.ts, src/app/api/ai/location/fetchSource.test.ts, src/app/api/ai/location/query/route.ts, src/app/api/ai/location/query/route.test.ts, src/app/api/ai/location/keys/route.ts, src/app/api/ai/location/keys/route.test.ts, src/app/api/ai/location/registry.test.ts
- Tests: src/app/api/ai/location/fetchSource.test.ts, src/app/api/ai/location/query/route.test.ts, src/app/api/ai/location/keys/route.test.ts
- TDD: required — design.md 3절. 공공 열쇠의 401·403 + `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 몸통 → `fail: 'not-applied'`(몸통 아니면 `http`, 카카오 열쇠는 늘 `http`, 2MB·시간 한도는 몸통 읽기에도), 경로는 `not-applied`를 먼저 돌려줌. `fetchSource(req, key, timeoutMs?)` — 기본 8초, 읽는 곳의 `timeoutMs`(최대 60,000). `query` `maxDuration = 120`(시험: export 이름 셋 그대로). `keys`의 공공 확인은 `pop-age` `1111051500`·`2025-10`. 열쇠·바깥 오류 글이 답·로그에 없음은 그대로 덧붙임: `registry.test.ts`는 TASK-52 새 몸통에 맞게 견본 몸통 다섯 줄만 고친다(flow-bus·flow-rail `ym`, hosp-list `depts`, hosp-hours 이름, welfare 이름).
## TASK-55: 의원·진료 시간·비급여·약국 읽는 곳(과목 열아홉·치과·느린 비급여·약국 도로명)
- REQ: REQ-7904, REQ-7921, REQ-7922, REQ-7918 · AC-7904.1, AC-7904.2, AC-7904.3, AC-7921.6, AC-7922.2, AC-7918.3
- Files: src/app/api/ai/location/sources/clinics.ts, src/app/api/ai/location/sources/clinics.test.ts, src/app/api/ai/location/sources/nonpay.ts, src/app/api/ai/location/sources/nonpay.test.ts, src/app/api/ai/location/sources/clinicHours.ts, src/app/api/ai/location/sources/clinicHours.test.ts, src/app/api/ai/location/sources/kakao.ts, src/app/api/ai/location/sources/kakao.test.ts, fixtures/location/api/clinics/**, fixtures/location/api/nonpay/**, fixtures/location/api/clinicHours/**, fixtures/location/api/kakao/**
- Tests: src/app/api/ai/location/sources/clinics.test.ts, src/app/api/ai/location/sources/nonpay.test.ts, src/app/api/ai/location/sources/clinicHours.test.ts, src/app/api/ai/location/sources/kakao.test.ts
- TDD: required — design.md 4·17·18절. `hosp-list`: `clinic` + `depts`는 과목마다 목록 하나(코드는 `DEPTS`의 값, 이 파일의 `DEPT_CODE`는 지우고 `depts.ts`를 부름 — server-only 파일이 lib을 부르는 것은 된다), 같은 기관 기호는 한 줄로 합쳐 `depts`(찾은 과목, `DEPTS` 차례)에 모음, `dental` = 종별 51, `korean`·`big` 그대로, 점은 심평원 `XPos`·`YPos`. `nonpay`: `numOfRows` 300·`timeoutMs` 60,000, 체외충격파 `SZ084`, 도수치료 줄 그대로. `clinicHours`: 몸통 이름 둘로 목록 조회, 치과의원 기관 구분·과목 거르기는 확인할 것 11(되면 쓰고 design.md 17절에 적음, 안 되면 그대로). `k-near` 장소에 `road`(도로명 주소 글, 없으면 null — 볼 때 같은 건물 견주기에만, 저장 안 함). TASK-47처럼 진짜 열쇠로 종류마다 한 번 불러(열쇠는 기능 폴더 `.env.local`, 대화·로그·파일·가짜 응답에 남기지 않음) 과목 코드 열아홉·치과 51(확인할 것 10)을 확인한다 — 안 맞는 코드는 `depts.ts`가 아니라 보고에 적어 Phase 8 전에 명세(design.md 18절 표 '확인' 칸)와 함께 고치고(이 TASK Files 밖), 확인 못 한 코드는 '확인 전'으로 둔다
## TASK-56: 의료급여 읽는 곳 — 옛 구 묶음·전남광주
- REQ: REQ-7904, REQ-7922 · AC-7904.1, AC-7904.2, AC-7922.3
- Files: src/app/api/ai/location/sources/welfare.ts, src/app/api/ai/location/sources/welfare.test.ts, fixtures/location/api/welfare/**
- Tests: src/app/api/ai/location/sources/welfare.test.ts
- TDD: required — design.md 4·5절. 몸통 `sidoNames`·`sggNames`(옛 구 묶음이면 이름 여럿)로 판의 줄을 찾아 기초 의료급여·기초생활보장 합계·차상위 3종을 **더하고**, 하나라도 못 찾으면 빈 값(실패 아님). 시도 이름은 `regions.ts` `sidoNamesOf`(전남광주 → 옛 둘, 전북 둘). 옛 몸통(`sidoName`·`sggName` 하나)도 받는다. 가짜 응답은 지어낸 지역 이름 + 옛 구 묶음 견본
## TASK-57: 활용신청 다섯 진짜 답 확인 — 시장·경로당·학교·교통사고 다발·세대 수
- REQ: REQ-7918, REQ-7904 · AC-7918.3, AC-7904.1, AC-7904.2
- Files: src/app/api/ai/location/sources/facilities.ts, src/app/api/ai/location/sources/facilities.test.ts, src/app/api/ai/location/sources/people.ts, src/app/api/ai/location/sources/people.test.ts, fixtures/location/api/facilities/**, fixtures/location/api/people/**
- Tests: src/app/api/ai/location/sources/facilities.test.ts, src/app/api/ai/location/sources/people.test.ts
- TDD: required — TASK-47과 같은 방법(사용자가 2026-11-22 활용신청을 마침: 전통시장 15012894 · 마을회관·경로당 15114136 · 초중등학교위치 15021148 · 교통사고다발지역 15029185 · 행정동별 인구·세대 **15108065**). 열쇠는 기능 폴더 `.env.local`에서 읽고 대화·로그·파일·가짜 응답에 남기지 않는다. 종류마다 한 번 불러 답을 저장소 밖(scratchpad)에 받고 → 이름·주소를 지어낸 값으로 바꿔 잘라 가짜 응답을 고친다(시험이 먼저 깨짐) → 읽는 코드를 고친다(주소·칸 이름·결과 코드·쪽 나뉨·기준 날짜). **활용신청 뒤 열쇠가 먹기까지 한두 시간 걸릴 수 있다 — 아직 미등록 답(403)이면 그 종류만 '확인 전'으로 남기고(가짜 응답·코드 그대로) 나머지는 마친다.** 종류마다 결과(확인됨·확인 전·바꾼 칸)는 보고에 적고, 합치는 쪽이 design.md 17절에 옮긴다(design.md는 이 TASK Files 밖)
## TASK-58: 모으기·그날 값 — 진짜 열쇠 몸통·과목 고르기·좌표·행정동·견줄 값·느린 비급여
- REQ: REQ-7908, REQ-7921, REQ-7922, REQ-7909 · AC-7908.2, AC-7908.3, AC-7921.5, AC-7922.1, AC-7922.2, AC-7922.3, AC-7922.4, AC-7909.7
- Files: src/lib/location/collect.ts, src/lib/location/collect.test.ts, src/lib/location/snapshot.ts, src/lib/location/snapshot.test.ts
- Tests: src/lib/location/collect.test.ts, src/lib/location/snapshot.test.ts
- TDD: required — design.md 4·5·6·18·19절, TASK-47 보고의 '바꿀 것 1~7'. `collect(point, radius, deps)`의 `deps`에 지금 `deptRule`(없으면 처음 값). (1) `ESWT_ITEM = 'SZ084'` (2) 승하차 `part` 이어 받기·`flow-bus`·`flow-rail`에 `ym` (3) `hosp-hours`는 범위가 닿는 시군구(4곳까지)마다 동 경계 목록 이름으로 (4) 의료급여는 `oldGroupOf`·`sidoNamesOf`로 몸통을 만들고 `basis`·비율 인구(묶음 새 시군구 행정동 모두) (5) `clinic-license`에 `addr`(`'{시도} {시군구}'`, 범위가 닿는 시군구마다) (6) `gym`에 `sidoName` (7) 의원: 안 보기가 아닌 과목 모두(`clinic`+`depts`·`dental`·`korean`), 그때 경쟁 과목 의원만 상세·진료 시간·비급여(가까운 20곳, 의원마다 따로, 실패는 그 의원 `priced: false`만), 도수치료 여럿이면 가장 낮은 값, 가까운 차례 200곳(경쟁 과목 의원은 다 남김), 30m 안 의원만 `address` (8) `place`(후보 점 `dongOf` + 목록 이름) · `sggAvg`(19절, 의료급여 인구와 같은 `pop-age` 부름을 나눠 씀) · `station.v.at` (9) 그날 값의 좌표가 모두 심평원 답·좌표 파일 값이고 카카오 답 값이 아님(시험) (10) `snapshot.ts`: `checkSnapshot`이 새 칸을 봄, `fitSnapshot`은 `detail` 없는 먼 의원부터 줄임(가장 큰 그날 값도 65,536바이트 안), `snapshotFacts`와 그 시험을 지움(`facts.ts`가 하나로 셈, TASK-59), `welfareRate` 이름·모양 그대로. `collectScan`도 같은 몸통·과목 규칙(훑기 경쟁 수는 경쟁 과목만)
## TASK-59: 점수 입력 셈 한 곳·점수 풀이
- REQ: REQ-7911, REQ-7920, REQ-7921 · AC-7911.1, AC-7920.3, AC-7920.4, AC-7921.2, AC-7921.7
- Files: src/lib/location/facts.ts, src/lib/location/facts.test.ts, src/lib/location/explain.ts, src/lib/location/explain.test.ts
- Tests: src/lib/location/facts.test.ts, src/lib/location/explain.test.ts
- TDD: required — design.md 2·6·8·18·19절. `facts.ts`: `components/location/detail/frame/facts.ts`의 셈(`scoreFactsOf`·`flagInputOf`·`candidateListing`·`shownValue`·`shownAsOf`·`sourceAsOf`·`rivalCount`)을 옮기되 설정(`deptRule`)을 받아 경쟁 = 대표 과목이 경쟁인 의원(`deptOf`), 빈틈·진료비는 그중 `detail`이 있는 의원, `clinicsNear` = 30m 안 의원(안 보기 뺌), 경쟁 0개면 경쟁 칸 모두 null, 의료급여 비율은 `snapshot.ts` `welfareRate`를 부름(따로 셈 없음). 화면이 맞춘 셈(새 의원 `> 올해 − 3`, 경쟁 0곳이면 빈틈 = 모든 칸) 그대로 — 옛 frame 시험의 기댓값을 옮겨 같은 값을 본다. `explain.ts`: `explainCandidate`·`explainScan`(19절 셈·몫·50점 나눔·셋·`1점 아래`·무게 0 뺌·견줄 값은 `sggAvg`·저장한 매물 평균), 값 글·만점 기준 글·견줄 값 글은 requirements '화면 글 기본값' 점수 풀이 표(거리 `distText`, 만 원 `manText`, 원 `wonText`). 화면 부품은 아직 옛 `frame/facts.ts`를 부른다 — 그 파일은 Phase 8 TASK-68이 이 파일을 다시 내보내게 바꾼다. `hours.ts`의 `gapTable`은 지금 모양으로 부른다(같은 Phase TASK-61이 이름·인자 차례를 바꾸지 않음)
## TASK-60: 점수 세부 항목 `s-clinics`·항목 이름·SQL `dept_rule`·문서
- REQ: REQ-7919, REQ-7921, REQ-7902 · AC-7919.1, AC-7919.5, AC-7921.3, AC-7921.7, AC-7902.1, AC-7902.2
- Files: src/lib/location/score.ts, src/lib/location/score.test.ts, supabase/migrations/20261122000000_location.sql, supabase/location.rls.test.ts, docs/ADR.md, CLAUDE.md
- Tests: src/lib/location/score.test.ts, supabase/location.rls.test.ts
- TDD: required — design.md 7·8·16·18절. `score.ts`: 자리 맨 아래 `s-clinics`(많을수록 · 3곳 · 무게 0, `clinicsNear`), 세부 항목 `label`은 requirements '화면 글 기본값' 이름 그대로(설명은 `why`로), 경쟁 세부 항목 글의 과목은 '경쟁 의원'. `DEFAULT_SCORE_RULE` JSON이 바뀌므로 SQL `score_rule` 처음 값을 글자까지 맞춘다(score.test 첫 시험 JSON = SQL). SQL: `location_settings.dept_rule` jsonb not null 기본 `DEFAULT_DEPT_RULE` JSON(`depts.ts`와 글자까지 같음 — 시험이 견줌)·검사 함수 `location_dept_rule_ok`(SQL의 id 스물하나 = `DEPTS` id, 시험이 견줌)·≤ 1,000바이트·두 번 실행해도 됨(`add column if not exists`)·insert·update 칸 권한에 `dept_rule`. RLS 시험: 관리자만 읽고 씀, AC-7921.3 거부 23514, 처음 값·`rival: []` 받음. **실제 Supabase에 붙여 넣지 않는다**(사용자가 함). `docs/ADR.md` ADR-042(비급여 60초·경로 120초)·ADR-044(공공 좌표·행정동 이름 저장)와 `CLAUDE.md` 예외(ADR-042~044) 줄을 design.md 16절 글로 맞춘다
## TASK-61: 위험 신호·진료 시간 빈틈·새 경쟁 의원 알림·네이버 링크 — 과목 고르기 따르기
- REQ: REQ-7911, REQ-7915, REQ-7921, REQ-7918, REQ-7909 · AC-7911.3, AC-7911.4, AC-7915.1, AC-7921.4, AC-7918.4, AC-7909.3
- Files: src/lib/location/flags.ts, src/lib/location/flags.test.ts, src/lib/location/hours.ts, src/lib/location/hours.test.ts, src/lib/location/watch.ts, src/lib/location/watch.test.ts, src/lib/location/links.ts, src/lib/location/links.test.ts, src/app/api/ai/location/sources/licenses.test.ts
- Tests: src/lib/location/flags.test.ts, src/lib/location/hours.test.ts, src/lib/location/watch.test.ts, src/lib/location/links.test.ts
- TDD: required — design.md 9·11·12·13·18절. `flags.ts`: 입력에 `deptRule`, `same-building`·`many-rivals`는 대표 과목이 경쟁인 의원만, 글은 requirements '화면 글 기본값' 3·7(`{과목}` = 대표 과목 이름, `({짧은 이름})` = `rivalShortText`), 경쟁 0개면 둘 다 없음, `closed-here`는 과목과 상관없이. `hours.ts`: `gapTable(rivals: { week }[])`는 받은 의원을 다 센다(한의원 거르기는 부르는 쪽, 이름·인자 차례 그대로). `watch.ts`: `pickEvents(found, cand, rule)` — `deptOfText`로 대표 과목이 경쟁일 때만, `WATCH_DEPTS` 지움, 경쟁 0개면 빈 목록. `links.ts`: `NAVER_FORM = 'fin'`(사용자가 고름 2026-11-22), m 모양을 지우고 시험도 fin 하나로 덧붙임: `sources/licenses.test.ts` 188줄 근처 `WatchCandidate`에 `name`만 더한다.
## TASK-62: 저장·부르기 — 과목 고르기 저장·알림 후보 이름·종류마다 부르기 한도
- REQ: REQ-7921, REQ-7915, REQ-7908, REQ-7922 · AC-7921.2, AC-7915.2, AC-7908.2, AC-7922.2
- Files: src/lib/storage/location.ts, src/lib/storage/location.test.ts, src/components/location/clients.ts, src/components/location/clients.test.ts
- Tests: src/lib/storage/location.test.ts, src/components/location/clients.test.ts
- TDD: required — design.md 3·7·12·18절. `loadLocation`·설정 읽기에 `deptRule`(`fillDeptRule`), `saveDeptRule`·`resetDeptRule`(병원마다 한 줄 upsert, 칸 `dept_rule`만 보냄), `listWatchCandidates`가 `name`도 읽음(`WatchCandidate`), 알림 쪽에서 설정을 읽는 `readDeptRule`(못 읽으면 처음 값). 그날 값 저장 칸이 새 칸(`place`·`sggAvg`)을 담고 카카오 출처 칸은 여전히 안 담음. `clients.ts` `queryLocation` 한도: 기본 10초 · `hosp-list` 60초 · `nonpay` 70초
## TASK-63: 출처·오류 글 — 영어 낱말 빼기·세대 수 자료 번호·사진 오류 글
- REQ: REQ-7906, REQ-7917 · AC-7906.1, AC-7906.3, AC-7917.1, AC-7917.3
- Files: src/lib/location/sources.ts, src/lib/location/sources.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/location/sources.test.ts, src/lib/errors.test.ts
- TDD: required — 시험 먼저: `SOURCES`·`LAW_BASIS`·`MISSING`·`KEY_TEXT`·`SOURCE_GROUPS`의 화면에 보이는 글(이름·자료·받는 길·주기·단위·이용 조건·왜 보나·없을 때 글)에 허용 목록(AC-7917.1: SGIS·TASIS·KTX·MRI·CT·km·PDF·A4 + ㎡·km² 같은 단위) 밖 로마자가 없다. 바꿀 글 예: `API`→`자료`·`REST 열쇠`→`장소 찾기 열쇠`(카카오 열쇠 이름은 requirements 열쇠 상태 글 그대로)·`SDK`→`웹 지도`·`건축HUB 건축물대장정보 서비스`→`국토교통부 건축물대장정보 서비스`·`K-apt`→`공동주택관리정보시스템`·`PNU 19자리`→`필지 번호 19자리`·`robots.txt`→`사이트가 막아 둠`·`EPSG:5174`→`옛 좌표계`·`TAGO`→`국가대중교통정보센터`·`ARS 번호`→`정류장 번호`. `household` 줄 자료 번호 **15108065**(행정동별(통반단위) 주민등록 인구 및 세대현황), `nonpay` 줄에 체외충격파 `SZ084`·도수치료는 있을 때만, `hosp-list` 묶음 이름 `경쟁 의원·다른 과 의원`. `E-LOC-PHOTO` fix = design.md 15절 `사진 파일만, 후보마다 30장까지 올릴 수 있어요. 잠시 뒤 다시 올려 주세요.`
## TASK-64: 분석 방법 글 한 곳(처음 안내·이렇게 봤어요 열셋·보고서 둘째 장)
- REQ: REQ-7920 · AC-7920.1, AC-7920.2, AC-7920.5, AC-7920.6
- Files: src/lib/location/method.ts, src/lib/location/method.test.ts
- Tests: src/lib/location/method.test.ts
- TDD: required — design.md 19절, 글은 requirements '화면 글 기본값' 승인 3 그대로(시안 `index.html`의 `HOW`·`METHOD`·`METHOD_DATA`·`REP_EXTRA`와 같은 글). 시험: 묶음 열셋 id·칩·한 줄 셋·[더 보기] 넷, 처음 안내 다섯 줄·기관 표 여섯, 보고서 표 열넷, 모든 `[[열쇠]]`가 표의 출처 id로 바뀌어 `SOURCES`에 있음, 연구·법 칩 줄의 근거가 `LAW_BASIS`·이선경 외 2009뿐, `fillHow`(기준 날짜 없으면 그 조각과 빈 괄호를 뺌·`{범위}` `distText`·`{경쟁}` 없으면 `고른 과목 없음`), 소득·쓸 힘 줄에 한국사회보장정보원 한 마디, 영어 낱말 없음. 순수(`source.test.ts`)
## TASK-65: '이렇게 봤어요' 한 줄 부품
- REQ: REQ-7920 · AC-7920.2
- Files: src/components/location/common/**
- Tests: src/components/location/common/
- TDD: required — 시안 `?s=candidate` 묶음 제목 아래 모양. `HowLine({ chip, line: { what, how, why }, more: { what, how, why, basis }, open, onToggle })` — 한 줄 `이렇게 봤어요 {무엇} · {어떻게} · {왜}` + 칩(연구 근거·법 근거 = 파란 칩, 흔히 보는 기준 = 회색 칩, `law-common`은 둘) + [더 보기]/[접기], 펼치면 네 줄. 펼침 상태는 props(부르는 쪽이 범위를 바꿔도 지킴). 글을 만들지 않고 받은 글만 그림(`method.ts`를 부르지 않음 — 같은 Phase). props·콜백만, `max-md:`·`ds.textButton` 안 씀
## Phase 8 — 덧붙임 화면 부품 (14명 동시 · 겹침 없음: TASK-80은 화면 아닌 `query`·`collect`·`licenses`·`watch`·types 파일 · `components/location/`의 폴더 하나씩, `method/`+`start/` · `kinds/`+`weights/` · `listings/`+`prep/plan/`+`add/`는 한 TASK, 대시보드 `components/dashboard/location/`)
## TASK-66: 처음 안내 장·[분석 방법] 판
- REQ: REQ-7920 · AC-7920.1
- Files: src/components/location/method/**, src/components/location/start/**
- Tests: src/components/location/method/, src/components/location/start/
- TDD: required — 시안 `?s=method`·`?s=empty`. `MethodCard({ weights, rivalShort, onOpenSources })`(처음 안내 한 장 — `METHOD` 글, 셋째 줄 무게는 받은 지금 무게) · `MethodPanel({ open, onClose, …MethodCard props })`(오른쪽 판 760px, [닫기]·Esc, 판 아래 `처음 화면(후보 없음)에도 같은 안내가 있어요.`, [근거와 출처 모두 보기] = 닫고 `onOpenSources`). `EmptyScreen`은 시작 단계 아래에 `MethodCard`를 끼우고 머리 [분석 방법] 글 단추는 그 장으로 내려간다
## TASK-67: 의원 과목 고르기 판·점수 무게 판의 과목 줄
- REQ: REQ-7921, REQ-7919 · AC-7921.1, AC-7921.7, AC-7919.1
- Files: src/components/location/kinds/**, src/components/location/weights/**
- Tests: src/components/location/kinds/, src/components/location/weights/
- TDD: required — 시안 `?s=kinds`·`?s=weights`, design.md 18절. `DeptPicker({ rule, counts?: Partial<Record<DeptId, number>>, letter?, radiusM?, open, onChange(rule), onSave(rule), onClose })` — 과목 스물하나 줄마다 셋 가운데 하나, 처음 넷 '처음 경쟁' 회색 칩, 한의원 곁글, 맨 위 요약(목록 차례)·0개 노란 안내, 도움말, 줄 오른쪽 `후보 {글자} {범위} 안 {n}곳`, 곁글 둘, 바닥 글·[기본값으로]·[닫기]·Esc, 바꾸면 `onChange` 바로·`onSave`는 마지막 고침 800ms 뒤 한 번(무게 판과 같음). `ScoreWeights`: 판 머리 [과목 고르기], '경쟁' [세부] 맨 위 `경쟁 의원으로 보는 과목 {짧은 이름들}` + [과목 고르기], 자리 [세부] 맨 아래 `같은 건물·옆 건물 의원 수`(SCORE_GROUPS에서 저절로) — 새 props `rivalShort`·`onPickDepts`(없으면 단추 없음)
## TASK-68: 후보 자세히 틀 — 점수 풀이·닻 id 한 번·묶음 열셋·점수 셈 옮김
- REQ: REQ-7909, REQ-7920, REQ-7911 · AC-7909.1, AC-7920.3, AC-7911.1
- Files: src/components/location/detail/frame/**
- Tests: src/components/location/detail/frame/
- TDD: required — 시안 `?s=candidate`, design.md 14·19절. (1) 칸 감싸개의 `id="sec-{칸}"`을 지우고 ref·tabIndex만(목차 건너뛰기 그대로), 묶음 칸에 `others`(둘레 다른 과 의원, `rivals` 다음) — 시험: 틀이 그린 `sec-` id가 없음 (2) 종합 점수 오른쪽 점수 풀이(`explainCandidate` 결과를 그림, 머리·두 무리·줄 세 줄·도움말, 1,279px보다 좁으면 아래로) — props로 `deptRule`·`sggAvg`를 받음 (3) `facts.ts`는 셈을 지우고 `lib/location/facts.ts`를 다시 내보내기만(LocationScreen이 Phase 9에 옮길 때까지), 틀 안 다른 파일은 lib을 부름, 시험은 lib 시험으로 옮겨진 것을 빼고 남김 (4) `frame.test.data.ts` `makeSnapshot`의 기준 날짜를 `checkSnapshot`이 받는 모양(`YYYY-MM-DD`)으로, 새 칸(`place`·`sggAvg`·`at`·`detail`) 채움 (5) 위험 신호·목차의 경쟁 수는 설정을 따름 (6) 머리의 매물 줄(보증금·월세)은 `manText`
## TASK-69: 사는 사람·소득·앞으로 바뀔 것 — 이렇게 봤어요·의료급여 옛 구
- REQ: REQ-7909, REQ-7920 · AC-7909.2, AC-7909.7, AC-7920.2
- Files: src/components/location/detail/people/**
- Tests: src/components/location/detail/people/
- TDD: required — 묶음 셋 제목 아래 `HowLine`(`HOW.people`·`income`·`future`를 `fillHow`로 채움, 펼침은 props `howOpen`·`onHow`). 의료급여 비율은 `snapshot.ts` `welfareRate`만 부르고 `people/text.ts`의 같은 셈을 지움(합칠 때 모은 메모 TASK-33). `basis`가 있으면 머리 끝 ` · 옛 {구} 기준`. 닻 id는 묶음이 한 번만 그림(틀은 안 그림)
## TASK-70: 수요·교통 — 이렇게 봤어요·다른 과 의원 줄
- REQ: REQ-7909, REQ-7920, REQ-7921 · AC-7909.6, AC-7920.2, AC-7921.6
- Files: src/components/location/detail/demand/**
- Tests: src/components/location/detail/demand/
- TDD: required — 묶음 둘 제목 아래 `HowLine`(`demand`·`traffic`). 교통·둘레 시설에 `다른 과 의원` 줄을 다시 넣음: `{n}곳 · 과목마다 수는 위 '둘레 다른 과 의원'에 있어요`(n = 둘레로 보기·한의원 뺀 범위 안 의원, props로 받음). 닻 id는 묶음이 한 번만 그림
## TASK-71: 경쟁 의원·둘레 다른 과 의원·진료비·진료 시간 빈틈 — 과목 고르기 따르기
- REQ: REQ-7909, REQ-7921, REQ-7920, REQ-7922 · AC-7909.3, AC-7921.5, AC-7921.6, AC-7920.2, AC-7922.2
- Files: src/components/location/detail/rivals/**
- Tests: src/components/location/detail/rivals/
- TDD: required — 시안 `?s=candidate`·notes.md 5절 '고른 과목을 따르는 글' 표 그대로, design.md 18절. 받는 props에 `deptRule`·`onPickDepts`·`kakaoRoad?`(후보 도로명, 볼 때만)·`pharmacies?`(카카오 30m 안 약국, 볼 때만). `RivalsSection`: 제목 `경쟁 의원 {n}` + [과목 고르기]·곁글, 첫 줄, 0개 노란 안내, 한의원 한 줄, 거르기 단추, 표(`detail` 없는 의원 칸 `–` + 표 아래 글), 3년 개폐업(경쟁 과목만 + 이 자리 폐업), 200곳 글. 새 `OthersSection`(둘레 다른 과 의원: 제목·곁글·첫 줄(같은 건물/옆 건물, 카카오 도로명이 없으면 `30m 안`)·`병원이 모인 건물이에요` 칩·표·곁글·출처 두 줄). `PriceSection`: 경쟁 과목·`detail`만, `priced: false`인 의원은 `지금 받지 못했어요`, 도수치료 값(공개 자료에 있을 때만, `detail.manual`), 20곳 곁글. `HoursSection`: 경쟁 과목만·진료 시간 없는 곳 글·0개면 `경쟁 의원 과목을 고르면 보여요.` 묶음마다 `HowLine`(`comp`·`others`·`price`·`hours`). 닻 id 기본값 그대로(`sec-comp`·`sec-others`·`sec-price`·`sec-hours`)
## TASK-72: 거리 사진·건물 서류·빈 칸 짐작·땅 쓰임 — 이렇게 봤어요
- REQ: REQ-7909, REQ-7920 · AC-7909.4, AC-7909.5, AC-7920.2
- Files: src/components/location/detail/site/**
- Tests: src/components/location/detail/site/
- TDD: required — 묶음 넷 제목 아래 `HowLine`(`photo` 칩 둘·`bld` 법 근거·`vac`·`land`). `head={false}`일 때도 `HowLine`은 묶음 안에 있음. 닻 id는 묶음이 한 번만 그림
## TASK-73: 매물·개원 비용·후보 더하기 금액 글(`manText`)
- REQ: REQ-7910, REQ-7913, REQ-7905 · AC-7910.2, AC-7910.3, AC-7913.1, AC-7905.7
- Files: src/components/location/listings/**, src/components/location/prep/plan/**, src/components/location/add/**
- Tests: src/components/location/listings/, src/components/location/prep/plan/, src/components/location/add/
- TDD: required — 시안 `?s=listings`·`?s=plan`·`?s=plan-filled`, design.md 5절. 만 원 칸에서 온 금액(매물 보증금·월세·권리금·관리비 — 후보 더하기 판의 붙여 넣은 매물 미리 보기 포함, 협상표 참고 글, 비용 칸 옆 `매물에 적은 값: {금액}`, 합계 판)은 `manText`(`78만 원`·0 `없음`), 평당 값·한 달 이자·인테리어 합계·원 칸은 `wonText`. 셈은 그대로(원 정수)
## TASK-74: 후보 견주기 — 과목 고르기·금액 글
- REQ: REQ-7914, REQ-7921 · AC-7914.1, AC-7921.2
- Files: src/components/location/compare/**
- Tests: src/components/location/compare/
- TDD: required — 시안 `?s=compare`. 줄 이름 `경쟁 의원` + 작은 글 고른 과목 짧은 이름(`rivalShortText`), 점수·경쟁 수는 `lib/location/facts.ts`(`deptRule` props)로, 만 원 값은 `manText`. 부품 안 `snapshotFacts`·옛 셈을 쓰지 않음
## TASK-75: 한 장 보고서 — 둘째 장 '이렇게 분석했어요'·고른 과목
- REQ: REQ-7914, REQ-7920, REQ-7905 · AC-7914.2, AC-7920.5, AC-7905.7
- Files: src/components/location/report/**
- Tests: src/components/location/report/
- TDD: required — 시안 `?s=report`, design.md 19절. 첫 장 뒤 둘째 장(`REPORT` 글, 기준 날짜는 그날 값 출처별, 점수 매기는 법의 무게는 지금 설정), 인쇄 `break-before: page`·92%, 위 도움말·첫 장 끝 문장. 첫 장 경쟁 줄 `경쟁 의원({짧은 이름})`·한의원 둘레로 보기면 `한의원(따로)`·3년 개폐업은 경쟁 과목만, 만 원 값 `manText`. 점수 셈은 `lib/location/facts.ts`, `sheet.ts`의 빈 층·빈틈 셈은 다른 부품과 같은 lib 함수를 부름(따로 셈 없음)
## TASK-76: 동네 훑기 — 순위 줄 올린 것 1·내린 것 1
- REQ: REQ-7907, REQ-7920, REQ-7921 · AC-7907.1, AC-7920.4, AC-7921.2
- Files: src/components/location/scan/**
- Tests: src/components/location/scan/
- TDD: required — 시안 `?s=scan`. 순위 줄마다 `explainScan` 결과 `올린 것 … · 내린 것 …`(없는 쪽 안 씀)·순위 아래 도움말, 동 까닭 글 `정형외과` → `경쟁 의원`, 점수 무게 판에 `rivalShort`·`onPickDepts`를 넘김(props). `ScanData` 모양은 `collectScan` 결과 타입을 그대로 부름(따로 적은 모양을 지움)
## TASK-77: 대시보드 알림 — 후보 이름·고른 과목·줄마다 [닫기]
- REQ: REQ-7915, REQ-7921 · AC-7915.1, AC-7915.2, AC-7915.3, AC-7921.4
- Files: src/components/dashboard/location/**
- Tests: src/components/dashboard/location/
- TDD: required — 시안 `?s=dashboard`, design.md 12절. `useLocationWatch`가 설정(`readDeptRule`)을 같이 읽어 `pickEvents(found, cand, rule)`로, 경쟁 0개면 부르지 않음. 줄 글 requirements '화면 글 기본값' 새 경쟁 의원 알림(첫 줄 `경쟁 의원({과목})` — 과목은 `deptOfText` 대표 과목 짧은 이름, 아래 줄 `{후보 이름} · {의원 이름} · {거리} · {M월 D일}`), [닫기]는 그 줄 하나의 `seen_at`(지금 모양 그대로 시험으로 지킴), 링크는 평범한 `<a>` 그대로
## TASK-78: 지도 — 둘레 다른 과 의원 연보라 점
- REQ: REQ-7916, REQ-7921 · AC-7916.1
- Files: src/components/location/map/**
- Tests: src/components/location/map/
- TDD: required — `KakaoMap` 표시 종류에 `other`(연보라 작은 점, 경쟁 주황·한의원 회색보다 작게, 앱 토큰 색), 범례 글 시안 그대로. 가짜 `window.kakao`로 종류마다 그려짐을 봄
## TASK-80: 경로당·학교·시장 시도 이름 넘기기·인허가 업태 칸
- REQ: REQ-7918, REQ-7915, REQ-7921 · AC-7918.3, AC-7915.1, AC-7921.4
- Files: src/lib/location/query.ts, src/lib/location/query.test.ts, src/lib/location/collect.ts, src/lib/location/collect.test.ts, src/app/api/ai/location/registry.test.ts, src/app/api/ai/location/sources/licenses.ts, src/app/api/ai/location/sources/licenses.test.ts, fixtures/location/api/licenses/**, src/types/location.ts, src/lib/location/watch.ts, src/lib/location/watch.test.ts
- Tests: src/lib/location/query.test.ts, src/lib/location/collect.test.ts, src/app/api/ai/location/registry.test.ts, src/app/api/ai/location/sources/licenses.test.ts, src/lib/location/watch.test.ts
- TDD: required — design.md 17절 10. (1) `query.ts`의 `senior`·`school`·`market`에 선택 칸 `sidoName`(이름 글). (2) `collect.ts`가 후보 모으기와 동네 훑기 둘 다에서 이 셋에 `sidoName`(그 시군구의 시도 이름)을 넣어 부름 — 경로당·학교는 시도 이름 없이는 요청 0개라 늘 실패하던 것을 고침. (3) `registry.test.ts` 견본 몸통에 `sidoName`. (4) 인허가 줄에 업태 칸(`MDLCR_INST_BTP_NM`)을 읽어 `LicenseRow`에 선택 칸 `type?: string`(없으면 빈 글자)으로 더하고, `watch.ts`의 `deptOfText`에 넘겨 치과의원·한의원을 경쟁으로 골랐을 때 새 의원 알림에 잡히게 함(design.md 18절 `deptOfText`). 가짜 응답의 이름·주소는 지어낸 값
## Phase 9 — 덧붙임 잇기 (1명)
## TASK-79: 입지 분석 화면 잇기 — 분석 방법·과목 고르기·지도 점·닻 id·점수 셈 한 곳
- REQ: REQ-7901, REQ-7909, REQ-7916, REQ-7920, REQ-7921, REQ-7908 · AC-7909.1, AC-7916.1, AC-7920.1, AC-7920.2, AC-7921.1, AC-7921.2, AC-7908.2, AC-7908.3
- Files: src/components/location/LocationScreen.tsx, src/components/location/LocationScreen.test.tsx, src/components/location/useLocation.ts, src/components/location/useLocation.test.ts, src/app/(app)/location/**, src/components/location/detail/frame/facts.ts, src/components/location/detail/frame/facts.test.ts, src/lib/location/facts.ts, src/lib/location/facts.test.ts
- Tests: src/components/location/LocationScreen.test.tsx, src/components/location/useLocation.test.ts, src/app/(app)/location/, src/lib/location/facts.test.ts
- TDD: required — Phase 6~8 부품을 고치지 않고 잇기만. (1) 머리 [분석 방법] → `MethodPanel`, 처음 화면 `MethodCard` (2) [과목 고르기](무게 판·경쟁 묶음 둘) → `DeptPicker`, 바꾸면 `deptRule`을 바로 바꿔 다시 부르지 않고 점수·묶음·지도·견주기·보고서가 바뀌고 `saveDeptRule`, [기본값으로] `resetDeptRule`, 모으기·[다시 받기]에 지금 `deptRule` (3) 작은 지도 marks에 경쟁 의원(주황)·한의원(회색, 둘레로 보기일 때)·둘레 다른 과(연보라 `other`)·역(검은 네모, `station.v.at`) — 안 보기 과목 없음 (4) 후보 단추 `{글자} {이름} · {행정동 이름}`(`place`) (5) 닻 id: 시험의 '겹치는 id 다섯' 기댓값을 `[]`로, `sec-price-in`·`sec-hours-in` 우회를 지우고 묶음 기본 id로 (6) `lib/location/facts.ts`를 바로 부르고 `detail/frame/facts.ts`·그 시험을 지움 (7) '이렇게 봤어요' 펼침 상태를 묶음마다 기억(범위를 바꿔도 그대로), `OthersSection`을 틀 칸 `others`에, 교통 묶음에 다른 과 의원 수, 경쟁 묶음에 카카오 도로명·30m 안 약국(볼 때만, 저장 안 함) (8) 끝에 location 쪽 tsc 오류 0 (9) `lib/location/facts.ts` `sourceAsOf`: `hosp-hours`·`nonpay`·`hosp-detail`을 물으면 `rivals` 칸 기준 날짜, `apt-info`를 물으면 `apt-list` 칸 기준 날짜(이렇게 봤어요·보고서 기준 날짜가 비지 않게, 시험 먼저) (10) 지도 범례는 `CandidateFrame`의 `mapLegend`에 `mapLegend(deptRule)`(`map/marks.ts`) (11) 동네 훑기 `ScanView`에 `deptRule`·`onPickDepts`; 훑기의 동마다 경쟁 수는 모을 때 설정으로 센 값이라 과목을 바꾸면 [다시 받기] 안내를 따른다(저절로 다시 부르지 않음) (12) 옛 `detail/frame/facts` 시험을 지운 뒤 `tdd-run TASK-68 --expect green`도 다시 돌려 기록
## Phase 10 — 마무리 (1명, 이 기능의 유일한 검토)
## TASK-48: 전체 검사·화면 사진 확인·독립 검토 한 번
- REQ: REQ-7901, REQ-7914, REQ-7916, REQ-7917, REQ-7920 · AC-7901.4, AC-7914.2, AC-7916.2, AC-7917.1, AC-7920.5
- Files: src/components/location/**, src/components/dashboard/location/**, src/lib/csp.ts, src/lib/csp.test.ts, src/components/shell/AccountMenu.tsx, src/components/shell/shell.test.tsx, src/components/staff/pay/PaySlip.test.tsx, src/types/location.ts, src/lib/location/collect.ts, src/lib/location/collect.test.ts, src/app/api/ai/location/registry.test.ts, src/lib/location/method.ts, src/lib/location/method.test.ts
- Tests: src/components/location/, src/components/dashboard/location/, src/lib/csp.test.ts, src/components/shell/shell.test.tsx, src/components/staff/pay/PaySlip.test.tsx, src/lib/location/collect.test.ts, src/app/api/ai/location/registry.test.ts, src/lib/location/method.test.ts
- TDD: exempt — 전체 검사(`npm test`·`npm run lint`·`npm run build`·tsc, ssk-finish-check — 이 PC에서 원래 나는 실패는 known-failures와 견줌, `fflate`·`unpdf`가 있는 node_modules에서, `boundary.test` 5초 한도가 이 PC에서 넘는지 따로 봄), 화면 사진 확인(ssk-screen-check: 로그인 없는 하네스, 1440·1024, 가짜 자료, 승인 1~3 시안 사진과 견줌 — 분석 방법 판·과목 고르기 판·점수 풀이·이렇게 봤어요·둘레 다른 과 의원·보고서 두 장이 A4 두 쪽에 드는지, 폰 폭 사진 없음), 진짜 브라우저로 지도·하늘 사진·로드뷰를 띄워 CSP 위반 기록을 모아 `csp.ts` origin을 고침(TASK-47이 못 한 확인 7). `AccountMenu.tsx`의 링크 둘([가입 승인]·청구 설정)은 지금 `/location`이면 평범한 `<a>`(셸 `ShellLink`와 같은 까닭 — 이 둘만은 시험 먼저, `shell.test.tsx`). `PaySlip.test.tsx` AC-7615.10의 'ADR-039가 맨 끝' 기대를 ADR-042~044가 뒤에 있어도 맞게(운영 갈래 ADR-040과 다른 갈래 번호는 합칠 때 다시 봄). 화면 글에 남은 영어 낱말을 마지막으로 훑음. Phase 7~8 남은 것(각각 시험 먼저): (a) `Query`의 `senior`·`school`·`market`에 `sidoName?: string`을 더하고 `collect.ts` `bySido`·`registry.test.ts` `...SIDO` 우회를 걷어냄 (b) `useLocationWatch`의 인허가 줄 옮기기가 `type`(업태)도 옮겨 치과의원·한의원을 경쟁으로 고르면 알림에 잡힘 (c) `method.ts` 기준 날짜 열쇠에 `welfare`를 더해 소득 줄·보고서에 의료급여 기준 날짜가 나옴 (d) 칩 종류·칩 글이 `HowLine`과 `method.ts` 두 곳에 있음 → `method.ts` 하나로 (e) 지도 연보라 점이 빌린 예약 색 토큰이 UI_GUIDE에 맞는지 봄. 그다음 독립 검토 한 번(코드를 주고 결론은 주지 않음). 고칠 것이 Files 밖이면 명세를 고친 뒤 한다

## Phase 11 — 검토 고침 (3명 동시 · 겹침 없음: TASK-81 모으기·알림·소득 / TASK-82 화면 글·출처 줄·점수 % / TASK-83 SQL·부르기 한도. 사용자 2026-11-23: '꼭 고칠 11 + 정확성 6', 소득 시·도 평균 보이기, 넓이는 평만. 끝나면 고친 곳만 짧게 다시 검토 — 보고 `~/.claude/state/handoff/location-review-1.md`)

## TASK-81: 검토 고침 — 카카오 동 이름 저장 안 함·세종·알림 지역과 잘림·의원 목록 잘림·3년 개폐업 업태·소득 시·도 평균
- REQ: REQ-7908, REQ-7915, REQ-7909, REQ-7918, REQ-7921 · AC-7908.2, AC-7915.1, AC-7909.3, AC-7909.7, AC-7918.2, AC-7921.2
- Files: src/lib/location/collect.ts, src/lib/location/collect.test.ts, src/lib/location/snapshot.ts, src/lib/location/snapshot.test.ts, src/types/location.ts, src/lib/location/data/income.json, src/lib/location/data/index.ts, src/lib/location/data/data.test.ts, src/app/api/ai/location/sources/homes.ts, src/app/api/ai/location/sources/homes.test.ts, fixtures/location/api/homes/**, src/lib/storage/location.ts, src/lib/storage/location.test.ts, src/components/dashboard/location/**, src/components/location/detail/people/**, src/components/location/detail/frame/frame.test.data.ts
- Tests: src/lib/location/collect.test.ts, src/lib/location/snapshot.test.ts, src/lib/location/data/data.test.ts, src/app/api/ai/location/sources/homes.test.ts, src/lib/storage/location.test.ts, src/components/dashboard/location/, src/components/location/detail/people/
- TDD: required — 검토 1·2·3 + 정확성 셋. (1) `apts[].bdongName`을 카카오 `k-point` 지번 글에서 떼지 않고 공공 답(공동주택 단지 목록·기본 정보의 읍면동 이름)에서만 — 저장 몸통에 카카오 주소 글이 없음을 시험(design 6절). (2) 3년 개폐업 `addr`: 시도 이름과 시군구 이름이 같으면(세종) 하나만. (3) 대시보드 새 경쟁 의원 확인(`useLocationWatch`): 후보 `place`로 `addr`를 싣고(세종 규칙 같음), `capped`면 그 후보 확인 날을 고치지 않고, 과목 설정을 못 읽으면 그번 확인을 건너뜀(`readDeptRule`이 실패를 알 수 있게 — 저장 쪽 새 함수나 결과 모양), 기간은 design 12절 새 식. (4) 의원 목록(`hosp-list`) 답이 한도에 잘리면 `rivals`에 잘림을 남겨 화면이 이미 있는 '200곳 넘게 있을 수 있어요…' 곁글을 보이게(조용히 적게 세지 않음). (5) 3년 개폐업 줄에 업태(`type`)를 남겨 치과·한의원을 업태로 가름. (6) 소득 시·도 평균: 자료 만들기 스크립트 `~/.claude/state/handoff/location-data-scripts/build_money.py`(저장소 밖, 원본 `scratchpad/location-data/raw/income/tasis_4-2-15_2025.json`)에 시·도 합계 금액 ÷ 합계 인원을 더해 `income.json`에 `sidos: { {시도 코드 2자리}: { name, won } }`를 넣고(전남광주·세종 등 2026 개편 이름은 design 5절), 읽기 `index.ts`, 그날 값 `income.sidoName`·`sidoWon`, 소득 묶음에 `{시도} 평균 {금액}`과 견줌(글은 명세 '화면 글 기본값'과 시안 소득 칸을 따르고 없으면 `시·도 평균 {금액}`). 시험 자료 `frame.test.data.ts`의 income에 새 칸

## TASK-82: 검토 고침 — 화면 글 다섯·출처 줄 길·점수 %·빈 칸 지난 값 줄
- REQ: REQ-7906, REQ-7920, REQ-7914, REQ-7917, REQ-7919 · AC-7906.2, AC-7906.3, AC-7920.3, AC-7917.2
- Files: src/lib/location/explain.ts, src/lib/location/explain.test.ts, src/lib/location/score.ts, src/lib/location/score.test.ts, src/components/location/common/**, src/components/location/scan/**, src/components/location/listings/**, src/components/location/prep/**, src/components/location/sources/**, src/components/location/weights/**, src/components/location/report/**, src/components/location/add/**, src/components/location/detail/site/**
- Tests: src/lib/location/explain.test.ts, src/lib/location/score.test.ts, src/components/location/common/, src/components/location/scan/, src/components/location/listings/, src/components/location/prep/, src/components/location/sources/, src/components/location/report/, src/components/location/add/, src/components/location/detail/site/
- TDD: required — 검토 4~10 + 정확성 둘. (4) 점수 풀이 `k-vsAvg` 글 `저장한 매물 평균보다 {n}% 비싸요`/`싸요`(requirements 점수 풀이 글). (5) 출처 줄을 누르면 '근거와 출처' 탭으로 바뀜: `SourceLine`의 콜백 없는 기본 길을 평범한 `<a href>`로(이 화면은 주소 `tab`을 처음에만 읽음) — `scan`·`listings`(PriceCompare·SavedListings)·`prep`(OpenSchedule·visit) 모두. (6) '근거와 출처' 점수 표 만점 기준 글을 requirements '화면 글 기본값'(`1km²에 [10,000]명이면 100점` 등, 고르기 항목은 `고른 값이 '보여요'이면 100점`)으로 — `weights/text.ts`의 앞말·뒷말·고르기 글을 함께 씀. (7) 훑기 무게 판 `rivalShort`: 경쟁 0개면 `''`. (8) 법 근거 곁글 끝 ` · 아홉 줄`(시안). (9) 보고서 단추 `후보 {글자}로 돌아가기`(글자 없으면 `후보로 돌아가기`). (10) 후보 더하기 범위 도움말 `저장한 뒤 후보 자세히에서 바꿔요.`(시안). (정확성) `score.ts` `k-vsAvg` 차이 %를 화면(`listings.ts`)과 같은 버림으로. (정확성) 빈 칸 짐작이 건축물대장 지난 값으로 셀 때 `지난 값 · 기준 {날짜}` 줄(AC-7917.2)

## TASK-83: 검토 고침 — 사진 30장 동시 넣기 잠금·3년 개폐업 부르기 한도
- REQ: REQ-7913, REQ-7909 · AC-7913.4, AC-7909.3
- Files: supabase/migrations/20261122000000_location.sql, supabase/location.rls.test.ts, src/components/location/clients.ts, src/components/location/clients.test.ts
- Tests: supabase/location.rls.test.ts, src/components/location/clients.test.ts
- TDD: required — (1) 사진 30장 트리거가 같은 후보에 동시에 넣어도 31장이 안 되게 그 후보로 잠금(`pg_advisory_xact_lock`, 본보기 `notice_keywords.sql`) — 파일만 고치고 실제 Supabase에는 실행하지 않음. (2) 브라우저 `queryLocation` 한도: 3년 개폐업(`clinic-license`, 최대 30쪽)이 10초에 잘리지 않게 종류마다 한도(서버 경로 한도 120초 안)

