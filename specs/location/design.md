# 설계: 입지 분석

> 값과 동작의 기준은 requirements.md다. 이 문서는 어디에 무엇을 두는지와 정한 값을 적는다. 화면 자리는 승인된 시안(`docs/mockups/location/`, 2026-11-22·승인 2·승인 3)을 따르고, 화면 글은 requirements.md '화면 글 기본값'이 먼저다. ADR 글은 16절(TASK-1이 `docs/ADR.md`로 옮김). '(Claude 판단)'은 고쳐도 되는 값이다. 진짜 열쇠 결과(확인할 것)는 17절, 의원 과목 고르기는 18절, 분석 근거 보이기는 19절(2026-11-22 명세 고침: 승인 3 + TASK-47 결과 + 합칠 때 모은 어긋남).

## 1. 한눈에
```
[관리자 PC 브라우저] /location ─ LocationScreen ─ useLocation
   ├ 저장: lib/storage/location.ts → Supabase(RLS: 내 병원 + admins 줄) 표 여섯 · Storage location-photos
   ├ 바깥 자료: components/location/clients.ts → POST /api/ai/location/query {kind, …}
   │    └ 서버: guard(관리자 확인) → registry[kind] → sources/*.ts(요청 만들기·답 읽기, 순수) → fetchSource(정해 둔 host)
   │          열쇠 DATA_GO_KR_KEY · KAKAO_REST_KEY(서버 환경 변수) · DB 쓰기 없음 · 카카오 답 담아 두지 않음
   ├ 정적 파일(public/): /location/dongs/<시군구>.json(동 경계) · /location/transit/bus/<시군구>.json·rail.json(정류장·역 좌표)
   ├ 모으기: lib/location/collect.ts(부르는 함수를 받는 순수 흐름) → 그날 값(snapshot) → 후보 줄에 저장
   ├ 계산: lib/location/{score,flags,costs,schedule,hours,facts,explain,depts,…}.ts (순수) · 글 한 곳: sources.ts·method.ts
   ├ 설정: location_settings.score_rule(점수) · dept_rule(의원 과목 고르기, 18절)
   └ 지도: 카카오 지도 SDK(NEXT_PUBLIC_KAKAO_MAP_KEY) — /location 경로만 CSP·Referrer 넓힘
[대시보드(관리자)] useLocationWatch → 30일 넘은 후보 → query clinic-license → location_events → 한 줄 알림
```
- 서버 코드는 `src/app/api/ai/location/` 아래만 늘고, 새 파일 첫 줄은 `import 'server-only'`(boundary.test AC-513.2). Claude는 부르지 않는다(ADR-042).
- `src/lib/location/`은 순수 함수만 둔다(supabase·React·Next·fetch·브라우저 저장소·console 없음, `source.test.ts`가 소스 글자로 본다). 환자 자료 구역이 아니다(환자 자료 없음). 날짜는 `lib/analytics/dates.ts`만 부른다.

## 2. 파일
| 곳 | 내용 |
|---|---|
| `src/types/location.ts` | 종류·몸통·답(`QueryKind`·`Query`·`QueryReply`)·그날 값(`Snapshot`·`Got`)·표 줄 모양 |
| `src/lib/location/query.ts` | 종류 목록·몸통 검사 `checkQuery`(화면·서버 같이 씀) |
| `src/lib/location/sources.ts` | `SOURCES`(출처)·`LAW_BASIS`(법 근거)·`MISSING`(없는 자료 글) — 한 곳 |
| `src/lib/location/{coords,regions,area,money}.ts` | EPSG:5174 바꾸기·거리·거리 글자(`distText`)·표본 점·동 찾기·동 몫·코드 만들기·옛 구 묶음(`OLD_SGG_GROUPS`, 5절)·평/㎡·돈 글자(`wonText`·`manText`) — 거리·평·돈은 이 넷에만 두고 다른 파일은 불러 쓴다 |
| `src/lib/location/depts.ts` | 과목 스물하나(`DEPTS`)·처음 설정(`DEFAULT_DEPT_RULE`)·검사(`checkDeptRule`·`fillDeptRule`)·대표 과목(`deptOf`·`deptOfText`)·짧은 이름 글(`rivalShortText`) — 18절 |
| `src/lib/location/facts.ts` | 후보 한 곳 → 점수 값(`scoreFactsOf`)·위험 신호 입력(`flagInputOf`)·후보 매물(`candidateListing`)·보이는 값(`shownValue`·`shownAsOf`·`sourceAsOf`) — 화면·견주기·보고서가 같이 쓰는 한 곳(옛 `detail/frame/facts.ts`를 옮김, `snapshot.ts`의 `snapshotFacts`는 지움) |
| `src/lib/location/explain.ts` | 점수 풀이(후보 올린 것 3·내린 것 3과 견줄 값, 훑기 1·1) — 19절 |
| `src/lib/location/method.ts` | 분석 방법 글 한 곳(처음 안내·'이렇게 봤어요' 열셋·보고서 둘째 장 표)과 표시 채우기(`fillHow`) — 19절 |
| `src/lib/location/{score,flags}.ts` | 점수·위험 신호 |
| `src/lib/location/{costs,schedule,checklist,hours,links,watch,listings}.ts` | 비용·일정·점검 항목·진료 시간 빈틈·바깥 링크·알림 판정·매물 견주기 |
| `src/lib/location/{collect,snapshot}.ts` | 자료 모으기 흐름·그날 값 검사·크기 줄이기 |
| `src/lib/location/flow.ts` | 승하차 잇기: 정류장 ID → 이름(`flow-bus`·`flow-rail`) → 좌표 파일 → 범위 안 하루 평균 합(TASK-23) |
| `src/lib/location/data/` | `income.json`(시군구 평균 소득)·`industry.json`(시군구 산업단지 고용 인원)·읽기 `index.ts`(TASK-30) |
| `public/location/dongs/` | `index.json` + `<시군구 5자리>.json`(TASK-30) |
| `public/location/transit/` | `index.json` + `bus/<시군구 5자리>.json`(버스 정류장 좌표 15067528) + `rail.json`(도시철도역 좌표 15013205)(TASK-30) |
| `src/lib/storage/location.ts` | 표 여섯 읽기·쓰기 + 사진 올리기·지우기 |
| `src/app/api/ai/location/{guard,fetchSource,registry}.ts` | 관리자 확인·바깥 부르기·종류 → 읽는 곳 |
| `src/app/api/ai/location/sources/{kakao,people,homes,trades,clinics,clinicHours,nonpay,licenses,buildings,stores,facilities,flow,welfare}.ts` | 묶음마다 `Adapter`(요청 만들기·답 읽기, 순수). 묶음 = 4절 표의 종류 묶음(TASK 하나씩) |
| `src/app/api/ai/location/{query,keys}/route.ts` | `POST` 바깥 자료 · `GET` 열쇠 상태 |
| `src/components/location/map/**` | 카카오 SDK 불러오기·지도·하늘 사진·로드뷰 |
| `src/components/location/{common,sources,start}/**`·`clients.ts` | 숫자 칸·출처 줄·자료 없음 글 · 근거와 출처 · 처음/열쇠 없음 · 부르기(같은 origin, `redirect: 'error'`) |
| `src/components/location/{weights,scan,detail,listings,add,compare,report,prep,method,kinds}/**` | 화면 부품(props·콜백만). `method/` = 처음 안내 장·[분석 방법] 판, `kinds/` = 의원 과목 고르기 판, `detail/rivals/`에 둘레 다른 과 의원 묶음, `common/`에 '이렇게 봤어요' 한 줄(`HowLine`) |
| `src/components/location/{LocationScreen.tsx,useLocation.ts}`·`src/app/(app)/location/page.tsx` | 잇기·페이지 |
| `src/components/dashboard/location/**` | 대시보드 알림 |
| `src/lib/csp.ts`·`next.config.ts` | `/location`만 카카오 origin·Referrer |
| `src/lib/auth/gate.ts`·`src/components/shell/{menu,MoreMenu,TabBar,AppShell}` | 관리자 경로·관리자에게만 탭 |
| `supabase/migrations/20261122000000_location.sql`·`supabase/location.rls.test.ts` | 표·권한·사진 칸 |
| `fixtures/location/api/<묶음>/`·`fixtures/location/dongs/` | 가짜 응답(지어낸 이름만)·동 경계 견본 |

`SOURCES` 칸: `id` · `org`(기관 — 통계청은 '국가데이터처') · `name` · `url`(자료 쪽) · `via`(`api`·`file`·`link`·`app`·`user`) · `key`(`data`·`kakao`·null — 사람 흐름 자료가 다른 열쇠를 쓰면 그때 더함) · `cycle` · `unit` · `terms`(이용 조건·출처 문구) · `why`(왜 보나) · `noneText`(없을 때 글) · `checked`(`직접`·`검색만`). `LAW_BASIS` 칸: `id`·`law`·`article`·`summary`·`url`(국가법령정보센터 `https://www.law.go.kr/법령/<법 이름>/<조>`)·`checked`. 값은 조사 1~3·5 표 그대로. `LAW_BASIS` id 아홉(TASK-3이 정함): `open`(의료법 33조·시행규칙 25·34조) · `xray`(의료법 37조·방사선 안전관리 규칙 3·4조·별표 2) · `bf`(장애인등편의법 시행령 별표 1·2) · `use`(건축법 시행령 별표 1 3호 라목) · `violation`(건축법 79조) · `bizreg`(소득세법 168조·부가가치세법 8조) · `nhis`(국민건강보험법 43조·시행규칙 12조) · `catchment`(진료권 연구 이선경 외 2009) · `lease`(상가건물 임대차보호법 10·11조). 쉬운 한 줄은 requirements '화면 글 기본값'. 출처 id도 TASK-3이 정함: 카카오 `kakao-local` · 건축물대장 `building` · 좌표 파일 `bus-stops`·`rail-stations` · `dongs`·`income`·`industry` · 나머지는 종류 이름 그대로(`welfare` 포함).

## 3. 서버 경로
- `POST /api/ai/location/query`(`runtime = 'nodejs'`, `maxDuration = 120` — Vercel 무료판 최대 300초 안, 다른 AI 경로와 같은 값. 비급여 한 번 60초 + 의원 목록 과목 열아홉을 둘씩 부를 시간): `guard` → 몸통 `checkQuery` → `registry[kind]` → 열쇠 확인 → `adapter.requests(q)`(열쇠는 받지 않음, `fetchSource`만 넣음) 차례로 `fetchSource(req, key, adapter.timeoutMs)` → `adapter.parse(texts, q, today)` → `{ ok: true, value, src, asOf }`. 답 머리 `Cache-Control: no-store`.
- 시간 한도(requirements 이 명세가 정한 것 17): 바깥 부르기 기본 8초, `Adapter.timeoutMs`가 있으면 그 값(비급여 `nonpay` 60,000). 브라우저 `clients.ts` `queryLocation` 한도는 종류마다 — 기본 10초 · `hosp-list` 60초 · `nonpay` 70초(서버 한도보다 길게) · `clinic-license` 120초(3년 30쪽을 둘씩 쪽마다 8초 = 최대 120초, 서버 경로 한도와 같음 — TASK-83).
- `GET /api/ai/location/keys`: `guard` → 열쇠마다 비었으면 `missing`, 있으면 작은 부르기 하나(카카오 `k-address` '서울특별시청', 공공 `pop-age` 행정동 하나 `1111051500`·`2025-10` — 처음엔 `household`였으나 활용신청 전 미등록 답이 '열쇠가 맞지 않아요'로 잘못 보여 바꿈)로 `ok`·`rejected`(401·403·미등록 코드)·`failed`.
- `guard.ts`: `readMe()` → 로그인 안 함 401, `hospital?.status !== 'approved' || !isAdmin || desk` 403. 둘 다 몸통 없음, 바깥 부르기 전.
- `fetchSource.ts`: host 허용 `dapi.kakao.com`·`apis.data.go.kr`·`api.data.go.kr`·`api.odcloud.kr` — 그 밖은 부르지 않음(사람 흐름도 `apis.data.go.kr`, 조사 4 · 의료급여·차상위 `welfare`는 `api.odcloud.kr`, 조사 5). `redirect: 'error'`, 8초, 2,000,000바이트, 브라우저 모양 UA, 카카오는 `Authorization: KakaoAK <키>`, 공공은 `serviceKey=<디코딩 키>`(URLSearchParams가 인코딩). 결과 `{ ok: true, text } | { ok: false, fail: 'http' | 'timeout' | 'too-big' | 'blocked-url' }`.
- 공공데이터포털 미등록 열쇠 답(`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`·`resultCode` 20·30 등)은 `not-applied`, 열쇠 거절은 `no-key`가 아니라 `failed`로 보고 `keys`가 `rejected`를 알린다. 진짜 미등록 답은 **HTTP 403(또는 401) + JSON 몸통**이다(TASK-47) → `fetchSource`는 공공 열쇠의 401·403 답이면 몸통(2MB 한도 그대로)을 읽어 `isNotRegistered`면 `{ ok: false, fail: 'not-applied' }`, 아니면 `fail: 'http'`. 경로는 `not-applied`를 `failed`보다 먼저 돌려준다.
- 서버는 아무것도 담아 두지 않는다(메모리 보관 없음). 역·정류장 좌표는 정적 파일이다. 카카오 답은 어디에도 담아 두지 않는다.
- 로그: `console.error('[api/ai/location]', code, kind)`만(`E-LOC-SOURCE`, 활용신청 안 됨은 `not-applied`). 좌표·주소·답 글자·열쇠 없음.
- 하위 부르기: 한 요청 안 하위 부르기는 종류마다 정한 쪽 수까지(아래 표 '쪽'), 동시에 2개.

## 4. 자료 종류 (`QueryKind`)
`Adapter = { kind; src: SourceId; key: 'data' | 'kakao'; timeoutMs?: number; requests(q): SiteRequest[]; parse(texts: string[], q, today): Parsed }`(열쇠는 `fetchSource`만 넣는다). 점은 `{ lat: 33~39, lng: 124~132 }`(소수 6자리), r은 m. `SourceId`는 `types/location.ts`에서 `string`이다(`SOURCES`에 있는 id인지는 시험이 본다 — 두 파일을 같은 Phase에 따로 만들려고).
- 묶음 → 파일: `kakao`(k-*) · `people`(pop-age·household) · `flow`(flow-volume·flow-bus·flow-rail) · `homes`(apt-list·apt-info·presale) · `trades`(apt-trade·biz-trade) · `clinics`(hosp-list·hosp-detail) · `clinicHours`(hosp-hours) · `nonpay` · `licenses`(clinic-license) · `buildings`(bld-title·bld-floor) · `stores` · `facilities`(market·senior·gym·accident·school) · `welfare`. 산업단지 이름·위치는 카카오 묶음. 종류는 모두 28개.

| 종류 | 열쇠 | 자료(data.go.kr 번호) | 넣는 값 | 내놓는 값 (쪽) | 그날 값에 |
|---|---|---|---|---|---|
| `k-address` | kakao | 카카오 주소 찾기 | `q` 2~100자 | 점·도로명·지번·법정동 코드·본번·부번·산 10개 | 안 넣음 |
| `k-point` | kakao | 좌표→주소·지역 코드 | 점 | 도로명·지번·법정동·행정동 코드·본번·부번·산 | 안 넣음 |
| `k-near` | kakao | 카테고리 장소 | 점·r ≤ 20,000·`SW8`·`MT1`·`PM9`·`HP8`·`AG2`(학교는 공공 `school`) | 이름·분류·점·거리 45개·`capped` (3) | 안 넣음 |
| `k-keyword` | kakao | 키워드 장소 | 점·r·`산업단지`만 | 같음 (3) | 안 넣음 |
| `pop-age` | data | 행정동 성·연령 인구 15108072 | 행정동 코드 1~40·연월(2022-10~) | 동마다 10세 나이대 11칸(100세 이상 포함) | 넣음 |
| `household` | data | 행정동별(통반단위) 주민등록 인구 및 세대현황 **15108065**(행정동판 `admmPpltnHhStus/selectAdmmPpltnHhStus`·`admmCd`, 활용신청 2026-11-22) | 같음 | 동마다 세대 수 | 넣음 |
| `flow-volume` | data | 국토교통부 정류장별 이용량 15142066(`TripVolumebyStop/getMonthlyTripVolumebyStop`) | 시도·시군구 번호·연월·`part`(0부터, 10쪽 = 1만 줄 묶음) | 정류장 ID(8자리)·버스/지하철·한 달 승차·하차·날 수 + `part`·`parts`·`total` (10) | 범위 안 하루 평균 |
| `flow-bus` | data | 국토교통부 버스정류장 15142032(`BusStop/getBusStop`) | 시군구 번호·`ym`(그 달 1일로 보냄, 없으면 바깥이 52) | 정류장 ID·이름·ARS 번호 (20) | 잇기에만 |
| `flow-rail` | data | 국토교통부 도시철도 노선별 경유역 15142034 | 시군구 번호·`ym` | 역 ID·역 이름·노선 (5) | 잇기에만 |
| `accident` | data | 교통사고다발지역 15029185 | 시도·시군구 이름 | 지점 이름·사고 수·점 (5) | 범위 안 수·사고 합 |
| `apt-list` | data | 공동주택 단지 목록 15057332 | 법정동 코드 | 단지 코드·이름 (3) | 넣음 |
| `apt-info` | data | 공동주택 기본 정보 15058453 | 단지 코드 | 세대 수·사용승인일·동 수 | 넣음 |
| `presale` | data | 청약홈 분양정보 15098547 | 시도 이름·기간 | 단지 이름·세대·입주 연월·주소 (3) | 넣음 |
| `apt-trade` | data | 아파트 매매 실거래 15126468 | 시군구 5자리·연월 | 법정동 이름·㎡·만 원·층·날 (5) | 범위 법정동 ㎡당 평균·건수 |
| `biz-trade` | data | 상업업무용 매매 15126463 | 같음 | 법정동 이름·용도·㎡·만 원 (3) | 같음 |
| `stores` | data | 상가(상권)정보 15012005 | 점·r 30~2,000 | 가게 이름·업종·층·점 1,000개 (10) | 층마다 가게 수 |
| `bld-title` | data | 건축물대장 표제부 15134735 | 시군구 5·법정동 5·본번·부번·대지 구분 | 용도·구조·지상/지하 층수·연면적·사용승인일·승강기·주차 | 넣음 |
| `bld-floor` | data | 건축물대장 층별개요 15134735 | 같음 | 층마다 이름·용도·㎡ (3) | 넣음 |
| `hosp-list` | data | 심평원 병원정보 15001698 | 점·r·`group`: `clinic`(의원, + `depts` 과목 id 1~19 — 과목마다 한 목록) · `dental`(치과의원 종별 51) · `korean`(한의원 93) · `big`(종합병원 이상) | 기호·이름·종별·찾은 과목 목록(`depts`)·의사 수·개설일·점(심평원 좌표)·주소, `capped` (과목마다 1, 19까지) | 넣음 |
| `hosp-detail` | data | 심평원 상세정보 15001699 | 기관 기호 | MRI·CT 있음·물리치료사 수(없으면 null) | 넣음 |
| `hosp-hours` | data | 국립중앙의료원 병·의원 15000736(목록 조회 `getHsptlMdcncListInfoInqire` — 위치 조회 답에는 요일 칸이 없음) | `sidoName`·`sggName`(동 경계 목록 이름, 카카오 아님) | 이름·점·요일 7칸 + 공휴일 [열·닫] 분 (의원 C 3쪽 + 한의원 G 1쪽 + 치과의원 N 1쪽) | 넣음(맞춘 의원에) |
| `nonpay` | data | 심평원 비급여 15001700 | 기관 기호·항목 코드(체외충격파 `SZ084`) | 항목 이름·값(원) + 도수치료 줄(`MX122…` 또는 이름 `도수치료`, 없으면 null) (1, 300줄, 60초) | 넣음 |
| `clinic-license` | data | 행안부 건강_의원 15154874 | `open`·`close`·기간(최대 3년)·선택 `addr`(`'{시도} {시군구}'`, 도로명 주소 앞부분으로 거름 — 전국 3년은 3,000줄 한도를 넘음) | 이름·과목 글·업태 글·인허가일·폐업일·주소·점(5174→WGS84) (30, 100줄씩) | 3년 개폐업·알림 줄 |
| `gym` | data | 생활_체력단련장업 15155077 | 시군구 이름·선택 `sidoName` | 이름·영업 상태·점(5174→WGS84) (5) | 범위 안 수 |
| `senior` | data | 마을회관·경로당 15114136 | 시도·시군구 이름(시도 꼭 — 아래 17절 10) | 이름·점 (5) | 범위 안 수 |
| `market` | data | 전통시장 15012894 | 시도·시군구 이름(시도 꼭 — 아래 17절 10) | 이름·점 (3) | 가장 가까운 시장·거리 |
| `school` | data | 전국초중등학교위치표준데이터 15021148 | 시도·시군구 이름(시도 꼭 — 아래 17절 10) | 학교 이름·급(초·중·고)·점 (5) | 범위 안 수 |
| `welfare` | data | 한국사회보장정보원 복지사업 시군구별 수급권자 현황 15062448(`api.odcloud.kr/api/15062448/v1/<해마다 판>`, 판에 코드 칸 없음) | 시군구 5자리·`sidoNames`(1~2, 전남광주는 옛 둘)·`sggNames`(1~4, 옛 구 묶음이면 옛 이름들) — 이름으로 찾아 줄들을 더함 | 그 시군구(또는 옛 구 묶음) 값: 이름·기준 연월·기초 의료급여·기초생활보장 합계·차상위 본인부담경감·자활·장애인 수급권자 수 (1, 한 쪽에 전국 줄) | 넣음(+ 인구) |
- 소득(`income`)·산업단지 고용 인원(`industry`, 한국산업단지공단 전국산업단지현황통계 15085886, 분기, 단지 소재지를 시군구로 묶어 합)은 파일로 받은 값을 앱에 둔다(부르기 없음). 하루 이용률 파일(15072876)·직원 월급 자료(실태조사·구인 시세)는 쓰지 않는다(사용자가 뺌 2026-11-22).
- `hosp-hours`는 이름(공백·'의원' 빼고 같음)과 50m 안으로 `hosp-list`에 맞춘다. 못 맞추면 진료 시간 없음. 목록 조회라 후보 범위가 닿는 시군구(`sggsTouching`, 4곳까지)마다 한 번 부른다(TASK-47: 옆 시군구 의원을 못 맞춘 일 — 30곳 가운데 25곳만 맞음).
- 과목: 의원 과목 고르기(18절)를 따른다. 모으기는 '안 보기'가 아닌 과목을 모두 부른다(`hosp-list` `clinic` + `depts`, 치과의원 `dental`, 한의원 `korean`). 의원마다 상세(`hosp-detail`)·진료 시간·비급여는 **모을 때 경쟁 과목인 의원만** 부른다(하루 한도). 큰 병원은 카카오 `HP8` 분류 글·이름(`종합병원`·`대학병원`·`대학교병원`·`상급종합`, TASK-44).
- 사람 흐름(사용자 2026-11-22 '승하차만, 전국', 조사 4, 이용허락범위 제한 없음): 후보 저장·[오늘 값으로 다시 받기] 때만 부른다(동네 훑기·화면 열기에는 안 부름 — 개발 계정 하루 1,000번). 후보 시군구의 지난달(없으면 두 달 전까지) 한 달 치를 `flow-volume`으로 받고 → `flow-bus`·`flow-rail`로 이름을 붙이고 → 정류장은 ARS 번호, ARS가 빈 곳은 이름(공백 빼고 같음)+시군구로, 역은 역 이름(괄호·'역' 빼고)+노선으로 좌표 파일에 잇고 → 범위 안 정류장·역마다 하루 평균(승차+하차)÷날 수 버림을 더한다(`lib/location/flow.ts`). 한 모으기 안에서 같은 시군구·같은 달은 한 번만 받는다. 후보 시군구에 정류장 좌표 파일이 없으면(버스정보시스템 없는 군 지역) `why: 'outside'` → `이 지역은 자료 없음`. 한 부르기는 10쪽(1만 줄) 묶음 하나다 — 모으기는 달마다 `part: 0`을 부르고 답의 `parts`만큼 `part` 1…parts−1을 더 불러 이어 붙인다(종로 한 달 41,700줄 = 5묶음, 최신 달은 보통 두 달 전). `parts`가 12를 넘으면 `failed`. 화면 글 `교통카드 찍은 사람 수예요(걷는 사람 수와 달라요)`. 점수는 교통·흐름 세부 `t-flow`(후보만, 8절).
- 가장 가까운 역·400m 안 정류장 수는 부르지 않고 좌표 파일(`rail.json`·`bus/<시군구>.json`, 경계 근처는 `sggsTouching`으로 이웃 시군구도)에서 센다.
- 의료급여·차상위(사용자 2026-11-22, 조사 5, 이용 제한 없음): 후보 저장·[오늘 값으로 다시 받기] 때 후보 시군구 하나만 받는다(동네 훑기에는 안 부름). 판은 해마다 하나(최신 2025-12 기준, `uddi:b4960581-6aa1-4317-a2a6-d3f947573f24`)라 가장 새 판 주소 하나를 상수로 두고 고친다. 판에 시군구 코드 칸이 없어 시도+시군구 이름으로 찾는다(전라북도·전북특별자치도 둘 다, 일반구까지, 전남광주통합특별시는 옛 광주광역시·전라남도). 판에 없는 2026 새 시군구는 옛 구 묶음(5절 표)의 줄들을 더해 `basis: '옛 {구}'`로 담는다. 기초 의료급여는 기초생활보장 의료급여만 센다(다른 법 의료급여는 빠짐). 차상위 3종 합은 겹칠 수 있다. 비율의 인구는 그 판 기준 연월의 `pop-age`를 그 시군구 행정동 모두(동 경계 파일 목록, 40개씩)에 불러 더한 값이다(못 받으면 비율 없음).
- 비급여 견주기 항목: 체외충격파 `SZ084`(줄 코드 `SZ0840000`, 읽는 곳 `nonpay.ts`와 `collect.ts`의 `ESWT_ITEM` 둘 다 이 값 — 서버 전용 파일이라 둘에 두고 시험이 같음을 본다). 도수치료는 비급여 답에 `MX122…` 줄 또는 항목 이름 `도수치료` 줄이 있으면 `Rival.detail.manual`(원)로 담아 보이고, 경쟁 의원 모두 없으면 `도수치료는 2026년 7월부터 관리급여라 견주지 않아요`(승인된 '그대로 두기').
- **비급여가 아주 느림**(TASK-47: 1,000줄 20초 넘거나 504, 50줄도 60초쯤): 경쟁 의원마다 따로 한 번(`numOfRows` 300, `timeoutMs` 60,000), 가까운 경쟁 의원 20곳까지(넘으면 진료비 곁글 `가까운 경쟁 의원 20곳만 값을 봤어요.`), 실패한 의원은 `detail.priced = false`로 그 값만 비우고 경쟁 의원 묶음은 `ok`로 남긴다(`지금 받지 못했어요` + [다시 받기]).

## 5. 좌표 · 지역 · 넓이
- EPSG:5174: `+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43`. 횡메르카토르 역산(Bessel) → 지심 좌표 7변수 변환 → WGS84 위경도를 `coords.ts`에 직접 쓴다(새 패키지 없음). 시험 기준점 다섯은 일꾼이 저장소 밖에서 proj4로 한 번 구해 시험에 적는다(5m 안).
- 거리 `distM(a, b)` 하버사인(지구 반지름 6,371,008.8m) 버림.
- 표본 점 `samplePoints(c, r)`: r ≤ 500 → 19개(가운데 + 고리 6·12), ≤ 1,500 → 37개(+18), 그 위 → 61개(+24). 고리 반지름은 넓이가 같게 나눈다. 점 하나 넓이 = πr² ÷ 점 수.
- 동 경계 파일(TASK-30, 출처 국가데이터처 SGIS 경계 15129688): `index.json` = `{ asOf, sidos: [{ code2, name, sggs: [{ code5, name, bbox: [w, s, e, n] }] }] }`, `<code5>.json` = `{ asOf, dongs: [{ code10(행안부 행정동), name, areaM2, center: [lng, lat], rings: [[lng, lat]…][] | null, unmatched?: true }] }`. 경계는 동마다 200점 안으로 줄인다. `regions.ts`: `sggsTouching(index, c, r)`(네모 범위로 고름) · `dongOf(point, dongs)`(점-다각형) · `dongShares(points, dongs, r)` → `{ code10, share }[]`(AC-7905.3 식).
- 정류장·역 좌표 파일(TASK-30): `transit/index.json` = `{ asOf, sggs: string[] }`(정류장 파일이 있는 시군구), `bus/<code5>.json` = `{ asOf, src, stops: [{ no, name, ars: string | null, lng, lat }] }`(정류장 시군구는 동 경계로 나눔), `rail.json` = `{ asOf, src, stations: [{ name, line, lng, lat }] }`. KTX·일반 기차역은 없다.
- 행정동·법정동 잇기: 행정동은 동 경계 파일, 법정동은 표본 점 가운데 19개까지 `k-point`(그때만, 저장 안 함). 시군구 5자리 = 두 코드의 앞 5자리. 실거래는 시군구로 받아 법정동 이름으로 거른다. 인구는 행정동, 단지·실거래는 법정동 기준이라 화면 칸 아래 기준을 적는다.
- 건축물대장 열쇠: 시군구 = 법정동 코드 앞 5, 법정동 = 뒤 5, 번 = 본번 4자리(앞 0), 지 = 부번 4자리, 대지 구분 = 산이면 `1` 아니면 `0`. PNU = 법정동 코드 10 + (산 `2` / 아님 `1`) + 본번 4 + 부번 4.
- 넓이(`area.ts`, TASK-5가 정함): 평 = ㎡ × 121 ÷ 400. 저장은 ㎡(numeric(8,2), 소수 2자리 버림), 입력은 평·㎡ 고르기. 화면 평 `m2ToPyeong` = 저장한 ㎡ 이상 ~ 0.01㎡ 더한 값 미만에서 가장 큰 0.1평(30평으로 적으면 99.17㎡로 저장되고 다시 `30평`으로 보임 — 그냥 버리면 29.9평). 화면 `areaText` `{평}평 ({㎡}㎡)`, 끝 0 뺌(`30평 (99.17㎡)`·`30.1평 (99.8㎡)`). 평당 값(월세·인테리어)의 평도 `m2ToPyeong`이다.
- 거리 글자 `distText`(`coords.ts`): 1,000m 미만 `{m}m`, 이상 `{0.1km 버림}km`(끝 `.0` 뺌).
- 돈 글자 `wonText`: 10,000원으로 나눠떨어지고 1,000,000원 이상이면 `n억 m만 원`(0인 쪽 뺌), 아니면 `#,###원`(`780,000원`·`0원`, 음수는 `−`). 값이 없으면 `–`. 계산은 늘 원 정수. 쉼표는 `commaText`.
- 만 원 칸 금액 글 `manText`(시안 `man()`, requirements 이 명세가 정한 것 20): 0이면 `없음`, 10,000원으로 나눠떨어지면 `n억 m만 원`(`78만 원`·`1억 원`·`1억 5,000만 원`), 아니면 `wonText`. 값이 없으면 `–`. 쓰는 곳 = 매물 보증금·월세·권리금·관리비, 개원 비용 칸·합계 판(처음에 드는 돈·내 돈·한 달 고정비·6개월 고정비), 협상표 참고 글, 견주기·보고서의 같은 값, 점수 풀이 `k-deposit`·`k-premium`. 평당 값·한 달 이자·인테리어 합계(평 × 평당)·원 칸(체외충격파·환자 1명당 평균 수입)은 `wonText`.
- **2026 행정 개편**(행안부 2026-10-31 코드, TASK-30·47): 광주광역시(29xxx)·전라남도(46xxx) → 전남광주통합특별시(`12xxx`) · 인천 중구 28110·동구 28140·서구 28260 → 제물포구 28125·영종구 28155·서해구 28275·검단구 28290 · 화성시 41590 → 일반구 넷 41591·41593·41595·41597. 동 경계·정류장 파일·행정동 코드·카카오·심평원·국립중앙의료원·실거래 `LAWD_CD`는 새 코드·새 이름이 된다. 옛 이름만 아는 자료: 청약홈 공급지역(`광주`·`전남` 둘을 부름, homes.ts) · 의료급여 판(옛 시도·시군구 이름) · 소득·산업단지 고용 파일(인천 새 구 넷은 `자료 없음`).
- 옛 구 묶음 `OLD_SGG_GROUPS`(`regions.ts`, 의료급여에 씀): 새 구 하나는 아래 묶음 하나에 들고, 값 = 옛 구 줄의 합, 비율 인구 = 묶음 새 시군구 행정동 모두의 `pop-age` 합, 글 `옛 {옛 이름 ·로 이음} 기준`.

| 새 시군구 | 옛 구(판에서 찾는 이름) | 글 |
|---|---|---|
| 제물포구 28125 · 영종구 28155 | 인천광역시 중구 · 동구 | `옛 중구·동구 기준` |
| 서해구 28275 · 검단구 28290 | 인천광역시 서구 | `옛 서구 기준` |
| 화성시 41591·41593·41595·41597 | 경기도 화성시 | `옛 화성시 기준` |

## 6. 그날 값 · 저장하는 것
```ts
type Why = 'no-key' | 'not-applied' | 'failed' | 'none' | 'outside'
type Got<T> = { ok: true; v: T; src: SourceId; asOf: string }
            | { ok: false; why: Why; src: SourceId; prev?: { v: T; asOf: string } }
type DeptId = (DEPTS)[number]['id']   // 18절, 과목 스물하나
type Rival = { name: string; depts: DeptId[] /* 찾은 과목(DEPTS 차례) — 대표 과목은 늘 deptOf(이름, depts, 설정)로 센다 */
  at: Point /* 심평원 좌표(공공) */; distM: number; sameBuilding: boolean /* 30m 안 */; address: string /* 심평원 주소, 30m 안 의원만, 아니면 '' */
  doctors: number | null; openedYear: number | null
  detail?: { therapists: number | null; mri: boolean | null; ct: boolean | null
    week: ([number, number] | null)[] | null /* 월~일 + 공휴일 8칸, 분 */
    priced: boolean /* 비급여를 받았나 — false면 아래 둘은 '지금 받지 못했어요' */; eswt: number | null; manual: number | null /* 도수치료 1회 값 */ } }
// detail은 모을 때 경쟁 과목이던 의원만 — 없으면 '새로 경쟁에 넣은 과목'(AC-7921.5)
type Snapshot = { v: 1; at: string; radiusM: number
  people: Got<{ total: number; bands: number[] /* 11칸 */; households: number; unmatched: number }>
  trend: Got<{ ym: string; total: number }[]>        // 2022-10~ 해마다 10월
  flow: Got<{ ym: string; stations: { name: string; line: string; distM: number; perDay: number }[]   // 범위 안 하루 평균 승하차
    stops: { name: string; distM: number; perDay: number }[]; total: number; unmatched: number }>     // 60개씩까지, unmatched = 좌표를 못 이은 정류장 수
  income: Got<{ sggName: string; won: number; year: number; sidoName: string | null; sidoWon: number | null }>  // sidoWon = income.json 시·도 평균(사용자 2026-11-23)
  aptPrice: Got<{ perM2: number; deals: number }>; bizPrice: Got<{ perM2: number; deals: number }>   // 지난 6달
  apts: Got<{ name: string; households: number; builtYear: number | null; bdongName: string }[]>  // 60개까지 · bdongName은 공공 답(공동주택 단지 목록·기본 정보의 읍면동 이름)에서만 — 카카오 주소 글에서 떼지 않는다(ADR-044, 검토 2026-11-23)
  presale: Got<{ name: string; households: number; moveIn: string }[]>                              // 30개까지
  seniors: Got<number>; gyms: Got<number>; schools: Got<number>; accidents: Got<{ spots: number; cases: number }>
  industry: Got<{ sggName: string; employees: number; parks: number; quarter: string }>; pharmacies: Got<number>  // 약국 = 후보 30m 안(상가정보)
  rivals: Got<Rival[]>                               // 이름은 옛 그대로지만 '안 보기'가 아닌 모든 과목 의원(한의원·치과 포함), 가까운 차례 200곳까지
  place: Got<{ sido: string; sidoName: string; sgg: string; sggName: string; dong: string | null; dongName: string | null }>  // 후보 점의 행정동(동 경계 파일, src 'dongs')
  sggAvg: Got<SggAvg>                                // 점수 풀이 견줄 값(19절, src 'pop-age')
  history: Got<{ kind: 'open' | 'close'; name: string; dept: string; on: string; distM: number }[]>  // 3년, 60개까지
  station: Got<{ name: string; line: string; distM: number; at: Point }>; bus: Got<number>;  // 좌표 파일에서(at = rail.json 좌표)
  market: Got<{ name: string; distM: number }>
  building: Got<{ usage: string; structure: string; above: number; below: number; totalM2: number; approvedOn: string | null
    elevators: number | null; parking: number | null; floors: { label: string; usage: string; m2: number }[] }>
  stores: Got<{ floor: string; count: number }[]>    // 후보 30m 안 가게를 층마다
  welfare: Got<{ sggName: string; ym: string; medical: number; basic: number; nearPoor: number  // 후보 시군구, nearPoor = 차상위 3종 합
    population: number | null                       // 같은 연월 주민등록 인구(4절), 없으면 비율 없음
    basis: string | null }>                         // 옛 구 묶음이면 '옛 중구·동구' 모양(5절), 아니면 null
}
```
- `snapshot.ts`: `checkSnapshot`(모양 — 새 칸 `place`·`sggAvg`·`Rival.at`·`Rival.detail`·`station.at`·`welfare.basis`도 본다) · `fitSnapshot`(65,536바이트 안: 목록을 뒤에서부터 줄임 — 의원 목록은 `detail`이 없는 먼 의원부터) · `mergeSnapshot(new, old)`(새로 실패한 칸은 옛 값을 `prev`로) · `welfareRate`(비율 셈 한 곳 — 화면 `detail/people`도 이것을 부른다). `snapshotFacts`는 지우고 `facts.ts` `scoreFactsOf` 하나로 센다(TASK-44가 화면을 이것으로 맞춤: 새 의원 기준은 개설 연도 `> 올해 − 3`, 경쟁 0곳이면 빈틈 칸 = 모든 칸).
- 의원 목록 200곳: 받은 목록이 200곳이면 화면이 `200곳 넘게 있을 수 있어요. 가까운 200곳만 셌어요.`를 붙인다(따로 표시 칸 없음). 경쟁 과목 의원(`detail` 있음)은 줄이지 않는다.
- **저장하는 것**(ADR-044): 사용자가 고른 후보 점·적은 이름·적은 주소 글·범위 · 붙여 넣은 매물 · 메모 · 점검표·건물 요건(어떻게 알았나 글 포함)·위반 건축물·간판 고름 · 비용 · 무게 · 의원 과목 고르기 · 협상표·임대 조건 메모 · 일정 다 함 표시 · 사진 · 지금 의원 체외충격파 값 · 위 그날 값(공공 자료로 만든 숫자, 심평원 의원 좌표·주소, 좌표 파일의 역 좌표, 동 경계 파일의 행정동 이름) · 알림 줄(행안부 공공 자료).
- **저장하지 않는 것**: 카카오에서 받은 주소 글·좌표·장소 목록·거리·로드뷰·법정동 코드, 동네 훑기 결과, 보고서.

## 7. DB (`supabase/migrations/20261122000000_location.sql`, 사용자가 SQL Editor에 붙여 넣음)
본보기 `20261121000000_contacts.sql`(머리 주석 모양·`if not exists`·바깥 키 둘)과 `20261121100000_inventory.sql`(Storage). 앞에 auth·precheck_settings(`my_hospital_id`)·contacts SQL이 있어야 한다. `my_hospital_id()`는 다시 만들지 않는다. 표마다 RLS → `revoke all … from anon, authenticated` → 아래 권한만. 정책은 표마다 하나:
`for all to authenticated using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))) with check (같음)`. 데스크 정책 없음(데스크는 `my_hospital_id()`가 null).

| 표 | 칸 · 제약 | 권한(authenticated) |
|---|---|---|
| `location_settings` | `hospital_id` pk 기본 `my_hospital_id()` → hospitals cascade · `dept_rule` jsonb not null 기본 `{"v": 1, "rival": ["ortho", "ns", "pain", "rehab"], "hide": []}`(= `DEFAULT_DEPT_RULE` JSON과 글자까지 같음, ≤ 1,000바이트, 검사 함수 `location_dept_rule_ok`: `v` = 1 · `rival`·`hide`는 18절 id 스물하나 가운데 겹침·되풀이 없는 배열 · 둘 사이 겹침 없음 · 다른 열쇠 없음, create table 안에 두고 두 번 실행해도 되게 `alter table … add column if not exists`도 둠) · `score_rule` jsonb 기본 = 8절 처음 값(`{ v: 1, weights: {다섯}, bands: [4..10], items: {세부 id: {w, full} 또는 {w, best, worst}} }`, ≤ 4,000바이트, 검사 함수 `location_score_rule_ok`: 무게 정수 0~100 · 나이대 0~10 정수 1~11개 겹침 없음 · `full` 정수 > 0 · `best` < `worst` 정수) · `home_eswt` bigint 0~9,999,999,999 null · `updated_at` | select · insert·update(값 칸 — `score_rule`·`dept_rule`·`home_eswt`) |
| `location_candidates` | `id` uuid pk · `hospital_id` · `name` 1~40(빈칸 없음) · `address_note` ≤ 100 기본 '' · `lat`·`lng`(같은 범위) · `radius_m` in (300,500,700,1000,1500,2000,3000) · `status` in (`watching`,`contacted`,`visited`,`reviewing`,`dropped`) 기본 `watching` · `floor_label` ≤ 20 · `area_m2` numeric(8,2) > 0 null · `sign_visible`·`violation` in (`yes`,`no`,`unknown`) null · `costs` jsonb 객체 ≤ 2,000바이트 · `terms` jsonb 객체 ≤ 6,000(협상표 + 임대 조건 메모) · `checks` jsonb 객체 ≤ 4,000 · `open_on` date null · `tasks_done` jsonb 배열 ≤ 2,000 · `snapshot` jsonb 객체 null ≤ 65,536 · `snapshot_at` · `watch_checked_on` date null · `created_at` · `updated_at`(트리거) · unique(`hospital_id`,`id`) | select·insert·update(값 칸)·delete |
| `location_listings` | `id` · `hospital_id` · `candidate_id` null, 바깥 키 (`hospital_id`,`candidate_id`) → candidates on delete set null (`candidate_id`) · `title` 1~40 · `url` '' 또는 `^https://` ≤ 500 · `area_m2` > 0 null · `floor_label` ≤ 20 · `deposit`·`rent`·`premium`·`mgmt` bigint 0~9,999,999,999 null · `broker_id` null, 바깥 키 (`hospital_id`,`broker_id`) → `contacts_companies`(`hospital_id`,`id`) on delete set null (`broker_id`) · `broker_note` ≤ 40 · `memo` ≤ 500 · `lat`·`lng` null 짝 · 시각 둘 | select·insert·update·delete |
| `location_notes` | `id` · `hospital_id` · `candidate_id` → candidates cascade(두 칸 키) · `day` date · `body` 1~500 · `created_at` | select·insert·delete |
| `location_photos` | `id` · `hospital_id` · `candidate_id` cascade · `path` unique = `<hospital_id>/<candidate_id>/<uuid>.jpg`(검사) · `label` ≤ 40 · `taken_on` date · `created_at` · 후보마다 30줄(트리거 `location_photo_limit`, 넘으면 23514) | select·insert·delete |
| `location_events` | `id` · `hospital_id` · `candidate_id` cascade · `kind` in (`open`,`close`) · `clinic_name` 1~100 · `dept` ≤ 50 · `event_on` date · `dist_m` 0~3,000 · `seen_at` null · `created_at` · unique(`candidate_id`,`kind`,`clinic_name`,`event_on`) | select·insert·update(`seen_at`)·delete |
- Storage `location-photos`: 공개 아님, 3,000,000바이트, `image/jpeg`. `storage.objects` 정책 select·insert·delete: `bucket_id = 'location-photos'`·첫 폴더 = `my_hospital_id()::text`·관리자 줄 있음(고치기 없음). 후보를 지우면 브라우저가 사진 파일도 지운다(`removePhotos`).
- 백업 목록(`lib/backup/tables.ts`)은 아직 없다 → 생기면 여섯 표를 넣는다(그 명세가 할 일).

## 8. 점수 (`score.ts` — 기본값 `DEFAULT_SCORE_RULE`, 설정 `location_settings.score_rule`, '근거와 출처'가 그린다)
- 사용자 2026-11-22: 항목 다섯마다 [세부 ▾]를 펼쳐 **세부 무게 막대와 만점 기준 칸**을 직접 정한다(시안 승인 2). 병원마다 설정 하나, 관리자만, [기본 무게로]는 바깥 무게 다섯, 항목마다 [기본값으로]는 그 항목 세부 무게·기준(사는 사람·수요는 나이대도)을 되돌린다. 막대는 0~50, 5씩(저장 모양은 0~100 정수 — 처음 값은 모두 그 안). 동네 훑기도 같은 설정을 쓴다. 아래 처음 값은 Claude 판단이고 **시안의 숫자보다 먼저**다. 이름은 requirements '화면 글 기본값'.
- 고르는 값(`s-sign`·`s-violation`)은 `{w, full: 1}`로 두고 기준 칸 없이 글만 보인다. `p-welfare`만 방향을 고른다: `{w, full}`(많을수록) 또는 `{w, best, worst}`(적을수록) 둘 다 받는다(`checkScoreRule`·`fillScoreRule`이 이 id만).
- 세부 점수: **많을수록 좋음**(기준 하나 `full`) = 버림(min(100, max(0, 값) × 100 ÷ full)). **적을수록 좋음**(기준 둘 `best` < `worst`) = 값 ≤ best → 100, 값 ≥ worst → 0, 그 사이 버림((worst − 값) × 100 ÷ (worst − best)).
- 항목 점수 = Σ 버림(세부 점수 × 세부 무게 ÷ 값 있는 세부 무게 합). 종합 = Σ 버림(항목 점수 × 무게 ÷ 값 있는 항목 무게 합). 자료가 없는 세부 항목·항목은 빼고 남은 무게로 다시 나눈다. 다 없거나 무게 합 0이면 '값 없음'('점수 없음').
- 바깥 무게 처음 값: 사는 사람·수요 30 · 경쟁 25 · 교통·흐름 20 · 자리 15 · 비용 10(사용자 인터뷰).
- 기준 칸 검사: `full`·`best`·`worst`는 정수, `full` > 0, `best` < `worst`, 빈칸 안 됨 → 어기면 저장하지 않고 칸 아래 `0보다 큰 숫자를 적어 주세요. 비우면 저장되지 않아요.`·`'100점' 값이 '0점' 값보다 작아야 해요.` 기준 둘 가운데 빈칸은 `숫자를 적어 주세요. 비우면 저장되지 않아요.` 나이대는 하나 이상(`나이대를 하나 이상 골라 주세요.`). 무게는 0~100 정수(`무게는 0부터 100까지 정수로 정해 주세요.`). 칸 검사 글은 `score.ts` `RULE_TEXT` 한 곳(TASK-6).
- 범위 안 개수 기준은 범위가 넓을수록 커진다 — 처음 값은 기본 범위 1km(약 3.14km²) 기준이고 화면에 그렇게 적는다. 동네 훑기의 '범위'는 그 동(동 넓이가 저마다 다름)이다.

| 세부 id | 값 | 방향 · 처음 기준 | 처음 무게 · 까닭 | 훑기 |
|---|---|---|---|---|
| **사는 사람·수요** | 나이대: 10세 11칸에서 고름, 처음 40세 이상(정형외과 환자는 40대부터 크게 는다) | | | |
| `p-density` | 고른 나이대 인구 ÷ 범위 km² | 많을수록 · 10,000명/km² | 40 · 진료권은 사는 인구가 가장 잘 맞는다(`LAW_BASIS` 진료권) | ○ |
| `p-senior` | 60세 이상 ÷ 전체 × 100(%) | 많을수록 · 25% | 15 · 무릎·허리 등 오래 다니는 환자가 많은 나이(사용자 예시 값) | ○ |
| `p-households` | 범위 안 세대 수 | 많을수록 · 20,000세대 | 5 · 인구 밀도와 많이 겹쳐 낮게. 1km에 2만 세대 = 큰 도시 주거지 | ○ |
| `p-apts` | 범위 안 아파트 세대 + 입주 예정 세대 | 많을수록 · 10,000세대 | 10 · 홍보가 닿기 쉽고 입주 예정은 앞으로의 수요. 1,000세대 단지 열 곳쯤 | ✕(법정동·단지마다 부름이 많음) |
| `p-trend` | (최근 10월 − 2022-10) ÷ 2022-10 × 100(%), 줄면 0 | 많을수록 · 5% | 10 · 4년에 5% 넘게 느는 곳은 새 아파트가 드는 곳 | ○ |
| `p-accidents` | 범위 안 교통사고 다발 지점 수 | 많을수록 · 3곳 | 5 · 자동차보험 환자. 다발 지점은 시군구에 몇 곳뿐이라 1km 안 3곳이면 많다 | ○ |
| `p-industry` | 후보 시군구의 산업단지 고용 인원 합(15085886, 단지 위치가 없어 시군구 단위) | 많을수록 · 20,000명 | 5 · 일하다 다치는 환자. 시군구 단위라 거칠어 낮게 | ○ |
| `p-schools` | 범위 안 초·중·고 수(15021148) | 많을수록 · 5곳 | 5 · 학생 운동 손상·학부모 | ○ |
| `p-facilities` | 범위 안 경로당 + 체력단련장 | 많을수록 · 30곳 | 5 · 노년·운동하는 사람 신호. 경로당은 단지마다 있어 흔하다 | ○ |
| `p-welfare` | 후보 시군구 (기초 의료급여 + 차상위 3종) ÷ 주민등록 인구 × 100(%, 0.1 버림) | 많을수록 · 5%(적을수록으로 바꾸면 1% 100 · 5% 0) | **0** · 사용자가 정한다(조사 5). 전국 어림 3.5%쯤보다 조금 위 | ✕(시군구 값이라 동마다 같음) |
| **경쟁** | n = 범위 안 경쟁으로 고른 과목 의원(대표 과목으로 셈, 18절 — 처음엔 정형외과·신경외과·마취통증의학과·재활의학과, 한의원 뺌). 경쟁 과목이 0개면 이 항목은 값 없음(`과목 없음`) | | | |
| `c-count` | n | 적을수록 · 0곳 이하 100 · 6곳 이상 0 | 30 · 시안 위험 신호 '경쟁 5곳 이상'보다 조금 넉넉하게 | ○ |
| `c-perRival` | 범위 인구 ÷ (n + 1) | 많을수록 · 20,000명 | 35 · 의원 하나가 버티는 인구 어림(앞 판 그대로) | ○ |
| `c-newOpen` | 개설일이 3년 안인 경쟁 의원 수(`hosp-list` 개설일) | 적을수록 · 0곳 100 · 3곳 0 | 15 · 새로 여는 곳이 많으면 이미 붐비는 동네 | ○ |
| `c-gaps` | 진료 시간 빈틈 칸 수(11절 표, 월~토) | 많을수록 · 10칸 | 10 · 야간·주말 빈틈은 새 의원이 파고들 자리 | ✕(진료 시간은 후보만) |
| `c-price` | (경쟁 평균 체외충격파 값 − 지금 의원 값) ÷ 지금 의원 값 × 100(%), 0 아래는 0 | 많을수록 · 20% | 10 · 둘레가 비싸게 받으면 값으로 견줄 수 있다. 지금 의원 값을 안 적으면 값 없음 | ✕ |
| **교통·흐름** | | | | |
| `t-station` | 가장 가까운 역까지 m(훑기는 동 가운데에서) | 적을수록 · 200m 100 · 1,500m 0 | 40 · 앞 판 그대로 | ○ |
| `t-stops` | 400m 안 버스 정류장 수(훑기는 동 가운데에서) | 많을수록 · 10곳 | 20 · 앞 판 그대로 | ○ |
| `t-flow` | 범위 안 하루 평균 승하차 합(4절, 교통카드 기준) | 많을수록 · 30,000명 | 40 · 사람이 실제로 지나는 양. 군 지역은 값 없음 → 남은 무게로 | ✕(후보 저장 때만 받음) |
| **자리**(후보만) | | | | |
| `s-floor` | 후보 층(`floor_label`의 숫자, '지'로 시작하면 지하 = 0점) | 적을수록 · 1층 100 · 5층 0 | 25 · 무릎·허리 아픈 환자는 낮은 층 | — |
| `s-elevator` | 건물 승강기 수 | 많을수록 · 1대 | 20 · 2층 이상이면 꼭 필요 | — |
| `s-parking` | 건물 주차 대수(건축물대장) | 많을수록 · 30대 | 15 · 노년 환자는 차로 온다 | — |
| `s-age` | 사용승인 뒤 햇수 | 적을수록 · 5년 100 · 30년 0 | 10 · 오래된 건물은 전기·방사선 공사가 어렵다 | — |
| `s-neighbors` | 후보 30m 안 약국 수(상가정보 업종, 이름 `이웃 약국(30m 안)`) | 많을수록 · 1곳 | 10 · 1층 약국은 처방 환자 동선 | — |
| `s-sign` | 간판 보임(보여요 1 · 가려요 0 · 모름 값 없음) | 많을수록 · 1 | 10 · 사용자가 거리 사진으로 고름 | — |
| `s-violation` | 위반 건축물(없음 1 · 있음 0 · 모름 값 없음) | 많을수록 · 1 | 10 · 있으면 개설 신고가 막힐 수 있다 | — |
| `s-clinics` | 같은 건물·옆 건물 의원 수 = 후보 30m 안 의원(안 보기 뺌, 경쟁 포함, 약국 뺌, 이름 `같은 건물·옆 건물 의원 수`) | 많을수록 · 3곳 | **0** · 다른 과 의원이 모이면 환자가 는다는 연구를 못 찾음(시안 승인 3) — 사용자가 올림 | — |
| **비용**(후보만, 후보 매물) | | | | |
| `k-rentPy` | 평당 월세(원) | 적을수록 · 50,000원 100 · 200,000원 0 | 35 · 지방 주거지 ~ 서울 역세권 폭 | — |
| `k-deposit` | 보증금(원) | 적을수록 · 3,000만 원 100 · 2억 원 0 | 15 · 처음 드는 돈 | — |
| `k-premium` | 권리금(원) | 적을수록 · 0원 100 · 1억 원 0 | 20 · 돌려받지 못하는 돈 | — |
| `k-vsAvg` | 평당 월세가 저장한 매물 평균보다 몇 % 비싼지(11절, 2개 미만이면 값 없음) | 적을수록 · −20% 100 · +20% 0 | 30 · 같은 눈높이로 고른 매물끼리 견줌 | — |
- 동네 훑기는 항목 셋(사는 사람·수요 · 경쟁 · 교통·흐름)만, '훑기 ○' 세부 항목만 쓴다(설정 화면에 '후보에서만' 표시). 훑기 동 단위 값: 범위 = 그 동(넓이·인구·동 안 의원·동 안 시설 개수), 산업단지는 그 시군구.
- 후보 매물 = 그 후보에 이어진 매물 가운데 마지막으로 고친 것. 설정이 바뀌면 다시 부르지 않고 그날 값·훑기 값으로 바로 다시 센다.
- `location_settings.score_rule`의 DB 처음 값은 `DEFAULT_SCORE_RULE`의 JSON과 글자까지 같다(`score.test` 첫 시험의 JSON, TASK-51이 SQL을 맞춤 — `s-clinics`를 더하면 SQL도 같이 고침). 예전 설정에 없는 세부 항목은 `fillScoreRule`이 처음 값으로 채운다.
- 세부 항목 이름은 requirements '화면 글 기본값' 그대로 `score.ts` `label`에 둔다(지금 `label`에 든 설명 글 — 예 `후보 30m 안 약국 수(상가정보 업종)` — 은 `why`·'근거와 출처'로 옮기고 `label`은 `이웃 약국(30m 안)`처럼 이름만). 경쟁 세부 항목의 n은 `facts.ts`가 설정을 받아 센다(score.ts는 과목을 모른다).

## 9. 위험 신호 (`flags.ts`, 차례 그대로, 맞는 것만)
1. `violation-yes` 위반 건축물 '있음'(사용자가 고름) 2. `violation-check` 안 고름·모름 — 수준 `check`(`확인 필요`)는 **이것 하나뿐**, 나머지는 `red` 3. `same-building` 경쟁 의원(경쟁 과목 설정, 대표 과목으로 셈)이 후보에서 30m 안(같은 건물로 봄, 가까운 차례 첫째) 4. `closed-here` 3년 안 30m 안에서 의원 폐업 5. `rent-high` 후보 매물 평당 월세 > 저장한 매물 평균 × 1.3(매물 2개 이상일 때) 6. `premium-new` 사용승인 3년 안인데 권리금 > 0 7. `many-rivals` 범위 안 경쟁 의원 5곳 이상(글의 짧은 이름 = 지금 경쟁 과목, `rivalShortText`) 8. `few-seniors` 60세 이상 15% 미만 9. `far-station` 가장 가까운 역 1,000m 넘음 10. `barrier` 후보 층(`floor_label`의 숫자, 지하 뺌) 2층 이상 · 건물 승강기 0 · 연면적 또는 매물 넓이 500㎡ 이상(장애인등편의법 시행령 별표 2).
- 근거: 1·2 법 id `violation`, 10 `bf`, 나머지는 출처 id(`hosp-list`·`clinic-license`·`user`(붙여 넣은 매물)·`pop-age`·`rail-stations` 등, 화면이 출처 줄로 그림 — `Flag`에 `src` 칸). 층 읽기는 `score.ts`의 `floorNumber`, 평당 월세는 `listings.ts`, 돈은 `wonText`, 거리는 `distText`를 불러 쓴다(TASK-51). 제목·설명 글은 requirements '화면 글 기본값', 수치는 Claude 판단.

## 10. 예상 환자 — 뺌 (사용자 2026-11-22)
- 하루 예상 환자 계산·지금 의원 하루 평균 환자 읽기(`stats_days`)·나라 통계 이용률 파일·'조심' 표시·지금 의원 자리 찍기는 없다. 손익분기는 11절(비용 칸과 직접 적는 환자 1명당 평균 수입만).

## 11. 개원 준비 계산
- 칸 모양·단위는 승인된 시안 그대로(만 원 칸은 × 10,000, 이자는 연 %). 인테리어는 **평당 값**으로 저장하고 합계 = 버림(평당 값 × 후보 넓이의 화면 평 `m2ToPyeong`)(넓이가 없으면 합계 없음). 저장·계산은 원 정수. 매물의 보증금·월세는 칸 옆 참고 글로만 보인다(칸을 채우지 않음).
- `costs` 열쇠(원 정수 0~9,999,999,999, 빈칸 = 없음): `deposit` 보증금 · `premium` 권리금 · `interior` 인테리어 · `equipment` 장비 · `otherStart` 그 밖 준비 · `rent` 월세 · `mgmt` 관리비 · `payroll` 인건비 · `otherMonth` 그 밖 한 달 · `loan` 대출 · `rateBp` 연 이자(0.01% 단위 0~3,000) · `perPatient` 환자 1명당 수입 · `workDays` 한 달 진료일 1~31.
  - 한 달 이자 = 버림(loan × rateBp ÷ 120,000) · 한 달 고정비 = rent + mgmt + payroll + otherMonth + 이자(빈칸은 0으로 더하고 빈칸 수를 보임)
  - 처음 드는 돈 = deposit + premium + interior + equipment + otherStart + 6 × 한 달 고정비 · 내 돈 = 처음 드는 돈 − loan(음수면 그대로, `대출이 더 많아요`)
  - 손익분기 하루 환자 = 버림(한 달 고정비 × 10 ÷ (perPatient × workDays)) ÷ 10(소수 첫째 자리, 시안 `하루 34.1명`), 둘 중 하나 비면 없음. `perPatient`(환자 1명당 평균 수입)는 사용자가 직접 적는 빈칸이다. `원장 몫은 들어 있지 않아요` 한 줄. 예상 환자와 견주는 글은 없다
- `schedule.ts` 할 일 열넷(시안 `TASKS` 글·날수 그대로, D = 목표 개원일, 법 근거 id): D−150 자리 정하고 계약(특약: 개설 신고가 안 되면 없던 일로) · D−140 대출 · D−130 인테리어 설계(방사선 방어벽·장애인 편의) · D−120 장비 주문 · D−90 공사 시작 · D−60 전기 용량 · D−60 직원 공고 · D−30 간판·홍보 · D−30 방사선 장비 설치 신고 준비 · D−10 의원 개설 신고(의료법 33조) · D−7 요양기관 신고(국민건강보험법 43조) · D−5 방사선 장비 검사·신고(쓰기 3일 전까지) · D−3 직원 교육 · D 개원. 개원일을 고치면 모두 다시 센다. 날짜는 `addDays`, 지난 할 일은 회색. 차례는 조문에서 끌어낸 어림(업계 3~6개월)이라 화면에 그렇게 적는다.
- `checklist.ts`(줄 글은 시안 그대로, id는 TASK-10이 정함, `id · 요건 · 있어야 하는 것 · 법 id`). 위반 건축물은 점검 줄이 아니라 후보 칸 `violation`이다.
  - `BUILDING_CHECKS` 건물 요건 10줄(○·✕·? — 누를 때마다 차례로): `b-xray` 엑스레이실 방사선 막는 벽 · 벽·문에 납을 넣는 공사, 설치 뒤 검사 · `xray` / `b-power` 전기 용량 · 엑스레이·물리치료 기계를 함께 켤 만큼(장비 업체에 물어 정해요) / `b-ceiling` 천장 높이 · 엑스레이 기계를 달 높이(장비 업체 기준) / `b-load` 바닥이 견디는 무게 · 엑스레이·견인 치료기 무게 / `b-ramp` 장애인 경사로·출입구 · 건물 입구에 턱이 없거나 경사로 · `bf` / `b-bf-toilet` 장애인 화장실 · 의원 넓이가 500㎡ 이상이면 꼭 있어야 해요 · `bf` / `b-toilet` 화장실 · 층 안에 남녀 따로 / `b-elevator` 엘리베이터 · 휠체어·들것이 들어가는 크기 / `b-use` 건물 용도 · 제1종 근린생활시설(의원) 또는 의료시설 · `use` / `b-report` 보건소 신고 조건 · 시설 기준대로 방을 나눔 · 위반 건축물이면 막힐 수 있어요 · `open`. 법 id가 없는 줄은 `법 기준 없음 — 관리사무소에 물어요`. 줄마다 `어떻게 알았나` 글 40자(`checks.how[id]`, 빈칸 허용).
  - `RISK_CHECKS` 계약서에 꼭 넣을 것 5줄(체크 칸): `r-cancel` 의원 개설 신고가 안 되면 계약을 없던 일로 해요(특약) · `open` / `r-free-rent` 무상 기간이 공사 기간과 장비 설치까지 들어가요 / `r-restore` 나갈 때 원상 복구 범위(방사선 벽·바닥)를 적어요 / `r-premium` 권리금 계약서를 따로 써요 / `r-power` 전기 용량 늘리는 공사를 누가 하고 누가 내는지 적어요.
  - `VISIT_CHECKS` 보러 갈 때 10줄(체크 칸): `v-sign` 길 건너에서 간판 자리가 보여요 / `v-entrance` 1층 입구에 턱이 없거나 경사로가 있어요 · `bf` / `v-elevator` 엘리베이터에 휠체어·들것이 들어가요 / `v-toilet` 층 안에 남녀 화장실이 따로 있어요 / `v-ceiling` 천장 높이를 쟀어요(엑스레이 기계) / `v-panel` 배전반 사진을 찍었어요(전기 용량) / `v-window` 창문 방향·햇빛·바깥 소리를 봤어요 / `v-parking` 주차장 들어가는 길이 어르신에게 쉬워요 / `v-passers` 평일 낮과 저녁에 지나가는 사람을 봤어요 / `v-mgmt` 같은 건물 가게에 관리비·관리 상태를 물어봤어요.
  - 값 `checks[id] = 'yes' | 'no' | 'unknown'`(체크 칸은 켬 = `yes`, 끔 = `unknown`) + `checks.how = { 건물 요건 id: 글 }`. `cleanChecks`는 `how`도 남긴다(40자 넘거나 글이 아니면 버림).
- `hours.ts` 빈틈 표: 요일 7 × 칸 7(아침 8~9 · 오전 9~13 · 점심 13~14 · 오후 14~18 · 저녁 18~19 · 저녁 19~20 · 밤 20~21). 그 칸 **전체**에 문을 연(여는 시각 ≤ 칸 시작, 닫는 시각 ≥ 칸 끝) 경쟁 의원 수, 0이면 빈틈. 넣는 의원은 부르는 쪽(`facts.ts`·화면)이 고른다 — 범위 안 경쟁 과목 의원 가운데 `detail`이 있는 곳(`gapTable`은 과목을 보지 않고 받은 의원을 다 센다, `detail`이 없거나 `week`가 null이면 `noHours`). 진료 시간이 아직 없는 곳은 '화면 글 기본값'의 `진료 시간이 아직 없는 {n}곳은 빼고 셌어요. [다시 받기]를 누르면 더해져요.` 점심 쉼은 자료에 없어 연 것으로 센다(화면 글은 requirements '화면 글 기본값'). 공휴일은 세지 않는다. 의원 모양은 `types/location.ts`의 `Rival`.
- `listings.ts` 매물 견주기: 평당 월세 = 버림(rent ÷ 화면 평 `m2ToPyeong`), 평균 = 넓이·월세가 있는 저장 매물 모두의 평당 월세 평균(버림). 매물 2개 이상일 때만 차이 % = 버림((값 − 평균) × 100 ÷ 평균) → `저장한 매물 평균보다 {n}% 비싸요`·`싸요`·|n| < 1이면 `평균과 같아요`. 보증금도 같은 셈. 평수 거르기 `{from, to}` 평(둘 다 비우면 다).
- 협상표 `terms` 열쇠 여섯(`freeRent`·`mgmt`·`raise`·`restore`·`period`·`premium`) × `{ now, want }` 글 100자 + `terms.memo` 임대 조건 메모 글 300자(계약 전 위험 칸).
- 타입 한 곳: 일꾼이 파일마다 따로 둔 모양(`FlagInput`의 그날 값 부분·`GapRival`→`Rival`·`WatchCandidate`·`LicenseRow`·`WatchEvent`·`WatchStatus`·`ListingNumbers`·`ScoreFacts`)은 `src/types/location.ts`로 모은다(TASK-51). 거리 `distM`은 `coords.ts`, ㎡↔평은 `area.ts`, 돈 글자는 `money.ts`, 층 읽기는 `score.ts`(`floorNumber` 내보냄) 하나만 쓴다.

## 12. 새 경쟁 의원 알림 (`watch.ts` + `components/dashboard/location/`)
- 고름: Cron이 아니라 **관리자가 대시보드를 열 때** 브라우저가 한다. 까닭: (1) Cron에는 로그인 세션이 없어 관리자 표를 RLS로 못 읽는다 → 고시·공지처럼 모으기 계정·비밀번호·공개 경로가 또 생긴다 (2) 알림은 대시보드에서만 보이므로 열 때 확인해도 같은 날 보인다 (3) 서버는 지금처럼 바깥 자료만 대신 부른다. 대가: 대시보드를 한 달 넘게 안 열면 늦는다.
- `dueCandidates(rows, today)`: `status ≠ dropped`이고 `watch_checked_on`이 null이거나 30일 넘음, 만든 차례 앞 5곳. 기간 = 지난 확인 기간 끝(확인 날 − 2일)의 다음 날(= 확인 날 − 1일, 처음이면 오늘 − 30일) ~ 오늘 − 2일(자료가 2일 늦음). 후보 그날 값 `place`의 `'{시도} {시군구}'`(세종처럼 둘이 같으면 하나)를 `addr`로 실어 부르고, 답이 한도에 잘렸으면(`capped`) 그 후보의 확인 날을 고치지 않는다. 과목 설정을 못 읽으면 그번 확인을 건너뛴다(처음 값으로 확인하지 않음). 같은 기간 `clinic-license` open·close를 한 번씩 받아 후보끼리 나눠 쓴다.
- `pickEvents(found, cand, rule)`: 범위 안 + 대표 과목(`deptOfText(이름, 과목 글, 업태 글, rule)`, 18절)이 경쟁 과목 → 줄(같은 줄은 DB unique로 한 번). 다 넣은 뒤 `watch_checked_on = 오늘`. 경쟁 과목이 0개면 부르지 않는다. 설정은 `useLocationWatch`가 `location_settings`에서 함께 읽는다(못 읽으면 처음 값). `listWatchCandidates`는 후보 `name`도 읽는다(알림 아래 줄).
- `useLocationWatch(isAdmin, today)`: 대시보드가 열릴 때 한 번, 20초 한도, 실패는 조용히. `LocationAlert`: 안 본 줄을 최근 차례 셋 + `… {n}건 더`. 자리는 `WarrantyNotice` 바로 아래(같은 네 자리). `dashboard/page.tsx`가 `currentMe()`의 `isAdmin`을 넘긴다. 후보 화면을 열면 그 후보 줄의, 줄의 [닫기]를 누르면 **그 줄 하나**의 `seen_at`을 채운다(시안대로 줄마다 [닫기], 사용자 2026-11-22 시안 승인 때 [닫기]를 두기로 함 — 다음 확인에서 새 줄이 생기면 다시 뜬다). 글은 requirements '화면 글 기본값'의 새 경쟁 의원 알림(후보 이름·고른 과목).

## 13. 지도 · CSP · 링크
- `map/useKakaoSdk.ts`: 한 번만 `<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=<NEXT_PUBLIC_KAKAO_MAP_KEY>&autoload=false">` → `kakao.maps.load`. 열쇠가 비면 불러오지 않는다. 실패는 `E-LOC-MAP`. `KakaoMap`(가운데·범위 원·표시(후보 파랑·경쟁 의원 주황·한의원 회색·둘레 다른 과 의원 연보라 작은 점 `other`·역 검은 네모, 점은 그날 값의 심평원·좌표 파일 좌표)·동 다각형·찍기·지도/하늘 사진) · `Roadview`(`RoadviewClient.getNearestPanoId(점, 50)`, 없으면 `이 자리 50m 안에는 거리 사진이 없어요`). 시험은 `window.kakao`를 흉내 낸다.
- CSP: `buildCsp(isDev, supabaseUrl, { kakao: true })`가 더하는 처음 목록(확인할 것 7로 브라우저 위반 기록을 보고 정확히 맞춤, 와일드카드 없음): script-src `https://dapi.kakao.com` `https://t1.daumcdn.net` · img-src `https://t1.daumcdn.net` `https://map0.daumcdn.net`~`https://map3.daumcdn.net`(넷 따로) `https://mts.daumcdn.net` `https://s1.daumcdn.net` · connect-src `https://dapi.kakao.com`. `next.config.ts` `headers()`에 전체 줄 뒤로 `/location`·`/location/:path*` 줄을 더한다(Next는 같은 이름 머리를 뒤 줄로 덮는다): 카카오 CSP + `Referrer-Policy: strict-origin-when-cross-origin`. · **더함(TASK-48 진짜 브라우저 확인 2026-11-23, 카카오 공개 파일 kakao.js 4.5.31·roadview.js 1.17.3)**: script-src `https://t1.kakaocdn.net` · img-src `https://mts.kakaocdn.net` `https://map.kakaocdn.net` `https://t1.kakaocdn.net` `https://ssl.kakaocdn.net` · connect-src `https://rv.map.kakao.com` `https://ssl.kakaocdn.net` `https://t1.kakaocdn.net`(지도 본체가 이제 kakaocdn.net에서 옴). 2026-11-23 등록된 열쇠로 지도 → 하늘 사진 → 로드뷰를 끝까지 띄워 확인함 — 남는 위반은 카카오 본체의 옛 IE 확인 `eval` 한 건(오류 없이 넘어감, `'unsafe-eval'`은 열지 않음). localhost(http)에서는 카카오가 `http://`로 받아 막히므로 개발 서버로 진짜 지도를 볼 때는 이 점을 안다(운영 https는 해당 없음).
- `links.ts`: 네이버는 **fin 모양** `https://fin.land.naver.com/map?center={lng}-{lat}&zoom=16`(사용자가 두 모양을 눌러 보고 fin을 고름, 2026-11-22 — `NAVER_FORM = 'fin'`, m 모양 `https://m.land.naver.com/map/{lat}:{lng}:16/SG:SMS/A1:B2`는 지운다) · 토지이음 `https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?selGbn=umd&isNoScr=script&mode=search&pnu={PNU}` · 인터넷 등기소 `https://www.iros.go.kr/index.jsp`(첫 화면만) · 법령은 `LAW_BASIS.url`. 모두 새 창 `noopener noreferrer`.

## 14. 화면
- `(app)/location/page.tsx`: `guardPage('/location')`, 탭 이름 `입지 분석`, `searchParams`의 `tab`(일곱 가운데)·`c`(uuid)를 넘긴다. `gate.ts` `isAdminPath`에 `/location` 더함.
- 탭: `menu.ts`에 `LOCATION_TAB = { label: '입지 분석', path: '/location', href: '/location', ready: true, primary: false }`(MENU 밖). `MoreMenu`가 관리자일 때 '주소록' 다음에 끼우고, `currentMenuLabel`도 본다. `AppShell`이 `isAdmin`을 넘긴다(데스크는 늘 없음).
- `LocationScreen`: 머리(h1·`관리자만 보여요`·[분석 방법]·[후보 더하기]) · 안쪽 탭 여섯(동네 훑기·후보 자세히·매물·후보 견주기·개원 준비·근거와 출처) · 후보 고르기 · 처음(후보 없음) · 열쇠 없음(`keys`가 data·kakao 둘 다 `missing`) · 보고서(`tab=report`). `useLocation`이 표 여섯·`keys`를 열 때 한 번 읽고(지금 의원 환자 숫자는 읽지 않음), 모으기는 동시에 4개(진행 `자료 {n}/{m}`). 덧붙임(19·18절): [분석 방법] 판(`method/`)·과목 고르기 판(`kinds/`, 바꾸면 바로 `dept_rule` 저장·다시 그림)을 잇고, 모으기에 지금 `dept_rule`을 넘기며, 후보 단추에 그날 값 `place`의 행정동 이름, 작은 지도에 경쟁 의원·한의원·둘레 다른 과 의원·역 점을 찍는다. 화면 안 다른 탭 링크는 `/location` 안이라 `next/link`여도 된다(TASK-44).
- 부품은 props·콜백만(읽기·저장·fetch 없음): `weights/`(바깥 무게 막대·[기본 무게로] + 항목마다 [세부 ▾] 세부 무게·기준 칸·나이대·`p-welfare` 방향 고르기·[기본값으로]·칸 검사 글, 8절) · `scan/`(시도·시군구 고르기·색 지도·순위·`weights/` 자리·동 자세히) · `detail/frame/`(위험 신호·종합·점수 풀이·범위·목차·[오늘 값으로 다시 받기], 묶음은 칸(slot)으로 받아 직접 부르지 않음. **칸 감싸개는 id를 두지 않고 ref·tabIndex만**(목차는 ref로 건너뜀) — 묶음이 제 머리 h3와 닻 id `sec-…`를 한 번만 그린다(TASK-44: 같은 id 다섯 `sec-people`·`sec-income`·`sec-future`·`sec-demand`·`sec-traffic`이 두 번 나왔음). 점수 입력 셈은 `lib/location/facts.ts`를 부른다) · `detail/{people,demand,rivals,site}/`(묶음 열셋을 넷으로: 사는 사람·소득(의료급여·차상위 포함)·앞으로 / 수요·교통·둘레 시설 / 경쟁 의원·**둘레 다른 과 의원**·진료비·빈틈 / 거리 사진·건물·빈 칸·땅 — 묶음마다 제목 아래 '이렇게 봤어요'(`common/HowLine` + `method.ts`)) · `listings/`(목록·거르기·견주기 글·붙여 넣기 칸·협상표·[주소록에 넣기]) · `add/`(세 길 판) · `compare/` · `report/`(`print:` 클래스로 앱 틀 숨김, A4) · `prep/plan/`(비용·손익분기·일정) · `prep/visit/`(건물 요건·어떻게 알았나·계약 전 위험·임대 조건 메모·점검표·사진·메모·진행 상태) · `common/`(숫자 칸 `Fact`·출처 줄 `SourceLine`·자료 없음 글 `WhyLine`·'이렇게 봤어요' 한 줄 `HowLine`) · `sources/` · `start/`(처음 화면에 처음 안내 장을 끼움) · `method/`(처음 안내 장·[분석 방법] 판) · `kinds/`(과목 고르기 판).
- [주소록에 넣기]: `lib/storage/contacts.ts`의 업체·담당자 저장 함수를 그대로 부른다(분류 `other`, 하는 일 `부동산 중개`, 겹침 `duplicate`면 그 업체를 찾아 잇기). 주소록 코드는 고치지 않는다.
- 사진: `components/inventory/photo.ts`의 `shrinkPhoto`(긴 변 1,600px JPEG)를 불러 쓴다(고치지 않음).
- PC 배치 하나: 지도·두 칸 틀은 최소 폭 976px(창 1024 − 셸 본문 좌우 여백 24px씩 — 시안처럼 창 1024에 딱 맞음, TASK-84), 좁으면 그 감싸개 안에서 `overflow-x: auto`. `max-md:` 없음. 색·글꼴은 앱 토큰(`docs/UI_GUIDE.md`).

## 15. 오류 · 자료 없음 글
| 번호 | what | fix |
|---|---|---|
| `E-LOC-READ-FAILED` | 입지 분석 자료를 읽지 못했어요 | 인터넷 연결을 확인하고 [다시 읽기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |
| `E-LOC-SAVE-FAILED` | 저장하지 못했어요 | 적은 값은 그대로 있어요. 인터넷 연결을 확인하고 잠시 뒤 다시 해 주세요. |
| `E-LOC-SOURCE` | 바깥 자료를 받지 못했어요 | 잠시 뒤 [다시 받기]를 눌러 주세요. 저장한 후보는 지난 값을 그대로 보여 줘요. |
| `E-LOC-MAP` | 지도를 불러오지 못했어요 | 카카오 개발자 화면에 이 사이트 주소가 등록됐는지, 지도 열쇠가 맞는지 확인해 주세요. 숫자는 지도 없이도 볼 수 있어요. |
| `E-LOC-PHOTO` | 사진을 올리지 못했어요 | 사진 파일만, 후보마다 30장까지 올릴 수 있어요. 잠시 뒤 다시 올려 주세요. |

(`lib/errors.ts`의 `E-LOC-PHOTO` fix 글은 지금 `JPEG·PNG·WEBP 사진만, …`이다 → 위 글로 고친다. 영어 낱말을 쓰지 않는다.)
- 칸 글(`WhyLine`): `no-key` `{자료 이름}: 열쇠를 넣으면 보여요.`(카카오는 그 열쇠 이름) · `not-applied` `공공데이터포털에서 '{자료 이름}' 활용신청을 하면 보여요.` · `failed` `지금 받지 못했어요.` [다시 받기](옛 값이 있으면 `지난 값 · 기준 {날짜}`) · `none` `SOURCES.noneText` · `outside` `이 지역은 자료 없음` · `capped` `{n}곳 넘게 있어요. 가까운 {n}곳만 셌어요.`
- 열쇠 없음 화면: `자료 열쇠를 넣으면 시작할 수 있어요` / `공공데이터포털 열쇠와 카카오 열쇠는 사이트 서버 설정에 넣어요. 넣기 어려우면 관리자에게 알려 주세요. 열쇠는 대화창이나 메신저에 붙이지 마세요.` / 열쇠 셋 줄(requirements '화면 글 기본값') / 알림 `자료 열쇠는 자료를 주는 사이트가 '이 앱이 받아 가도 돼요'라고 내어 주는 긴 비밀번호예요. 셋 다 무료예요. 이 화면에는 열쇠 넣는 칸이 없어요. 열쇠는 사이트 서버 설정에 넣고, 여기서는 넣었는지만 보여요.` / `열쇠 없이도 되는 것: 매물 붙여 넣기 · 진행 메모 · 개원 비용 계산.` 화면 글에는 영어 사이트·도구 이름을 쓰지 않는다. 지도 열쇠만 없음: `카카오 지도 열쇠를 넣으면 지도가 보여요. 숫자는 지도 없이도 볼 수 있어요.`

## 16. ADR 글 (TASK-1이 `docs/ADR.md` 끝에 넣음. 다른 갈래가 먼저 042~044를 쓰면 다음 번호로 바꾸고 이 글의 번호만 고친다)

### ADR-042: 입지 분석은 서버 경로가 바깥 공개 자료를 대신 부른다 (관리자만, Claude 아님)
**맥락**: 입지 분석(specs/location)은 공공데이터포털·카카오 로컬 자료가 필요하고 둘 다 열쇠가 있어야 한다. 열쇠를 브라우저에 두면 드러나고, 공공데이터포털은 브라우저 부르기(CORS)도 막는다. 서버 코드는 `app/api/ai/` 하나뿐이다(ADR-004).
**결정** (호출한 쪽 설계 결정 + Claude 판단, 2026-11-22):
- `POST /api/ai/location/query`·`GET /api/ai/location/keys` 두 경로를 `app/api/ai/location/` 아래 둔다. Claude는 부르지 않는다 — AI 폴더를 서버 코드 자리로 쓰는 예외다.
- 열쇠 `DATA_GO_KR_KEY`(디코딩 열쇠)·`KAKAO_REST_KEY`는 Vercel 환경 변수와 `.env.local`에만. 앱 화면에 열쇠 칸을 두지 않는다. 공공데이터포털 열쇠 하나로 `apis.data.go.kr`·`api.data.go.kr`과 `api.odcloud.kr`(파일 자료를 API로 주는 곳 — 의료급여·차상위 15062448, 2026-11-22 더함)을 부른다.
- 서버가 로그인·승인된 병원·`admins` 줄을 확인한다. 아니면 401·403이고 바깥에 부르지 않는다.
- 정해 둔 종류·칸만 받고 정해 둔 host 넷(`dapi.kakao.com`·`apis.data.go.kr`·`api.data.go.kr`·`api.odcloud.kr`)만 부른다(redirect 없음, 8초 — 아주 느린 비급여만 60초, 2MB, 경로 `maxDuration` 120초). 서버는 DB에 쓰지 않는다(저장은 브라우저가 RLS로). 카카오 답은 서버에도 담아 두지 않는다. 서버 메모리 보관도 없다(역·정류장 좌표는 정적 파일).
- 로그는 오류 번호·종류만. 좌표·주소·답은 남기지 않는다.
- 새 경쟁 의원 확인은 Vercel Cron이 아니라 관리자가 대시보드를 열 때 브라우저가 한다(후보마다 30일에 한 번).
**대안**: (1) 브라우저가 바로 부름 — 열쇠가 드러나고 CORS에 막힌다. (2) Cron — 세션이 없어 관리자 표를 못 읽는다 → 모으기 계정이 또 필요하다(ADR-036 같은 장치). (3) 카카오 JS SDK의 주소 찾기 — REST 열쇠를 서버에 두는 쪽으로 통일했다.
**트레이드오프**: 대시보드를 한 달 넘게 안 열면 알림이 늦다. 바깥 응답 모양이 바뀌면 그 종류만 '못 받음'이고 코드를 고친다. 무료 한도(카카오 로컬 하루 10만 건, 공공데이터포털 자료마다 개발 1만 건)를 넘기면 그날은 못 받는다.

### ADR-043: 카카오 지도 JavaScript 키는 `NEXT_PUBLIC_KAKAO_MAP_KEY`에 둔다 — 비밀값이 아니다. `/location`만 CSP·Referrer를 넓힌다
**맥락**: CLAUDE.md는 `NEXT_PUBLIC_*`에 비밀값을 넣지 않게 한다. 카카오 지도 SDK는 브라우저가 주소에 `appkey=`로 키를 실어 부른다. 앱은 `Referrer-Policy: no-referrer`인데 카카오는 요청이 등록한 사이트에서 왔는지 본다.
**결정**:
- JavaScript 키는 카카오가 웹 페이지에 드러나도록 만든 키이고, 카카오 개발자 화면에 등록한 사이트(`https://seoseungkwanapp.vercel.app`, 개발 `http://localhost:3000`)에서 온 요청만 받는다. 그래서 비밀값이 아니라 공개 이름표로 보고 `NEXT_PUBLIC_KAKAO_MAP_KEY`에 둔다. 사이트 잠금이 없는 REST 키는 비밀값이라 서버에만 둔다(ADR-042). '비밀값을 NEXT_PUBLIC에 넣지 않는다' 규칙과 부딪히지 않는다.
- `/location`·`/location/…`에만 카카오 origin을 정확한 이름으로 CSP에 더하고(와일드카드 없음) `Referrer-Policy: strict-origin-when-cross-origin`(사이트 이름만 보내고 주소 뒤쪽은 안 보냄). 다른 화면은 그대로다.
**대안**: (1) JS 키도 서버 뒤 — SDK가 브라우저에서 키를 쓰므로 안 된다. (2) 정적 지도 그림 — 로드뷰·하늘 사진·움직이는 지도가 없다. (3) 모든 경로에 넓힘 — 지도 없는 화면까지 바깥 스크립트를 허락한다.
**트레이드오프**: 우리 사이트 안에서는 키가 보인다(다른 사이트는 못 씀). 무료 한도는 카카오 계정의 첫 번째 앱에만 준다. `/location`에서만 카카오 스크립트가 돌고 Referrer를 사이트 이름만큼 연다. 키를 바꾸면 다시 배포해야 한다(빌드 때 들어감).

### ADR-044: 카카오 결과는 저장하지 않고, 공공 자료는 후보를 저장한 날의 값으로 굳힌다
**맥락**: 카카오 운영정책 제5조는 결과 묶어 두기·다시 팔기를 막고, 카카오 직원 답(데브톡 2026-10-29)은 받은 주소·좌표를 업무 자료로 오래 저장하면 안 되고 사용자가 직접 정한 위치 좌표는 된다고 했다. 사용자는 '볼 때 받고 저장 때 그날 값으로 굳힘 + 기준 날짜'를 골랐다.
**결정**: 저장하는 것은 design.md 6절 '저장하는 것' 목록뿐이다. 카카오에서 받은 주소 글·좌표·장소 목록·거리·로드뷰·법정동 코드는 저장하지 않고 열 때마다 부른다. 점수는 공공 자료(역·정류장 포함)만 써서 굳힌다. 공공 자료의 좌표·이름은 저장해도 된다 — 심평원 의원 좌표·주소(지도 점·같은 건물), 좌표 파일의 역 좌표, 동 경계 파일로 센 후보 자리의 행정동 이름(2026-11-22 더함, 카카오 값이 아님을 시험이 본다). 숫자마다 출처 id·기준 날짜를 달고, 출처·법 근거·없는 자료 목록은 `lib/location/sources.ts` 한 곳이다. 동 경계는 국가데이터처 SGIS 경계(이용 제한 없음)를 줄여 `public/location/dongs/`에 둔다(반기마다 사람이 바꿈). 역·정류장 좌표(국토교통부 버스정류장 위치 15067528·도시철도역사 15013205, 이용 제한 없음)도 `public/location/transit/`에 둔다(해마다 사람이 바꿈).
**대안**: (1) 둘레 시설도 저장 — 정책 위반. (2) 아무것도 굳히지 않음 — 견줄 때마다 값이 바뀐다. (3) 동 경계를 그때마다 바깥에서 — 공개 API가 없거나 따로 가입해야 한다.
**트레이드오프**: 둘레 시설·거리 사진은 카카오 열쇠가 없으면 안 보이고 열 때마다 바뀐다. 동 경계·소득·정류장·역 좌표 파일은 사람이 새로 넣기 전까지 옛 기준 날짜를 보인다.
**바꾸는 것**: `plan.md` §2에 '2-12. 입지 분석' 몇 줄, §4 '서버로 가는 것'에 입지 분석 저장 목록, §5 DB 표에 `location_*` 한 줄. `docs/ARCHITECTURE.md` 폴더·흐름·DB 표 한 줄씩. `CLAUDE.md` 아키텍처 규칙에 '예외 (ADR-042~044)' 한 줄.

## 17. 확인할 것 결과 (TASK-47 진짜 열쇠, 2026-11-22 · 보고 `~/.claude/state/handoff/location-t47-report.md`)
새 host 없음. 진짜 답 원문(열쇠 지움)은 저장소 밖에만 있다.
1. 심평원 과목 코드 열아홉(18절 표)·종별 `31` 의원 · `51` 치과의원 · `93` 한의원 · `11` 종합병원 · `01` 상급종합 모두 진짜 답과 맞음(TASK-47·TASK-55). 흉부외과의 심평원 이름은 '심장혈관흉부외과'(이름 낱말 '흉부외과'가 안에 듦). 과목 목록은 부과목까지 찾는다. 목록 줄은 거리 차례가 아니라 이름(가나다) 차례로 온다 → 한 목록이 500줄을 넘어 잘리면 먼 곳이 아니라 이름 뒤쪽이 빠진다(강남역 3km 피부과 1,215곳).
2. 체외충격파 = `SZ084`(줄 코드 `SZ0840000`, 줄 이름 '처치 및 수술료(근골)/체외충격파치료[근골격계질환]'). 도수치료 진짜 줄은 못 봄 → 코드 `MX122…` 또는 항목 이름 `도수치료`로 찾는다. 의원 4곳은 0줄. **아주 느림**(4절).
3. 의원 인허가 조건 칸: 개업 `LCPMT_YMD::GTE`·`::LT`, 폐업 `SALS_STTS_CD::EQ=03` + `DAT_UPDT_PNT::GTE`(폐업일 조건 칸은 없음), 주소 `ROAD_NM_ADDR::LIKE`, 이름 `BPLC_NM`, 업태 `MDLCR_INST_BTP_NM`, 과목 `MDEXM_SBJCT_CN_NM`. 쪽마다 100줄. 치과·한의원이 섞여 온다(업태로 가름). 전국 3년은 3,000줄 한도를 넘어 `addr`가 필요하다.
4. 건축물대장 승강기 2칸(승용+비상용)·주차 4칸(설치 대수 합). 기타 용도가 주용도를 품으면 기타 용도만. 상가정보 층 칸은 53곳 가운데 14곳이 빈칸.
5. 청약홈 운영 답 200. 전남광주는 공급지역 `광주`·`전남` 둘을 3쪽씩. 세대 수는 행정동판(15108065, `admmPpltnHhStus/selectAdmmPpltnHhStus`·`admmCd`)으로 바꿈(법정동판 15108071은 행정동 칸이 빔) — 진짜 답 확인(TASK-57): 동마다 한 줄, 시군구 합계 줄 없음, `hhCnt`·`statsYm`(그 달 말일), 새 코드 됨.
6. 승하차 최신 달은 두 달 전(2026-09), 시도 2·시군구 5자리는 행안부 새 코드, 한 달 칸만(그 달 날 수로 나눔), 쪽마다 1,000줄, 10쪽 묶음 `part`, 결과 50 = 빈 쪽, 환승역은 노선마다 따로. 버스정류장은 `opr_ymd`(그 달 1일)가 꼭 있어야 함(없으면 52), ARS `~` → null. 도시철도 경유역은 전국 1,734줄, 역 이름의 `[노선]`을 뺌, 같은 이름 역은 500m 안일 때만 잇는다.
7. CSP origin은 TASK-27 처음 목록 그대로 — 진짜 브라우저 위반 기록은 TASK-48 화면 확인에서 보고 맞춘다.
8. 동 경계는 TASK-30이 행안부 2026-10-31 코드로 이음(동 3,544곳, 못 이은 15곳 — 코드 여섯째 자리 9). 2026 개편 지역은 5절.
9. 의료급여 판 `uddi:b4960581-6aa1-4317-a2a6-d3f947573f24`(2025-12, 최신), `perPage` 3000으로 한 쪽에 전국, 코드 칸 없음 → 이름으로 고름, 옛 이름만(5절 옛 구 묶음).
- 그 밖: 심평원 상세 2.7판 폐기 → 2.8판(기타인력 `dtlGnlNopCdNm`·`gnlNopCnt`, 콘빔 CT도 CT로 셈) · 국립중앙의료원은 목록 조회(`Q0` 시도·`Q1` 시군구·`QZ` 의원 C 3쪽 + 한의원 G 1쪽 + 치과의원 N 1쪽) · 체력단련장 `fitness_centers/info`(대문자 칸, 결과 `0`, 영업 중 `01`) · 인구 자료 없음 코드 `3` · 가게 기준 날짜 `stdrYm` 말일 · 카카오는 새 코드·새 이름.
- 활용신청 안 됐던 다섯(전통시장 15012894 · 마을회관·경로당 15114136 · 초중등학교위치 15021148 · 교통사고다발지역 15029185 · 행정동별 인구·세대 15108065)은 사용자가 2026-11-22 신청을 마쳤고 다섯 모두 등록됨(TASK-57).
10. 표준데이터 넷(시장·경로당·학교·사고)의 진짜 답은 `{response: …}`로 감싸지 않은 `{header, body}`이다(빈 답 = 결과 `03`·`body: null`, 칸 이름 틀림 = `10`). 요청 거르기 칸은 글자가 딱 같아야만 거른다 → 주소 칸으로는 못 거른다(TASK-57).
   - 시장: 거르지 않고 전국 1,403곳을 3쪽 × 1,000줄. 칸 `mrktNm`·`rdnmadr`·`lnmadr`·`latitude`·`longitude`(빈 좌표 `""`), 기준 `referenceDate`. 주소가 새 이름(전남광주·제물포구·화성시 만세구). 시도 이름이 있으면 다른 시도의 같은 이름 시군구를 뺀다.
   - 경로당: 제공기관 이름 `instt_nm` = `'{시도} {시군구}'`(일반구는 그 시, 세종은 시도 하나)로 거르고 제공기관마다 2쪽. 칸 `flctNm`·`flctTyp`·`lctnRoadNmAddr`·`lat`·`lot`·`busiCodNm`('폐'·'휴'는 뺌), 기준 `crtrYmd`(제공기관마다 다름). 시도가 통째로 낸 줄은 못 받고, 자료를 내지 않은 시군구는 0곳으로 나온다(제공기관 163곳 — 알려진 한계). 새 이름·옛 이름 제공기관을 함께 부른다. **시도 이름이 꼭 있어야 한다.**
   - 학교: 교육청 `cddcNm` = `'{시도}교육청'`(전남광주는 `전남광주통합특별시교육청`)으로 거르고 5쪽 × 1,000줄. 기준 `referenceDate`. **시도 이름이 꼭 있어야 한다.**
   - 사고: 거를 시군구 칸이 없어 `ACDNT_YEAR`(상수 `ACCIDENT_YEAR = 2024`, 새 해 자료가 나오면 손으로 바꿈)로 전국 667곳을 2쪽 × 500줄. `ctprvnSignguNm` 끝 번호를 뗀다. 옛 이름만 있어(광주·전남·인천 옛 구·화성시) 옛 이름으로도 찾는다.
11. 그 밖(TASK-55): 진료 시간 목록은 치과의원 `QZ=N`도 된다(1쪽 더 부름). 과목 거르기 `QD`도 되지만 몸통에 과목 칸이 없어 쓰지 않는다. 비급여는 정형외과 의원 하나 185줄이 한 쪽에 0.4초로 온 날도 있었다(60초 한도는 그대로). 카카오 약국 도로명 주소 `road_address_name`은 빈 글자일 수 있다(→ null).

## 18. 의원 과목 고르기 (`depts.ts` · `location_settings.dept_rule`, 시안 승인 3 `?s=kinds`)
- 과목 목록 `DEPTS`(이 차례가 '목록 차례'다 — 판·요약·거르기·대표 과목이 모두 이 차례). 심평원 과목 코드는 `getHospBasisList`의 `dgsbjtCd`, 종별은 `clCd`. 이름 낱말은 대표 과목에 쓰고 긴 것부터 본다(`신경외과`가 `외과`·`신경과`보다 먼저).

| id | 이름 | 짧은 이름 | 찾는 법 | 이름 낱말 | 확인 |
|---|---|---|---|---|---|
| `im` | 내과 | 내과 | 의원 31 · 과목 01 | 내과 | 확인됨 |
| `neuro` | 신경과 | 신경과 | 31 · 02 | 신경과 | 확인됨 |
| `psy` | 정신건강의학과 | 정신건강의학과 | 31 · 03 | 정신건강의학, 정신과 | 확인됨 |
| `gs` | 외과 | 외과 | 31 · 04 | 외과 | 확인됨 |
| `ortho` | 정형외과 | 정형외과 | 31 · 05 | 정형외과 | 확인됨 |
| `ns` | 신경외과 | 신경외과 | 31 · 06 | 신경외과 | 확인됨 |
| `cs` | 흉부외과 | 흉부외과 | 31 · 07 | 흉부외과 | 확인됨 |
| `plastic` | 성형외과 | 성형외과 | 31 · 08 | 성형외과 | 확인됨 |
| `pain` | 마취통증의학과 | 마취통증 | 31 · 09 | 마취통증, 통증의학 | 확인됨 |
| `obgy` | 산부인과 | 산부인과 | 31 · 10 | 산부인과, 여성의원 | 확인됨 |
| `ped` | 소아청소년과 | 소아청소년과 | 31 · 11 | 소아청소년, 소아과 | 확인됨 |
| `eye` | 안과 | 안과 | 31 · 12 | 안과 | 확인됨 |
| `ent` | 이비인후과 | 이비인후과 | 31 · 13 | 이비인후과 | 확인됨 |
| `derm` | 피부과 | 피부과 | 31 · 14 | 피부과 | 확인됨 |
| `uro` | 비뇨의학과 | 비뇨의학과 | 31 · 15 | 비뇨의학, 비뇨기과 | 확인됨 |
| `rad` | 영상의학과 | 영상의학과 | 31 · 16 | 영상의학 | 확인됨 |
| `rehab` | 재활의학과 | 재활 | 31 · 21 | 재활의학 | 확인됨 |
| `fm` | 가정의학과 | 가정의학과 | 31 · 23 | 가정의학 | 확인됨 |
| `oem` | 직업환경의학과 | 직업환경의학과 | 31 · 25 | 직업환경의학 | 확인됨 |
| `dental` | 치과의원 | 치과 | 종별 51(치과의원) | 치과 | 확인됨 |
| `korean` | 한의원 | 한의원 | 종별 93(한의원) | 한의원 | 확인됨 |

- 설정 `DeptRule = { v: 1; rival: DeptId[]; hide: DeptId[] }` — 둘 다 아닌 과목은 둘레로 보기. 처음 값 `DEFAULT_DEPT_RULE = { v: 1, rival: ['ortho', 'ns', 'pain', 'rehab'], hide: [] }`(JSON 글자가 SQL 처음 값과 같음). `checkDeptRule`(모르는 id·겹침·되풀이 → 문제 목록) · `fillDeptRule(raw)`(못 읽으면 처음 값, 모르는 id는 버림) · 요약·글에 쓰는 `rivalShortText(rule)` = 경쟁 과목 짧은 이름을 목록 차례로 `·`로 이음(없으면 `고른 과목 없음`) · `deptRole(id, rule)` = `'rival' | 'around' | 'hide'`.
- 대표 과목 `deptOf({ name, depts }, rule)`: (1) 이름 낱말이 든 과목이 `depts`에 있고 안 보기가 아니면 그 과목 (2) `depts` 가운데 경쟁 과목(목록 차례 첫째) (3) `depts` 가운데 둘레로 보기 과목(목록 차례 첫째) (4) 없으면 null(어디에도 안 셈). 치과의원·한의원은 종별 목록에서 찾아 `depts`가 `['dental']`·`['korean']`이다.
- 인허가 줄 `deptOfText({ name, subjects, type }, rule)`: 업태 글에 `치과`가 들면 `dental`, `한의`가 들면 `korean`, 아니면 이름 낱말 → 과목 글(쉼표·공백으로 나눈 과목 이름들, 이름 낱말로 id를 찾음) 가운데 경쟁 과목 → 둘레로 보기 과목 → null.
- 모으기(`collect`): `hosp-list`를 `clinic` + `depts`(안 보기가 아닌 의원 과목, 19까지 한 번) · `dental`(안 보기가 아니면) · `korean`(안 보기가 아니면)로 부르고, 같은 기관 기호는 한 줄로 합쳐 `depts`에 찾은 과목을 모은다. 그때 경쟁 과목인 의원만 `hosp-detail`·`hosp-hours`(맞추기)·`nonpay`(가까운 20곳)를 불러 `detail`을 채운다. 가까운 차례 200곳까지(경쟁 과목 의원은 다 남김).
- 따르는 곳(경쟁 = 지금 설정의 경쟁 과목, 대표 과목으로 셈): 경쟁 수·1곳당 사는 사람(점수 n + 1)·새로 연 곳·진료 시간 빈틈·진료비 차이(점수 `c-*`, `facts.ts`) · 위험 신호 3·7(`flags.ts`) · 경쟁 의원 묶음·거르기 단추·3년 개폐업(이 자리 폐업은 과목과 상관없이) · 진료비·진료 시간 빈틈 묶음 · 대시보드 알림(`watch.ts`) · 견주기 줄 이름 · 보고서 경쟁 줄 · 지도 점 · '이렇게 봤어요'의 `{경쟁}`. 바꾸면 다시 부르지 않는다. 경쟁 0개면 '경쟁' 항목은 값 없음(`과목 없음`), 진료 시간 빈틈은 `경쟁 의원 과목을 고르면 보여요.`
- 둘레 다른 과 의원 = 범위 안 의원 가운데 대표 과목이 둘레로 보기이고 한의원이 아닌 곳(한의원은 둘레로 보기일 때 경쟁 묶음의 따로 한 줄). 과목마다 수·같은 건물 수·옆 건물 수·가장 가까운 거리, 많은 차례. 첫 줄은 30m 안 모든 과목 의원(안 보기 뺌, 경쟁 포함)과 약국(카카오 `k-near` `PM9` 30m 안, 볼 때만).
- 같은 건물·옆 건물: 30m 안 의원은 심평원 주소, 약국은 카카오 장소의 도로명 주소(`k-near` 답에 `road`를 더함)에서 '도로명 + 건물 번호'(괄호·쉼표 뒤·층·호를 뺀 앞부분)를 떼어, 후보 점의 카카오 `k-point` 도로명 주소와 같으면 같은 건물, 아니면 옆 건물. 견주기는 화면에서만 하고 카카오 주소는 저장하지 않는다. 카카오 도로명을 못 받으면 둘을 합쳐 `30m 안: …` 한 줄.
- 점수 `s-clinics`(8절): 값 = 30m 안 의원 수(안 보기 뺌, 경쟁 포함). 같은 건물·옆 건물을 나누지 않아 카카오 없이 센다.
- 판 바꾸기는 누르는 즉시 `dept_rule` 저장(점수 무게 판처럼 마지막 고침 800ms 뒤 한 번, 실패하면 `E-LOC-SAVE-FAILED`). 줄 오른쪽 `후보 {글자} {범위} 안 {n}곳` = 지금 보는 후보 그날 값에서 `depts`에 그 과목이 든 의원 수(고른 값과 상관없이).

## 19. 분석 근거 보이기 (`method.ts` · `explain.ts`, 시안 승인 3 `?s=method`·`candidate`·`scan`·`report`)
- `method.ts`(글 한 곳, 순수): `METHOD`(머리 한 줄·다섯 줄·묶음별 기관 표 여섯·맨 아래) · `HOW`(묶음 열셋 `people`·`income`·`demand`·`comp`·`others`·`price`·`hours`·`traffic`·`photo`·`bld`·`vac`·`land`·`future`마다 `chip: 'research' | 'law' | 'law-common' | 'common'`, 한 줄 `{ what, how, why }`, [더 보기] `{ what, how, why, basis }`) · `REPORT`(둘째 장 머리·점수 매기는 법 세 줄·표 열넷·늘 못 보는 셋) — 글은 requirements '화면 글 기본값' 승인 3 그대로. 칩 글 `연구 근거`·`법 근거`·`흔히 보는 기준`(`law-common`은 법 근거 + 흔히 보는 기준 칩 둘). 묶음 id ↔ 틀 칸: `comp`→`rivals`, `bld`→`building`, `vac`→`vacancy`, `others`→새 칸 `others`, 나머지는 같은 이름.
- `fillHow(text, ctx)`: `ctx = { asOf: (src) => string | null; radiusM; sggName: string | null; rivalShort: string }`. `[[열쇠]]` → `기준 {날짜}`(날짜 글은 `common/text.ts` `asOfText` 모양 `2026년 11월 15일`), `[[열쇠:d]]` → 날짜, `{범위}` → `distText`, `{시군구}`, `{경쟁}`. 기준 날짜가 없으면 그 표시와 바로 둘레 괄호·` · `를 뺀다(빈 괄호를 남기지 않음). 열쇠 → 출처 id 표는 requirements(모두 `SOURCES`에 있음, 시험).
- 점수 풀이 `explainCandidate(facts, rule, avg)`(`facts` = `scoreFactsOf` 결과, `avg` = `{ sgg: SggAvg | null; listings: { rentPerPy, deposit, premium } | null }`): 값 있는 세부 항목마다 몫 = 항목 무게 ÷ (값 있는 항목 무게 합) × 세부 무게 ÷ (값 있고 무게 > 0인 세부 무게 합) × 100, 올린 점수 = 세부 점수 × 몫 ÷ 100, 내린 점수 = (100 − 세부 점수) × 몫 ÷ 100. 세부 점수 50 이상은 올린 것, 아래는 내린 것에서 큰 차례 셋(무게 0·값 없음 뺌). 보이는 점수는 버림 정수, 1 아래면 `1점 아래`. 줄 = `{ id, label, valueText, groupLabel, sub, fullText, compareText | null, points }`. 값 글·만점 기준 글·견줄 값 글은 requirements '화면 글 기본값' 점수 풀이 표.
- 견줄 값 `SggAvg`(그날 값 `sggAvg`, 모을 때 한 번, 공공 자료만): `{ sggName; areaM2 /* 동 경계 넓이 합 */; total; bands /* 11칸, 시군구 행정동 모두의 pop-age 합 — 의료급여 인구와 같은 부름을 나눠 씀 */; trendPct /* (최근 10월 − 2022-10) ÷ 2022-10 × 100, 0.1 버림 */ | null; accidents; schools; seniors; gyms /* 시군구 이름으로 받은 목록 수(동네 훑기와 같은 셈) */ | null; stationM; stops /* 행정동 가운데 점마다 가장 가까운 역 거리·400m 안 정류장 수의 평균, 버림 */ | null }`. 견줄 값 셈: `p-density` = 고른 나이대 합 ÷ (areaM2 ÷ 1,000,000) 버림 · `p-senior` = 60세 이상 ÷ total × 100 버림 · `p-trend` = trendPct · `p-accidents`·`p-schools`·`p-facilities`(경로당 + 체력단련장) = 버림(시군구 수 ÷ areaM2 × 범위 넓이) · `t-station`·`t-stops` = 그대로 · 비용 셋 = 저장한 매물 평균(`listings.ts`, 버림). 그 밖 세부 항목은 견줄 값 없음.
- 동네 훑기 `explainScan(dongs, rule)`(`dongs` = 동마다 `scoreItems(…,'scan')` 결과): 세부 항목마다 값 있는 동의 세부 점수 평균을 내고, 동마다 (그 동 세부 점수 − 평균) × 세부 몫(위 셈, 훑기 세 항목) ÷ 100이 가장 큰 것(0.5 이상)을 올린 것, 가장 작은 것(−0.5 이하)을 내린 것으로 — 줄 글은 `{이름} {값 글}`. TASK-31의 `scan/why.ts` `whyLine`(까닭 한 줄)은 그대로 두고 순위 줄에 이것을 더한다.
- 보고서 둘째 장: `REPORT` 표의 기준 날짜 칸 = 그 후보 그날 값의 출처별 `asOf`(같은 묶음에 여럿이면 ` · `로), 없으면 `–`. 인쇄는 `break-before: page`, 두 장을 A4 한 쪽씩(인쇄 때 92%로 줄임, 시안).
