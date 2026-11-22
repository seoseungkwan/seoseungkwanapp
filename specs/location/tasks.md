# 작업 분할: 입지 분석
> TASK-8(예상 환자)은 사용자가 계산을 빼서 지웠다(2026-11-22, 번호는 다시 매기지 않음). 형식: `## Phase n` 아래 `## TASK-n: 제목` · `- REQ:`(REQ · AC) · `- Files:`(수정 범위, glob 허용) · `- Tests:` · `- TDD:`. 승인되면 Files/Tests 경로만 고친다. TASK마다 일꾼 하나(각자 git worktree). **Phase 안 TASK(step)는 모두 동시에 하고 Files가 서로 겹치지 않는다**(Phase 머리에 겹침 확인, 2026-11-22). 다음 Phase는 앞 Phase를 모두 합친 뒤. 여러 TASK가 같이 쓰는 것(DB·타입·종류 검사·서버 공통·출처 목록)은 Phase 1에 둔다. 같은 Phase에서 만드는 파일은 서로 부르지 않는다(Phase 1 계산 파일은 자기 입력·출력 타입을 스스로 내보낸다).
> **검토는 마지막 Phase 6에서 한 번만**(화면 사진 확인 + 독립 검토, 재검토는 사용자에게 묻고). 중간 Phase에 검토 TASK는 없고 일꾼은 자기 시험만, 합칠 때 그 Phase 시험만 돌린다. **시험 먼저(TDD)**: 시험 이름에 AC ID, 실패를 본 뒤 만든다. 바깥 자료는 **가짜 응답으로 먼저**(`fixtures/location/api/<묶음>/`, 지어낸 이름만), 진짜 열쇠는 TASK-47. **화면 TASK(26~29·31~44·46)는 승인된 시안(`docs/mockups/location/`, 사용자 승인 2026-11-22) 글자·자리 그대로**(명세와 다른 곳은 requirements.md 머리 규칙), 폰 전용 모양 없음(`max-md:` 금지, 폰 폭 사진 없음), 화면 부품은 props·콜백만(design.md 14절).
> **사용자 단계**: (1) 시안 승인 (2) `/sdd approve location` (3) 공공데이터포털 활용신청(design.md 4절)·카카오 앱·사이트 도메인 등록 (4) 열쇠를 `.env.local`·Vercel 환경 변수에 직접(Claude가 한 단계씩 안내, 대화에 붙이지 않음) (5) 배포 전 `supabase/migrations/20261122000000_location.sql`을 SQL Editor에 붙여 넣고 Storage `location-photos`가 Private인지 보기. 배포·합치기(운영 갈래)는 사용자가 말할 때만. 다른 갈래와 겹칠 수 있는 파일(`docs/ADR.md`·`CLAUDE.md`·`plan.md`·errors·`csp.ts`·`next.config.ts`·셸·대시보드)은 합칠 때 앞 갈래를 먼저 받고 번호·수만 맞춘다.
## Phase 1 — 같이 쓰는 바탕 (10명 동시 · 겹침 없음: supabase·문서 / 타입·종류 검사·서버 공통 / 출처·오류 / `lib/location/` 파일이 TASK마다 따로)
## TASK-1: DB 표 여섯·사진 칸·ADR-042~044·문서
- REQ: REQ-7902 · AC-7902.1, AC-7902.2, AC-7902.3, AC-7902.4, AC-7902.5
- Files: supabase/migrations/20261122000000_location.sql, supabase/location.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md, plan.md, CLAUDE.md
- Tests: supabase/location.rls.test.ts
- TDD: required — design.md 7·16절. 본보기 `supabase/contacts.rls.test.ts`·`inventory.rls.test.ts`(PGlite, 진짜 migration 사슬을 데스크·주소록 SQL까지). 관리자·관리자 아닌 원장·다른 병원 관리자·데스크·승인 대기·anon을 모두 본다. `on delete set null (칸)`이 그 칸만 비우는지, 사진 30줄 트리거. **실제 Supabase에 붙여 넣지 않는다**
## TASK-2: 공용 모양·종류 검사·서버 공통(관리자 확인·바깥 부르기·두 경로)
- REQ: REQ-7903 · AC-7903.1, AC-7903.2, AC-7903.3, AC-7903.4, AC-7903.5
- Files: src/types/location.ts, src/lib/location/query.ts, src/lib/location/query.test.ts, src/lib/location/source.test.ts, src/app/api/ai/location/guard.ts, src/app/api/ai/location/guard.test.ts, src/app/api/ai/location/fetchSource.ts, src/app/api/ai/location/fetchSource.test.ts, src/app/api/ai/location/registry.ts, src/app/api/ai/location/query/route.ts, src/app/api/ai/location/query/route.test.ts, src/app/api/ai/location/keys/route.ts, src/app/api/ai/location/keys/route.test.ts
- Tests: src/lib/location/query.test.ts, src/lib/location/source.test.ts, src/app/api/ai/location/guard.test.ts, src/app/api/ai/location/fetchSource.test.ts, src/app/api/ai/location/query/route.test.ts, src/app/api/ai/location/keys/route.test.ts
- TDD: required — design.md 3·4·6절 타입 그대로(`SourceId = string`). `checkQuery`는 종류 26개·칸 범위만. 경로 처리 함수는 registry를 받아 시험이 가짜 읽는 곳을 넣고 `registry.ts`는 빈 판(TASK-45가 잇는다). 본보기 `app/api/ai/inventory/invoice/route.ts`. host 밖(사람 흐름 host는 design.md 3절에 채운 값)·redirect·8초·2MB·`not-applied`·열쇠가 로그·답에 없음·카카오 답을 담아 두지 않음·서버 메모리 보관 없음. 새 파일 첫 줄 `import 'server-only'`(route 빼고). `source.test.ts`는 `src/lib/location/` 시험 밖 파일이 순수한지 소스 글자로 본다(본보기 `src/lib/contacts/source.test.ts`)
## TASK-3: 출처 목록·법 근거·없는 자료·오류 번호
- REQ: REQ-7906, REQ-7917 · AC-7906.1, AC-7917.3
- Files: src/lib/location/sources.ts, src/lib/location/sources.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/location/sources.test.ts, src/lib/errors.test.ts
- TDD: required — design.md 2·15절. `SOURCES`는 조사 1~3 표의 기관·번호·이용 조건 그대로(통계청은 '국가데이터처', 부동산원 임대동향·서울 생활인구는 넣지 않음, 하루 이용률(15072876)·직원 월급(실태조사·구인 시세)도 넣지 않음, 사람 흐름 15142066·15142032·15142034와 좌표 파일 15067528·15013205 줄은 조사 4 그대로, 사용자 값 `user` 포함), `LAW_BASIS` 아홉 줄, `MISSING`은 requirements '자료가 없는 것'. 오류 다섯은 design.md 15절 글 그대로
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
## TASK-6: 점수
- REQ: REQ-7911 · AC-7911.1, AC-7911.2
- Files: src/lib/location/score.ts, src/lib/location/score.test.ts
- Tests: src/lib/location/score.test.ts
- TDD: required — design.md 8절. `SCORE_RULES` 상수(화면이 그대로 그림), 0·100점 끝, 값 없는 항목 빼기, 무게 합 0, `people` = 40세 이상 인구 밀도(이용률 없음), 동 단위(세 항목)와 후보(다섯 항목), 매물 1개면 비용 없음, 사람 흐름은 점수에 없음
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
## Phase 2 — 바깥 자료 열두 묶음 (12명 동시 · 겹침 없음: `app/api/ai/location/sources/<묶음>.ts`·`fixtures/location/api/<묶음>/`이 하나씩, TASK-23만 `lib/location/flow*`를 더함)
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
## TASK-22: 바깥 자료 — 시설·사고(시장·경로당·체력단련장·교통사고 다발)
- REQ: REQ-7904 · AC-7904.1, AC-7904.2, AC-7904.3, AC-7904.4
- Files: src/app/api/ai/location/sources/facilities.ts, src/app/api/ai/location/sources/facilities.test.ts, fixtures/location/api/facilities/**
- Tests: src/app/api/ai/location/sources/facilities.test.ts
- TDD: required — `market`·`senior`·`gym`(5174, 폐업 뺌)·`accident`(기준 연도). 표준데이터 API의 시군구 이름 거르기. 역·정류장은 부르지 않는다(좌표 파일, TASK-30)
## TASK-23: 바깥 자료 — 사람 흐름(승하차 인원)
- REQ: REQ-7904, REQ-7909 · AC-7904.1, AC-7904.2, AC-7909.6
- Files: src/app/api/ai/location/sources/flow.ts, src/app/api/ai/location/sources/flow.test.ts, fixtures/location/api/flow/**, src/lib/location/flow.ts, src/lib/location/flow.test.ts
- Tests: src/app/api/ai/location/sources/flow.test.ts, src/lib/location/flow.test.ts
- TDD: required — design.md 4절, 조사 4. `flow-volume`(15142066, 시도·시군구 번호·연월, 30쪽, 승차·하차·날 수)·`flow-bus`(15142032, 이름·ARS)·`flow-rail`(15142034, 역 이름·노선). `lib/location/flow.ts`(순수): ID → 이름 → 좌표(정류장은 ARS, 빈 곳은 이름+시군구 · 역은 이름+노선) → 범위 안 하루 평균(버림)·합·못 이은 수. 좌표 파일 모양은 design.md 5절(시험은 지어낸 견본을 이 시험 안에). 정류장 좌표 파일이 없는 시군구 → `outside`(`이 지역은 자료 없음`)
## Phase 3 — 저장 · 모으기 · 공용 화면 · 지도 · 진짜 자료 파일 (7명 동시 · 겹침 없음: `lib/storage/location*`·`clients*` / `lib/location/{collect,snapshot}*` / `components/location/`의 폴더 하나씩 / `csp*`·`next.config.ts` / `public/location/`·`lib/location/data/`)
## TASK-24: 저장 함수·부르기
- REQ: REQ-7908, REQ-7913 · AC-7908.2, AC-7913.4
- Files: src/lib/storage/location.ts, src/lib/storage/location.test.ts, src/components/location/clients.ts, src/components/location/clients.test.ts
- Tests: src/lib/storage/location.test.ts, src/components/location/clients.test.ts
- TDD: required — design.md 6·7절. 본보기 `lib/storage/contacts.ts`·`inventory.ts`(가짜 client, 보낸 표·칸 견줌, 오류에 Supabase 글 없음). 후보 저장 몸통에 카카오 자료 칸이 없다. 사진 올리기·지우기(경로 모양, 후보를 지우면 파일도). `clients.ts`: 같은 origin `POST`·`redirect: 'error'`·10초, 동 파일 `/location/dongs/<code5>.json`·좌표 파일 `/location/transit/{index,rail}.json`·`/location/transit/bus/<code5>.json`
## TASK-25: 모으기·그날 값
- REQ: REQ-7908 · AC-7908.2, AC-7908.3
- Files: src/lib/location/collect.ts, src/lib/location/collect.test.ts, src/lib/location/snapshot.ts, src/lib/location/snapshot.test.ts
- Tests: src/lib/location/collect.test.ts, src/lib/location/snapshot.test.ts
- TDD: required — design.md 6절. `collect(point, radius, deps)`는 부르는 함수·동 파일 읽기를 받는다(동시에 4개, 진행 수). 실패 종류는 `ok: false`, 카카오 답은 그날 값에 넣지 않는다. 가장 가까운 역·400m 안 정류장 수는 좌표 파일(경계 근처는 이웃 시군구도), 사람 흐름은 `flow-volume` → `flow-bus`·`flow-rail` → `lib/location/flow.ts`(같은 시군구·달은 한 번, 지난달 없으면 두 달 전까지). `fitSnapshot` 65,536바이트, `mergeSnapshot`의 `prev`
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
- TDD: required — `SOURCES`·`LAW_BASIS`·`SCORE_RULES`·`MISSING`만 읽어 그린다(따로 적은 글 없음, 같은 Phase의 `common/`은 부르지 않음), 이용 조건 출처 문구, 출처 줄 id 닻(`#src-<id>`)
## TASK-29: 처음(후보 없음)·열쇠 없음 화면
- REQ: REQ-7917 · AC-7917.1
- Files: src/components/location/start/**
- Tests: src/components/location/start/
- TDD: required — design.md 15절 글. 열쇠 상태(`ok`·`missing`·`rejected`·`failed`)마다 글, **열쇠 입력 칸이 없음**, 열쇠 없이 되는 것 세 가지 단추
## TASK-30: 진짜 자료 파일 — 동 경계·소득·정류장·역 좌표
- REQ: REQ-7918 · AC-7918.1, AC-7918.2, AC-7918.5
- Files: public/location/dongs/**, public/location/transit/**, src/lib/location/data/**
- Tests: src/lib/location/data/
- TDD: required — design.md 5절. 시험(`data.test.ts`)이 먼저 모양·시군구 수·동 넓이 > 0·못 이은 동 수·소득 코드 5자리·정류장 파일 시군구 목록·정류장/역 점 범위(33~39·124~132)를 본다. 원본(SGIS 경계 15129688·국세청 TASIS 4-2-15·버스정류장 위치 CSV 15067528·도시철도역사 XLSX 15013205)은 저장소 밖에서 받아 저장소 밖 스크립트로 줄인다(스크립트·원본은 넣지 않음). 정류장은 동 경계로 시군구를 나눈다. 받기가 로그인에 막히면 사용자에게 파일을 부탁한다. 전체 40MB 안, 파일 하나 2MB 안
## Phase 4 — 화면 묶음 열둘 (12명 동시 · 겹침 없음: `components/location/`의 폴더 하나씩)
## TASK-31: 동네 훑기 화면
- REQ: REQ-7907 · AC-7907.1, AC-7907.2, AC-7907.3, AC-7907.4
- Files: src/components/location/scan/**
- Tests: src/components/location/scan/
- TDD: required — 동 점수는 `score.ts`(세 항목). 무게 막대를 움직여도 부르기 콜백이 다시 불리지 않음, 몇 항목으로 매겼는지, 못 이은 동 글, [여기에 후보 더하기]·[네이버 부동산에서 매물 보기]
## TASK-32: 후보 자세히 — 틀(위험 신호·종합 점수·살필 범위·목차·다시 받기)
- REQ: REQ-7909, REQ-7911, REQ-7908 · AC-7909.1, AC-7911.3, AC-7908.3, AC-7908.4
- Files: src/components/location/detail/frame/**
- Tests: src/components/location/detail/frame/
- TDD: required — 묶음 열둘은 칸(slot)으로 받아 차례대로 놓기만 한다(묶음 부품을 부르지 않음). 위험 신호 맨 위, 범위 일곱 값, [오늘 값으로 다시 받기]·기준 날짜, 목차 건너뛰기
## TASK-33: 후보 자세히 — 사는 사람·소득·앞으로 바뀔 것
- REQ: REQ-7909 · AC-7909.2
- Files: src/components/location/detail/people/**
- Tests: src/components/location/detail/people/
- TDD: required — 나이대 넷·60세 이상 비율·세대 수·4년 추세·아파트·홍보할 차례(가까움·세대·지은 해)·입주 예정, 소득은 `동 단위 자료가 없어요`, 동 기준(행정동·법정동) 아래 글
## TASK-34: 후보 자세히 — 정형외과 수요·교통·사람 흐름·둘레 시설
- REQ: REQ-7909, REQ-7908 · AC-7909.1, AC-7909.6, AC-7908.4
- Files: src/components/location/detail/demand/**
- Tests: src/components/location/detail/demand/
- TDD: required — 40세 이상 인구·밀도(하루 환자 수 어림 없음)·경로당·체력단련장·교통사고 다발·산업단지·학교, 역(출구 없음)·정류장·사람 흐름(역·정류장마다 하루 평균 승하차, `교통카드 찍은 사람 수예요(걷는 사람 수와 달라요)`, 자료 없는 지역 `이 지역은 자료 없음`)·시장, 약국·마트·큰 병원(카카오, 볼 때만 — 저장 콜백에 넘기지 않음), `capped` 글
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
- REQ: REQ-7913 · AC-7913.3, AC-7913.4
- Files: src/components/location/prep/visit/**
- Tests: src/components/location/prep/visit/
- TDD: required — 세 점검표 값(○·✕·모름)·법 근거 링크, 등기부 안내·등기소 링크, 사진 올리기(30장 넘으면 `E-LOC-PHOTO`, `shrinkPhoto` 흉내)·지우기, 날짜별 메모, 진행 상태 다섯
## Phase 5 — 잇기 · 알림 · 진짜 열쇠 (5명 동시 · 겹침 없음: 셸·문지기 / 화면 맨 위 파일·페이지·`titles.test` / `registry*` / 대시보드 / `sources/**`·`fixtures/location/api/**`·`lib/location/{flow,links}*`)
## TASK-43: 탭 열기·관리자 문지기
- REQ: REQ-7901 · AC-7901.1, AC-7901.2
- Files: src/components/shell/menu.ts, src/components/shell/MoreMenu.tsx, src/components/shell/TabBar.tsx, src/components/shell/AppShell.tsx, src/components/shell/shell.test.tsx, src/lib/auth/gate.ts, src/lib/auth/gate.test.ts, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/shell/shell.test.tsx, src/lib/auth/gate.test.ts, src/app/(app)/tabFrame.test.tsx
- TDD: required — design.md 14절. `MENU`·기능 목차·준비 중 수는 그대로, `LOCATION_TAB`은 관리자에게만 '주소록' 다음, `더보기 · 입지 분석`, 데스크는 늘 없음. 문지기: 관리자 아닌 원장 `/dashboard`·데스크 `/sunap`·로그인 안 함 `/login`
## TASK-44: 화면 잇기 — 입지 분석 화면·페이지
- REQ: REQ-7901, REQ-7908, REQ-7917 · AC-7901.3, AC-7901.4, AC-7908.1, AC-7908.2, AC-7908.3, AC-7908.4, AC-7917.1
- Files: src/components/location/LocationScreen.tsx, src/components/location/LocationScreen.test.tsx, src/components/location/useLocation.ts, src/components/location/useLocation.test.ts, src/app/(app)/location/**, src/app/titles.test.tsx
- Tests: src/components/location/LocationScreen.test.tsx, src/components/location/useLocation.test.ts, src/app/(app)/location/, src/app/titles.test.tsx
- TDD: required — Phase 3·4 부품을 고치지 않고 잇기만. `guardPage('/location')`·탭 이름(`titles.test`는 `'/location'` 글자로 더하고 같은 Phase의 `LOCATION_TAB`을 부르지 않음), `?c=&tab=`, 열 때 표 여섯·`keys` 한 번(지금 의원 환자 숫자는 읽지 않음 — `readDays`를 부르지 않음), 저장·다시 받기, 후보 저장 몸통에 카카오 자료 없음, 후보를 열면 알림 `seen_at`, `E-LOC-READ-FAILED`, 열쇠 없음 화면, 두 칸 틀 최소 폭 1,024px
## TASK-45: 종류 잇기(registry)
- REQ: REQ-7903, REQ-7904 · AC-7903.2, AC-7904.1
- Files: src/app/api/ai/location/registry.ts, src/app/api/ai/location/registry.test.ts
- Tests: src/app/api/ai/location/registry.test.ts
- TDD: required — 열두 묶음을 이어 종류 26개가 빠짐없이 하나씩, 열쇠 종류가 design.md 4절과 같음을 본다
## TASK-46: 대시보드 새 경쟁 의원 알림
- REQ: REQ-7915 · AC-7915.1, AC-7915.2, AC-7915.3
- Files: src/components/dashboard/location/**, src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/location/, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required — design.md 12절, 본보기 `components/dashboard/warranty/`(자리 넷·한 번만·실패 조용히). 관리자 아니면 부르지 않음, 같은 줄 한 번, 셋 + `… {n}건 더`, [닫기]는 보이던 줄의 `seen_at`을 채움(다음 새 줄은 다시 뜸), 링크 `/location?c=…&tab=detail`, 20초, 다른 숫자가 기다리지 않음. `tabFrame.test.tsx` AC-301.3 정규식 때문에 점 붙은 `location.` 글자를 쓰지 않는다. `components/dashboard/imports.test.ts` 울타리를 지킨다
## TASK-47: 진짜 열쇠 잇기 — 응답 모양·코드·링크·CSP origin 확인
- REQ: REQ-7918, REQ-7904 · AC-7918.3, AC-7918.4, AC-7904.1
- Files: src/app/api/ai/location/sources/**, fixtures/location/api/**, src/lib/location/flow.ts, src/lib/location/flow.test.ts, src/lib/location/links.ts, src/lib/location/links.test.ts
- Tests: src/app/api/ai/location/sources/, src/lib/location/flow.test.ts, src/lib/location/links.test.ts
- TDD: required — 사용자가 `.env.local`에 열쇠를 넣은 뒤. 종류마다 한 번씩 불러 답을 저장소 밖에 받고, 이름·주소를 지어낸 값으로 바꿔 잘라 가짜 응답을 고친다(시험이 먼저 깨짐) → 읽는 코드를 고친다. 확인할 것 1~6을 design.md에 적는다. 네이버 링크 둘을 사용자에게 눌러 보게 해 하나로. 지도·하늘 사진·로드뷰를 띄워 CSP 위반 기록을 모아 TASK-48에 넘긴다. 열쇠는 대화·로그·파일·가짜 응답에 남기지 않는다
## Phase 6 — 마무리 (1명, 이 기능의 유일한 검토)
## TASK-48: 전체 검사·화면 사진 확인·독립 검토 한 번
- REQ: REQ-7901, REQ-7914, REQ-7916 · AC-7901.4, AC-7914.2, AC-7916.2
- Files: src/components/location/**, src/components/dashboard/location/**, src/lib/csp.ts, src/lib/csp.test.ts
- Tests: src/components/location/, src/components/dashboard/location/, src/lib/csp.test.ts
- TDD: exempt — 전체 검사(`npm test`·`npm run lint`·`npm run build`·tsc, ssk-finish-check — 이 PC에서 원래 나는 실패는 known-failures와 견줌), 화면 사진 확인(ssk-screen-check: 로그인 없는 하네스, 1440·1024, 가짜 자료, 시안 사진과 견줌, 폰 폭 사진 없음), TASK-47이 넘긴 CSP origin 고침. 그다음 독립 검토 한 번(코드를 주고 결론은 주지 않음). 고칠 것이 Files 밖이면 명세를 고친 뒤 한다
