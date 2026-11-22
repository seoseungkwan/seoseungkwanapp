# 설계: 입지 분석

> 값과 동작의 기준은 requirements.md다. 이 문서는 어디에 무엇을 두는지와 정한 값을 적는다. 화면 글자·자리는 승인된 시안(`docs/mockups/location/`, 2026-11-22)을 따른다. ADR 글은 16절(TASK-1이 `docs/ADR.md`로 옮김). '(Claude 판단)'은 고쳐도 되는 값이다.

## 1. 한눈에
```
[관리자 PC 브라우저] /location ─ LocationScreen ─ useLocation
   ├ 저장: lib/storage/location.ts → Supabase(RLS: 내 병원 + admins 줄) 표 여섯 · Storage location-photos
   ├ 바깥 자료: components/location/clients.ts → POST /api/ai/location/query {kind, …}
   │    └ 서버: guard(관리자 확인) → registry[kind] → sources/*.ts(요청 만들기·답 읽기, 순수) → fetchSource(정해 둔 host)
   │          열쇠 DATA_GO_KR_KEY · KAKAO_REST_KEY(서버 환경 변수) · DB 쓰기 없음 · 카카오 답 담아 두지 않음
   ├ 동 경계: GET /location/dongs/<시군구>.json (public/ 정적 파일)
   ├ 모으기: lib/location/collect.ts(부르는 함수를 받는 순수 흐름) → 그날 값(snapshot) → 후보 줄에 저장
   ├ 계산: lib/location/{score,flags,patients,costs,schedule,hours,…}.ts (순수)
   ├ 지금 의원: lib/storage/stats.ts readDays → stats_days의 totals.patients(하루 합계)만
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
| `src/lib/location/{coords,regions,area,money}.ts` | EPSG:5174 바꾸기·거리·표본 점·동 찾기·동 몫·코드 만들기·평/㎡·돈 글자 |
| `src/lib/location/{score,flags,patients}.ts` | 점수·위험 신호·예상 환자 |
| `src/lib/location/{costs,schedule,checklist,hours,links,watch,listings}.ts` | 비용·일정·점검 항목·진료 시간 빈틈·바깥 링크·알림 판정·매물 견주기 |
| `src/lib/location/{collect,snapshot}.ts` | 자료 모으기 흐름·그날 값 검사·크기 줄이기 |
| `src/lib/location/data/` | `msk-rates.json`·`income.json`·읽기 `index.ts`(TASK-30) |
| `public/location/dongs/` | `index.json` + `<시군구 5자리>.json`(TASK-30) |
| `src/lib/storage/location.ts` | 표 여섯 읽기·쓰기 + 사진 올리기·지우기 |
| `src/app/api/ai/location/{guard,fetchSource,registry}.ts` | 관리자 확인·바깥 부르기·종류 → 읽는 곳 |
| `src/app/api/ai/location/sources/{kakao,people,homes,trades,clinics,clinicHours,nonpay,licenses,buildings,stores,transit,flow}.ts` | 묶음마다 `Adapter`(요청 만들기·답 읽기, 순수). 묶음 = 4절 표의 종류 묶음(TASK 하나씩) |
| `src/app/api/ai/location/{query,keys}/route.ts` | `POST` 바깥 자료 · `GET` 열쇠 상태 |
| `src/components/location/map/**` | 카카오 SDK 불러오기·지도·하늘 사진·로드뷰 |
| `src/components/location/{common,sources,start}/**`·`clients.ts` | 숫자 칸·출처 줄·자료 없음 글 · 근거와 출처 · 처음/열쇠 없음 · 부르기(같은 origin, `redirect: 'error'`) |
| `src/components/location/{scan,detail,listings,add,compare,report,prep}/**` | 화면 부품(props·콜백만) |
| `src/components/location/{LocationScreen.tsx,useLocation.ts}`·`src/app/(app)/location/page.tsx` | 잇기·페이지 |
| `src/components/dashboard/location/**` | 대시보드 알림 |
| `src/lib/csp.ts`·`next.config.ts` | `/location`만 카카오 origin·Referrer |
| `src/lib/auth/gate.ts`·`src/components/shell/{menu,MoreMenu,TabBar,AppShell}` | 관리자 경로·관리자에게만 탭 |
| `supabase/migrations/20261122000000_location.sql`·`supabase/location.rls.test.ts` | 표·권한·사진 칸 |
| `fixtures/location/api/<묶음>/`·`fixtures/location/dongs/` | 가짜 응답(지어낸 이름만)·동 경계 견본 |

`SOURCES` 칸: `id` · `org`(기관 — 통계청은 '국가데이터처') · `name` · `url`(자료 쪽) · `via`(`api`·`file`·`link`·`app`·`user`) · `key`(`data`·`kakao`·null — 사람 흐름 자료가 다른 열쇠를 쓰면 그때 더함) · `cycle` · `unit` · `terms`(이용 조건·출처 문구) · `why`(왜 보나) · `noneText`(없을 때 글) · `checked`(`직접`·`검색만`). `LAW_BASIS` 칸: `id`·`law`·`article`·`summary`·`url`(국가법령정보센터 `https://www.law.go.kr/법령/<법 이름>/<조>`)·`checked`. 값은 조사 1~3 표 그대로(조사 3 B의 아홉 줄: 의료법 33조·시행규칙 25·34조 / 의료법 37조·방사선 안전관리 규칙 3·4조·별표 2 / 장애인등편의법 시행령 별표 1·2 / 건축법 시행령 별표 1 3호 라목 / 건축법 79조 / 소득세법 168조·부가가치세법 8조 / 국민건강보험법 43조·시행규칙 12조 / 진료권 연구 이선경 외 2009).

## 3. 서버 경로
- `POST /api/ai/location/query`(`runtime = 'nodejs'`, `maxDuration = 30`): `guard` → 몸통 `checkQuery` → `registry[kind]` → 열쇠 확인 → `adapter.requests(q, key)` 차례로 `fetchSource` → `adapter.parse(texts, q, today)` → `{ ok: true, value, src, asOf }`. 답 머리 `Cache-Control: no-store`.
- `GET /api/ai/location/keys`: `guard` → 열쇠마다 비었으면 `missing`, 있으면 작은 부르기 하나(카카오 `k-address` '서울특별시청', 공공 `station` 1줄)로 `ok`·`rejected`(401·403·미등록 코드)·`failed`.
- `guard.ts`: `readMe()` → 로그인 안 함 401, `hospital?.status !== 'approved' || !isAdmin || desk` 403. 둘 다 몸통 없음, 바깥 부르기 전.
- `fetchSource.ts`: host 허용 `dapi.kakao.com`·`apis.data.go.kr`·`api.data.go.kr`·`api.odcloud.kr` + 사람 흐름 자료의 host 하나(**조사 중** — 조사 결과로 여기에 채움) — 그 밖은 부르지 않음. `redirect: 'error'`, 8초, 2,000,000바이트, 브라우저 모양 UA, 카카오는 `Authorization: KakaoAK <키>`, 공공은 `serviceKey=<디코딩 키>`(URLSearchParams가 인코딩). 결과 `{ ok: true, text } | { ok: false, fail: 'http' | 'timeout' | 'too-big' | 'blocked-url' }`.
- 공공데이터포털 미등록 열쇠 답(`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`·`resultCode` 30 등)은 `not-applied`, 열쇠 거절은 `no-key`가 아니라 `failed`로 보고 `keys`가 `rejected`를 알린다.
- 메모리 보관은 `station`(전국 역 목록, 공공 자료) 하나만 24시간. 카카오 답은 어디에도 담아 두지 않는다.
- 로그: `console.error('[api/ai/location]', code, kind)`만(`E-LOC-SOURCE`, 활용신청 안 됨은 `not-applied`). 좌표·주소·답 글자·열쇠 없음.
- 하위 부르기: 한 요청 안 하위 부르기는 종류마다 정한 쪽 수까지(아래 표 '쪽'), 동시에 2개.

## 4. 자료 종류 (`QueryKind`)
`Adapter = { kind; src: SourceId; key: 'data' | 'kakao'; requests(q, key): SiteRequest[]; parse(texts: string[], q, today): Parsed }`. 점은 `{ lat: 33~39, lng: 124~132 }`(소수 6자리), r은 m. `SourceId`는 `types/location.ts`에서 `string`이다(`SOURCES`에 있는 id인지는 시험이 본다 — 두 파일을 같은 Phase에 따로 만들려고).
- 묶음 → 파일: `kakao`(k-*) · `people`(pop-age·household) · `flow`(사람 흐름) · `homes`(apt-list·apt-info·presale) · `trades`(apt-trade·biz-trade) · `clinics`(hosp-list·hosp-detail) · `clinicHours`(hosp-hours) · `nonpay` · `licenses`(clinic-license) · `buildings`(bld-title·bld-floor) · `stores` · `transit`(station·bus·market·senior·gym·accident). 학교(`SC4`)·산업단지는 카카오 묶음.

| 종류 | 열쇠 | 자료(data.go.kr 번호) | 넣는 값 | 내놓는 값 (쪽) | 그날 값에 |
|---|---|---|---|---|---|
| `k-address` | kakao | 카카오 주소 찾기 | `q` 2~100자 | 점·도로명·지번·법정동 코드·본번·부번·산 10개 | 안 넣음 |
| `k-point` | kakao | 좌표→주소·지역 코드 | 점 | 도로명·지번·법정동·행정동 코드·본번·부번·산 | 안 넣음 |
| `k-near` | kakao | 카테고리 장소 | 점·r ≤ 20,000·`SW8`·`MT1`·`PM9`·`SC4`·`HP8`·`AG2` | 이름·분류·점·거리 45개·`capped` (3) | 안 넣음 |
| `k-keyword` | kakao | 키워드 장소 | 점·r·`산업단지`만 | 같음 (3) | 안 넣음 |
| `pop-age` | data | 행정동 성·연령 인구 15108072 | 행정동 코드 1~40·연월(2022-10~) | 동마다 10세 나이대 11칸(100세 이상 포함) | 넣음 |
| `household` | data | 인구·세대 현황 15108071 | 같음 | 동마다 세대 수 | 넣음 |
| `station` | data | 도시철도역사 15013205 | 없음 | 전국 역 이름·노선·점 (20) | 가까운 역·거리 |
| `bus` | data | TAGO 정류소 15098534 | 점 | 500m 안 정류장 이름·점 | 400m 안 수 |
| `flow` | 조사 중 | 사람 흐름(지하철역·버스 정류장 승하차 인원) — **자료 조사 중** | 점·r | 범위 안 역·정류장마다 이름·하루 승하차 인원·기준 날짜 | 넣음 |
| `accident` | data | 교통사고다발지역 15029185 | 시도·시군구 이름 | 지점 이름·사고 수·점 (5) | 범위 안 수·사고 합 |
| `apt-list` | data | 공동주택 단지 목록 15057332 | 법정동 코드 | 단지 코드·이름 (3) | 넣음 |
| `apt-info` | data | 공동주택 기본 정보 15058453 | 단지 코드 | 세대 수·사용승인일·동 수 | 넣음 |
| `presale` | data | 청약홈 분양정보 15098547 | 시도 이름·기간 | 단지 이름·세대·입주 연월·주소 (3) | 넣음 |
| `apt-trade` | data | 아파트 매매 실거래 15126468 | 시군구 5자리·연월 | 법정동 이름·㎡·만 원·층·날 (5) | 범위 법정동 ㎡당 평균·건수 |
| `biz-trade` | data | 상업업무용 매매 15126463 | 같음 | 법정동 이름·용도·㎡·만 원 (3) | 같음 |
| `stores` | data | 상가(상권)정보 15012005 | 점·r 30~2,000 | 가게 이름·업종·층·점 1,000개 (10) | 층마다 가게 수 |
| `bld-title` | data | 건축물대장 표제부 15134735 | 시군구 5·법정동 5·본번·부번·대지 구분 | 용도·구조·지상/지하 층수·연면적·사용승인일·승강기·주차 | 넣음 |
| `bld-floor` | data | 건축물대장 층별개요 15134735 | 같음 | 층마다 이름·용도·㎡ (3) | 넣음 |
| `hosp-list` | data | 심평원 병원정보 15001698 | 점·r·`clinic`(의원)·`korean`(한의원)·`big`(종합병원 이상) | 기호·이름·종별·과목·의사 수·개설일·점·주소 (5) | 넣음 |
| `hosp-detail` | data | 심평원 상세정보 15001699 | 기관 기호 | MRI·CT 있음·물리치료사 수(없으면 null) | 넣음 |
| `hosp-hours` | data | 국립중앙의료원 병·의원 15000736 | 점 | 이름·점·요일 7칸 + 공휴일 [열·닫] 분 (3) | 넣음(맞춘 의원에) |
| `nonpay` | data | 심평원 비급여 15001700 | 기관 기호·항목 코드 | 항목 이름·값(원) | 넣음 |
| `clinic-license` | data | 행안부 건강_의원 15154874 | `open`·`close`·기간(최대 3년) | 이름·과목·인허가일·폐업일·주소·점(5174→WGS84) (30) | 3년 개폐업·알림 줄 |
| `gym` | data | 생활_체력단련장업 15155077 | 시군구 이름 | 이름·영업 상태·점(5174→WGS84) (5) | 범위 안 수 |
| `senior` | data | 마을회관·경로당 15114136 | 시군구 이름 | 이름·점 (5) | 범위 안 수 |
| `market` | data | 전통시장 15012894 | 시군구 이름 | 이름·점 (3) | 가장 가까운 시장·거리 |
- 소득(`income`)·하루 이용률(`msk-rates`)은 파일로 받은 값을 앱에 둔다(부르기 없음, 7절 아래). 직원 월급은 `SOURCES`의 참고 한 줄(실태조사)만.
- `hosp-hours`는 이름(공백·'의원' 빼고 같음)과 50m 안으로 `hosp-list`에 맞춘다. 못 맞추면 진료 시간 없음.
- 과목: 정형외과·마취통증의학과·재활의학과를 '경쟁 의원'(`ortho`·`pain`·`rehab`), 한의원은 따로(`korean`). 코드는 확인할 것 1.
- `flow`(사람 흐름, 사용자 2026-11-22 '승하차만, 전국'): 자료 이름·주는 곳·열쇠·요청 칸·쪽 수·host는 **조사 중**이고 조사 결과로 이 줄과 3절 host를 채운다. 자료가 덮지 않는 지역이거나 범위 안 역·정류장이 자료에 없으면 `Got.ok = false, why: 'outside'` → 칸 글 `이 지역은 자료 없음`. 역·정류장 맞추기는 `station`·`bus` 결과와 이름(공백 빼고 같음) + 100m 안.
- 비급여 견주기 항목: 체외충격파(코드는 확인할 것 2). 도수치료는 비급여 답에 있으면 보이고, 없으면 `도수치료는 2026년 7월부터 관리급여라 견주지 않아요`.

## 5. 좌표 · 지역 · 넓이
- EPSG:5174: `+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43`. 횡메르카토르 역산(Bessel) → 지심 좌표 7변수 변환 → WGS84 위경도를 `coords.ts`에 직접 쓴다(새 패키지 없음). 시험 기준점 다섯은 일꾼이 저장소 밖에서 proj4로 한 번 구해 시험에 적는다(5m 안).
- 거리 `distM(a, b)` 하버사인(지구 반지름 6,371,008.8m) 버림.
- 표본 점 `samplePoints(c, r)`: r ≤ 500 → 19개(가운데 + 고리 6·12), ≤ 1,500 → 37개(+18), 그 위 → 61개(+24). 고리 반지름은 넓이가 같게 나눈다. 점 하나 넓이 = πr² ÷ 점 수.
- 동 경계 파일(TASK-30, 출처 국가데이터처 SGIS 경계 15129688): `index.json` = `{ asOf, sidos: [{ code2, name, sggs: [{ code5, name, bbox: [w, s, e, n] }] }] }`, `<code5>.json` = `{ asOf, dongs: [{ code10(행안부 행정동), name, areaM2, center: [lng, lat], rings: [[lng, lat]…][] | null, unmatched?: true }] }`. 경계는 동마다 200점 안으로 줄인다. `regions.ts`: `sggsTouching(index, c, r)`(네모 범위로 고름) · `dongOf(point, dongs)`(점-다각형) · `dongShares(points, dongs, r)` → `{ code10, share }[]`(AC-7905.3 식).
- 행정동·법정동 잇기: 행정동은 동 경계 파일, 법정동은 표본 점 가운데 19개까지 `k-point`(그때만, 저장 안 함). 시군구 5자리 = 두 코드의 앞 5자리. 실거래는 시군구로 받아 법정동 이름으로 거른다. 인구는 행정동, 단지·실거래는 법정동 기준이라 화면 칸 아래 기준을 적는다.
- 건축물대장 열쇠: 시군구 = 법정동 코드 앞 5, 법정동 = 뒤 5, 번 = 본번 4자리(앞 0), 지 = 부번 4자리, 대지 구분 = 산이면 `1` 아니면 `0`. PNU = 법정동 코드 10 + (산 `2` / 아님 `1`) + 본번 4 + 부번 4.
- 넓이: 평 = ㎡ × 121 ÷ 400. 화면 `{평 소수 1자리 버림}평 ({㎡ 소수 2자리 버림}㎡)`. 입력은 평·㎡ 고르기, 저장은 ㎡(numeric(8,2), 버림).
- 돈 글자 `wonText`: 10,000원으로 나눠떨어지고 1,000,000원 이상이면 `n억 m만 원`(0인 쪽 뺌), 아니면 `#,###원`. 계산은 늘 원 정수.

## 6. 그날 값 · 저장하는 것
```ts
type Why = 'no-key' | 'not-applied' | 'failed' | 'none' | 'outside'
type Got<T> = { ok: true; v: T; src: SourceId; asOf: string }
            | { ok: false; why: Why; src: SourceId; prev?: { v: T; asOf: string } }
type Rival = { name: string; kind: 'ortho' | 'pain' | 'rehab' | 'korean'; doctors: number | null; therapists: number | null
  mri: boolean | null; ct: boolean | null; openedYear: number | null; distM: number; sameBuilding: boolean
  week: ([number, number] | null)[] | null /* 월~일 + 공휴일 8칸, 분 */; eswt: number | null }
type Snapshot = { v: 1; at: string; radiusM: number
  people: Got<{ total: number; bands: number[] /* 11칸 */; households: number; unmatched: number }>
  trend: Got<{ ym: string; total: number }[]>        // 2022-10~ 해마다 10월
  flow: Got<{ stations: { name: string; perDay: number }[]; stops: { name: string; perDay: number }[]; total: number }>  // 범위 안 하루 승하차
  income: Got<{ sggName: string; won: number; year: number }>
  aptPrice: Got<{ perM2: number; deals: number }>; bizPrice: Got<{ perM2: number; deals: number }>   // 지난 6달
  apts: Got<{ name: string; households: number; builtYear: number | null; bdongName: string }[]>  // 60개까지
  presale: Got<{ name: string; households: number; moveIn: string }[]>                              // 30개까지
  demand: Got<{ perDay: number; year: number }>      // M (10절)
  seniors: Got<number>; gyms: Got<number>; accidents: Got<{ spots: number; cases: number }>
  rivals: Got<Rival[]>                               // 80개까지, 가까운 차례
  history: Got<{ kind: 'open' | 'close'; name: string; dept: string; on: string; distM: number }[]>  // 3년, 60개까지
  station: Got<{ name: string; distM: number }>; bus: Got<number>; market: Got<{ name: string; distM: number }>
  building: Got<{ usage: string; structure: string; above: number; below: number; totalM2: number; approvedOn: string | null
    elevators: number | null; parking: number | null; floors: { label: string; usage: string; m2: number }[] }>
  stores: Got<{ floor: string; count: number }[]>    // 후보 30m 안 가게를 층마다
  home: Got<{ perDay: number; rivals: number }>      // 지금 의원 자리, 같은 범위 (10절)
}
```
- `snapshot.ts`: `checkSnapshot`(모양) · `fitSnapshot`(65,536바이트 안: 목록을 뒤에서부터 줄임) · `mergeSnapshot(new, old)`(새로 실패한 칸은 옛 값을 `prev`로).
- **저장하는 것**(ADR-044): 사용자가 고른 후보 점·적은 이름·적은 주소 글·범위 · 붙여 넣은 매물 · 메모 · 점검표·건물 요건·위반 건축물·간판 고름 · 비용 · 무게 · 협상표 · 일정 다 함 표시 · 사진 · 지금 의원 자리(사용자가 고른 점)·직접 넣은 하루 평균·지금 의원 체외충격파 값 · 위 그날 값(공공 자료로 만든 숫자) · 알림 줄(행안부 공공 자료).
- **저장하지 않는 것**: 카카오에서 받은 주소 글·좌표·장소 목록·거리·로드뷰·법정동 코드, 동네 훑기 결과, 보고서.

## 7. DB (`supabase/migrations/20261122000000_location.sql`, 사용자가 SQL Editor에 붙여 넣음)
본보기 `20261121000000_contacts.sql`(머리 주석 모양·`if not exists`·바깥 키 둘)과 `20261121100000_inventory.sql`(Storage). 앞에 auth·precheck_settings(`my_hospital_id`)·contacts SQL이 있어야 한다. `my_hospital_id()`는 다시 만들지 않는다. 표마다 RLS → `revoke all … from anon, authenticated` → 아래 권한만. 정책은 표마다 하나:
`for all to authenticated using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))) with check (같음)`. 데스크 정책 없음(데스크는 `my_hospital_id()`가 null).

| 표 | 칸 · 제약 | 권한(authenticated) |
|---|---|---|
| `location_settings` | `hospital_id` pk 기본 `my_hospital_id()` → hospitals cascade · `weights` jsonb 기본 `{"people":30,"competition":25,"transport":20,"site":15,"cost":10}`(다섯 열쇠, 정수 0~100, 검사 함수 `location_weights_ok`) · `home_lat` numeric(8,6)·`home_lng` numeric(9,6)(범위 33~39·124~132, 둘 다 있거나 둘 다 null) · `home_daily` int 1~2,000 null · `home_eswt` bigint 0~9,999,999,999 null · `updated_at` | select · insert·update(값 칸) |
| `location_candidates` | `id` uuid pk · `hospital_id` · `name` 1~40(빈칸 없음) · `address_note` ≤ 100 기본 '' · `lat`·`lng`(같은 범위) · `radius_m` in (300,500,700,1000,1500,2000,3000) · `status` in (`watching`,`contacted`,`visited`,`reviewing`,`dropped`) 기본 `watching` · `floor_label` ≤ 20 · `area_m2` numeric(8,2) > 0 null · `sign_visible`·`violation` in (`yes`,`no`,`unknown`) null · `costs` jsonb 객체 ≤ 2,000바이트 · `terms`·`checks` jsonb 객체 ≤ 4,000 · `open_on` date null · `tasks_done` jsonb 배열 ≤ 2,000 · `snapshot` jsonb 객체 null ≤ 65,536 · `snapshot_at` · `watch_checked_on` date null · `created_at` · `updated_at`(트리거) · unique(`hospital_id`,`id`) | select·insert·update(값 칸)·delete |
| `location_listings` | `id` · `hospital_id` · `candidate_id` null, 바깥 키 (`hospital_id`,`candidate_id`) → candidates on delete set null (`candidate_id`) · `title` 1~40 · `url` '' 또는 `^https://` ≤ 500 · `area_m2` > 0 null · `floor_label` ≤ 20 · `deposit`·`rent`·`premium`·`mgmt` bigint 0~9,999,999,999 null · `broker_id` null, 바깥 키 (`hospital_id`,`broker_id`) → `contacts_companies`(`hospital_id`,`id`) on delete set null (`broker_id`) · `broker_note` ≤ 40 · `memo` ≤ 500 · `lat`·`lng` null 짝 · 시각 둘 | select·insert·update·delete |
| `location_notes` | `id` · `hospital_id` · `candidate_id` → candidates cascade(두 칸 키) · `day` date · `body` 1~500 · `created_at` | select·insert·delete |
| `location_photos` | `id` · `hospital_id` · `candidate_id` cascade · `path` unique = `<hospital_id>/<candidate_id>/<uuid>.jpg`(검사) · `label` ≤ 40 · `taken_on` date · `created_at` · 후보마다 30줄(트리거 `location_photo_limit`, 넘으면 23514) | select·insert·delete |
| `location_events` | `id` · `hospital_id` · `candidate_id` cascade · `kind` in (`open`,`close`) · `clinic_name` 1~100 · `dept` ≤ 50 · `event_on` date · `dist_m` 0~3,000 · `seen_at` null · `created_at` · unique(`candidate_id`,`kind`,`clinic_name`,`event_on`) | select·insert·update(`seen_at`)·delete |
- Storage `location-photos`: 공개 아님, 3,000,000바이트, `image/jpeg`. `storage.objects` 정책 select·insert·delete: `bucket_id = 'location-photos'`·첫 폴더 = `my_hospital_id()::text`·관리자 줄 있음(고치기 없음). 후보를 지우면 브라우저가 사진 파일도 지운다(`removePhotos`).
- 백업 목록(`lib/backup/tables.ts`)은 아직 없다 → 생기면 여섯 표를 넣는다(그 명세가 할 일).

## 8. 점수 (`score.ts`, 상수 `SCORE_RULES` — '근거와 출처'가 그린다, Claude 판단)
| 항목(무게) | 값 | 0점 | 100점 |
|---|---|---|---|
| `people` 사는 사람·수요(30) | 하루 수요 밀도 = M ÷ 범위 넓이(km²) | 0 | 300명/km² 이상 |
| `competition` 경쟁(25) | 경쟁 의원 1곳당 사는 사람 = 범위 인구 ÷ (n + 1) | 0 | 20,000명 이상 |
| `transport` 교통·흐름(20) | 0.6 × 역 점수 + 0.4 × 정류장 점수. 역: 200m 안 100 → 1,500m 이상 0 · 정류장: 400m 안 0곳 0 → 10곳 이상 100 | | |
| `site` 자리(15, 후보만) | 맞은 수 × 100 ÷ 알 수 있는 수: 1~3층이거나 승강기 있음 · 승강기 있음 · 주차 1대 이상 · 간판 '보여요' · 사용승인 30년 안 · 위반 건축물 '없음' | 0개 | 다 맞음 |
| `cost` 비용(10, 후보만) | r = 후보 매물 평당 월세 ÷ 저장한 매물 평균(매물 2개 이상일 때만) | r ≥ 1.2 | r ≤ 0.8 |
- 사이는 곧은 비례, 항목마다 버림. 종합 = Σ 버림(점수 × 무게 ÷ 값 있는 항목 무게 합). 사람 흐름(승하차)은 지역마다 빈 곳이 있을 수 있어 점수에 넣지 않고 보여만 준다(사는 인구가 진료권에 더 맞다는 연구, `LAW_BASIS` 진료권, Claude 판단).
- 동네 훑기(동 단위): 범위 = 그 동(넓이·인구·동 안 의원 n), 역 = 동 가운데에서, 정류장 없음 → `transport` = 역 점수. `site`·`cost` 없음.
- 후보 매물 = 그 후보에 이어진 매물 가운데 마지막으로 고친 것.

## 9. 위험 신호 (`flags.ts`, 차례 그대로, 맞는 것만)
1. `violation-yes` 위반 건축물 '있음'(사용자가 고름) — 빨강, 근거 건축법 79조 2. `violation-check` 안 고름·모름 — `확인 필요`(건축물대장을 떼어 확인) 3. `same-building` 경쟁 의원이 30m 안 4. `closed-here` 3년 안 30m 안에서 의원 폐업 5. `rent-high` 후보 매물 평당 월세 > 저장한 매물 평균 × 1.3(매물 2개 이상일 때) 6. `premium-new` 사용승인 3년 안인데 권리금 > 0 7. `many-rivals` 범위 안 경쟁 의원 5곳 이상 8. `few-seniors` 60세 이상 15% 미만 9. `far-station` 가장 가까운 역 1,000m 넘음 10. `barrier` 연면적 또는 매물 넓이 500㎡ 이상·2층 이상·승강기 0(장애인등편의법 시행령 별표 2). 글은 시안, 수치는 Claude 판단.

## 10. 예상 환자 (`patients.ts`)
- `msk-rates.json` = `{ src, year, perDay: number[11] }` — 15072876(5단 상병·5세 연령군)의 M00~M99 내원일수를 10세 나이대로 더해 같은 해 12월 주민등록 인구로 나누고 365로 나눈 값. 내원일수는 상병마다 세어 겹칠 수 있어 크게 잡힌다 → 화면 한 줄.
- M = Σ 범위 나이대 인구 × perDay. (나) = 버림(M ÷ (n + 1)). n = 범위 안 경쟁 의원(한의원 뺌).
- (가) = 버림(H × (나) ÷ 지금 의원 (나)). 지금 의원 (나)는 `home`(지금 의원 자리, 같은 범위로 인구·경쟁 의원만 모음 — 후보 그날 값에 함께 굳힘).
- H: `readDays({ from: 오늘 − 90, to: 오늘 − 1 })`의 줄 가운데 `partial` 거짓·`totals.patients ≥ 1`의 평균(버림). 없으면 `home_daily`. 출처 `app-stats`(이 앱 통계 탭, 지난 3달).
- 차이 % = 버림((큰 값 − 작은 값) × 100 ÷ 작은 값). 조심: 둘 다 있고 차이 > 30%(작은 값 0이면 늘 조심, 시안 기본값). 까닭 글은 큰 쪽에 따라(나라 통계 쪽이 크면 '모든 의료기관 이용을 센 값이라 크게 잡혀요', 지금 의원 쪽이 크면 '지금 의원이 둘레보다 잘되는 편이라 크게 잡혀요').

## 11. 개원 준비 계산
- 칸 모양·단위는 승인된 시안 그대로(만 원 칸은 × 10,000, 인테리어는 평당 값 × 평 버림, 이자는 연 %). 저장·계산은 원 정수. 매물의 보증금·월세는 칸 옆 참고 글로만 보인다(칸을 채우지 않음).
- `costs` 열쇠(원 정수 0~9,999,999,999, 빈칸 = 없음): `deposit` 보증금 · `premium` 권리금 · `interior` 인테리어 · `equipment` 장비 · `otherStart` 그 밖 준비 · `rent` 월세 · `mgmt` 관리비 · `payroll` 인건비 · `otherMonth` 그 밖 한 달 · `loan` 대출 · `rateBp` 연 이자(0.01% 단위 0~3,000) · `perPatient` 환자 1명당 수입 · `workDays` 한 달 진료일 1~31.
  - 한 달 이자 = 버림(loan × rateBp ÷ 120,000) · 한 달 고정비 = rent + mgmt + payroll + otherMonth + 이자(빈칸은 0으로 더하고 빈칸 수를 보임)
  - 처음 드는 돈 = deposit + premium + interior + equipment + otherStart + 6 × 한 달 고정비 · 내 돈 = 처음 드는 돈 − loan(음수면 그대로, `대출이 더 많아요`)
  - 손익분기 하루 환자 = 버림(한 달 고정비 × 10 ÷ (perPatient × workDays)) ÷ 10(소수 첫째 자리, 시안 `하루 34.1명`), 둘 중 하나 비면 없음. `원장 몫은 들어 있지 않아요` 한 줄, 두 예상 환자 가운데 작은 값과 견준 글
- `schedule.ts` 할 일 열넷(시안 `TASKS` 글·날수 그대로, D = 목표 개원일, 법 근거 id): D−150 자리 정하고 계약(특약: 개설 신고가 안 되면 없던 일로) · D−140 대출 · D−130 인테리어 설계(방사선 방어벽·장애인 편의) · D−120 장비 주문 · D−90 공사 시작 · D−60 전기 용량 · D−60 직원 공고 · D−30 간판·홍보 · D−30 방사선 장비 설치 신고 준비 · D−10 의원 개설 신고(의료법 33조) · D−7 요양기관 신고(국민건강보험법 43조) · D−5 방사선 장비 검사·신고(쓰기 3일 전까지) · D−3 직원 교육 · D 개원. 개원일을 고치면 모두 다시 센다. 날짜는 `addDays`, 지난 할 일은 회색. 차례는 조문에서 끌어낸 어림(업계 3~6개월)이라 화면에 그렇게 적는다.
- `checklist.ts`: `BUILDING_CHECKS`(방사선 방어벽·제어실 / 전기 용량 / 천장 높이 / 바닥 무게 / 장애인 편의 / 건물 용도 제1종 근린생활시설 / 보건소 신고 조건 / 위반 건축물, 줄마다 근거 id 또는 '법 기준 없음 — 관리사무소에 물어요') · `RISK_CHECKS`(등기부 근저당·소유자와 임대인 같음·용도·원상 복구·관리비 내역) · `VISIT_CHECKS`(간판 자리·승강기 크기·화장실·주차 입구·배전반·창과 빛·소음·냄새·둘레 빈 가게). 값 `checks[id] = 'yes' | 'no' | 'unknown'`. 줄 글은 시안.
- `hours.ts` 빈틈 표: 요일 7 × 칸 7(아침 8~9 · 오전 9~13 · 점심 13~14 · 오후 14~18 · 저녁 18~19 · 저녁 19~20 · 밤 20~21). 그 칸 전체에 문을 연 경쟁 의원 수, 0이면 빈틈. 점심 쉼은 자료에 없어 연 것으로 센다(화면에 적음). 공휴일은 세지 않는다.
- `listings.ts` 매물 견주기: 평당 월세 = 버림(rent ÷ 평), 평균 = 넓이·월세가 있는 저장 매물 모두의 평당 월세 평균(버림). 매물 2개 이상일 때만 차이 % = 버림((값 − 평균) × 100 ÷ 평균) → `저장한 매물 평균보다 {n}% 비싸요`·`싸요`·|n| < 1이면 `평균과 같아요`. 보증금도 같은 셈. 평수 거르기 `{from, to}` 평(둘 다 비우면 다).
- 협상표 `terms` 열쇠 여섯(`freeRent`·`mgmt`·`raise`·`restore`·`period`·`premium`) × `{ now, want }` 글 100자.

## 12. 새 경쟁 의원 알림 (`watch.ts` + `components/dashboard/location/`)
- 고름: Cron이 아니라 **관리자가 대시보드를 열 때** 브라우저가 한다. 까닭: (1) Cron에는 로그인 세션이 없어 관리자 표를 RLS로 못 읽는다 → 고시·공지처럼 모으기 계정·비밀번호·공개 경로가 또 생긴다 (2) 알림은 대시보드에서만 보이므로 열 때 확인해도 같은 날 보인다 (3) 서버는 지금처럼 바깥 자료만 대신 부른다. 대가: 대시보드를 한 달 넘게 안 열면 늦는다.
- `dueCandidates(rows, today)`: `status ≠ dropped`이고 `watch_checked_on`이 null이거나 30일 넘음, 만든 차례 앞 5곳. 기간 = (`watch_checked_on` ?? 오늘 − 30) + 1일 ~ 오늘 − 2일(자료가 2일 늦음). 같은 기간 `clinic-license` open·close를 한 번씩 받아 후보끼리 나눠 쓴다.
- `pickEvents(rows, cand)`: 범위 안 + 과목·이름에 정형외과·마취통증의학과·재활의학과 → 줄(같은 줄은 DB unique로 한 번). 다 넣은 뒤 `watch_checked_on = 오늘`.
- `useLocationWatch(isAdmin, today)`: 대시보드가 열릴 때 한 번, 20초 한도, 실패는 조용히. `LocationAlert`: 안 본 줄을 최근 차례 셋 + `… {n}건 더`. 자리는 `WarrantyNotice` 바로 아래(같은 네 자리). `dashboard/page.tsx`가 `currentMe()`의 `isAdmin`을 넘긴다. 후보 화면을 열면 그 후보 줄의, [닫기]를 누르면 보이던 줄 모두의 `seen_at`을 채운다(사용자 2026-11-22 시안 승인 때 [닫기]를 두기로 함 — 다음 확인에서 새 줄이 생기면 다시 뜬다).

## 13. 지도 · CSP · 링크
- `map/useKakaoSdk.ts`: 한 번만 `<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=<NEXT_PUBLIC_KAKAO_MAP_KEY>&autoload=false">` → `kakao.maps.load`. 열쇠가 비면 불러오지 않는다. 실패는 `E-LOC-MAP`. `KakaoMap`(가운데·범위 원·표시·동 다각형·찍기·지도/하늘 사진) · `Roadview`(`RoadviewClient.getNearestPanoId(점, 50)`, 없으면 `이 자리 50m 안에는 거리 사진이 없어요`). 시험은 `window.kakao`를 흉내 낸다.
- CSP: `buildCsp(isDev, supabaseUrl, { kakao: true })`가 더하는 처음 목록(확인할 것 7로 브라우저 위반 기록을 보고 정확히 맞춤, 와일드카드 없음): script-src `https://dapi.kakao.com` `https://t1.daumcdn.net` · img-src `https://t1.daumcdn.net` `https://map0.daumcdn.net`~`https://map3.daumcdn.net`(넷 따로) `https://mts.daumcdn.net` `https://s1.daumcdn.net` · connect-src `https://dapi.kakao.com`. `next.config.ts` `headers()`에 전체 줄 뒤로 `/location`·`/location/:path*` 줄을 더한다(Next는 같은 이름 머리를 뒤 줄로 덮는다): 카카오 CSP + `Referrer-Policy: strict-origin-when-cross-origin`.
- `links.ts`: 네이버 둘 가운데 하나(확인 뒤 하나만 남김) `https://m.land.naver.com/map/{lat}:{lng}:16/SG:SMS/A1:B2` · `https://fin.land.naver.com/map?center={lng}-{lat}&zoom=16` · 토지이음 `https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?selGbn=umd&isNoScr=script&mode=search&pnu={PNU}` · 인터넷 등기소 `https://www.iros.go.kr/index.jsp`(첫 화면만) · 법령은 `LAW_BASIS.url`. 모두 새 창 `noopener noreferrer`.

## 14. 화면
- `(app)/location/page.tsx`: `guardPage('/location')`, 탭 이름 `입지 분석`, `searchParams`의 `tab`(일곱 가운데)·`c`(uuid)를 넘긴다. `gate.ts` `isAdminPath`에 `/location` 더함.
- 탭: `menu.ts`에 `LOCATION_TAB = { label: '입지 분석', path: '/location', href: '/location', ready: true, primary: false }`(MENU 밖). `MoreMenu`가 관리자일 때 '주소록' 다음에 끼우고, `currentMenuLabel`도 본다. `AppShell`이 `isAdmin`을 넘긴다(데스크는 늘 없음).
- `LocationScreen`: 머리(h1·`관리자만 보여요`·[후보 더하기]) · 안쪽 탭 여섯(동네 훑기·후보 자세히·매물·후보 견주기·개원 준비·근거와 출처) · 후보 고르기 · 처음(후보 없음) · 열쇠 없음(`keys`가 data·kakao 둘 다 `missing`) · 보고서(`tab=report`). `useLocation`이 표 여섯·`keys`·지금 의원 H를 열 때 한 번 읽고, 모으기는 동시에 4개(진행 `자료 {n}/{m}`).
- 부품은 props·콜백만(읽기·저장·fetch 없음): `scan/`(시도·시군구 고르기·색 지도·순위·무게 막대·동 자세히) · `detail/frame/`(위험 신호·종합·범위·목차·[오늘 값으로 다시 받기], 묶음은 칸(slot)으로 받아 직접 부르지 않음) · `detail/{people,demand,rivals,site}/`(묶음 열둘을 넷으로: 사는 사람·소득·앞으로 / 수요·교통·둘레 시설 / 경쟁 의원·진료비·빈틈 / 거리 사진·건물·빈 칸·땅) · `listings/`(목록·거르기·견주기 글·붙여 넣기 칸·협상표·[주소록에 넣기]) · `add/`(세 길 판) · `compare/` · `report/`(`print:` 클래스로 앱 틀 숨김, A4) · `prep/plan/`(예상 환자·비용·일정) · `prep/visit/`(건물 요건·계약 전 위험·점검표·사진·메모·진행 상태) · `common/`(숫자 칸 `Fact`·출처 줄 `SourceLine`·자료 없음 글 `WhyLine`) · `sources/` · `start/`.
- [주소록에 넣기]: `lib/storage/contacts.ts`의 업체·담당자 저장 함수를 그대로 부른다(분류 `other`, 하는 일 `부동산 중개`, 겹침 `duplicate`면 그 업체를 찾아 잇기). 주소록 코드는 고치지 않는다.
- 사진: `components/inventory/photo.ts`의 `shrinkPhoto`(긴 변 1,600px JPEG)를 불러 쓴다(고치지 않음).
- PC 배치 하나: 지도·두 칸 틀은 최소 폭 1,024px, 좁으면 그 감싸개 안에서 `overflow-x: auto`. `max-md:` 없음. 색·글꼴은 앱 토큰(`docs/UI_GUIDE.md`).

## 15. 오류 · 자료 없음 글
| 번호 | what | fix |
|---|---|---|
| `E-LOC-READ-FAILED` | 입지 분석 자료를 읽지 못했어요 | 인터넷 연결을 확인하고 [다시 읽기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |
| `E-LOC-SAVE-FAILED` | 저장하지 못했어요 | 적은 값은 그대로 있어요. 인터넷 연결을 확인하고 잠시 뒤 다시 해 주세요. |
| `E-LOC-SOURCE` | 바깥 자료를 받지 못했어요 | 잠시 뒤 [다시 받기]를 눌러 주세요. 저장한 후보는 지난 값을 그대로 보여 줘요. |
| `E-LOC-MAP` | 지도를 불러오지 못했어요 | 카카오 개발자 화면에 이 사이트 주소가 등록됐는지, 지도 열쇠가 맞는지 확인해 주세요. 숫자는 지도 없이도 볼 수 있어요. |
| `E-LOC-PHOTO` | 사진을 올리지 못했어요 | JPEG·PNG·WEBP 사진만, 후보마다 30장까지 올릴 수 있어요. 잠시 뒤 다시 올려 주세요. |
- 칸 글(`WhyLine`): `no-key` `{자료 이름}: 열쇠를 넣으면 보여요.`(카카오는 그 열쇠 이름) · `not-applied` `공공데이터포털에서 '{자료 이름}' 활용신청을 하면 보여요.` · `failed` `지금 받지 못했어요.` [다시 받기](옛 값이 있으면 `지난 값 · 기준 {날짜}`) · `none` `SOURCES.noneText` · `outside` `이 지역은 자료 없음` · `capped` `{n}곳 넘게 있어요. 가까운 {n}곳만 셌어요.`
- 열쇠 없음 화면: `자료 열쇠를 넣으면 시작할 수 있어요` / `공공데이터포털 열쇠와 카카오 열쇠는 Vercel 환경 변수에 넣어요. 넣는 법은 Claude가 한 단계씩 안내해요. 열쇠는 대화창에 붙이지 마세요.` / `열쇠 없이도 되는 것: 매물 붙여 넣기 · 진행 메모 · 개원 비용 계산.` 지도 열쇠만 없음: `카카오 지도 열쇠를 넣으면 지도가 보여요. 숫자는 지도 없이도 볼 수 있어요.`

## 16. ADR 글 (TASK-1이 `docs/ADR.md` 끝에 넣음. 다른 갈래가 먼저 042~044를 쓰면 다음 번호로 바꾸고 이 글의 번호만 고친다)

### ADR-042: 입지 분석은 서버 경로가 바깥 공개 자료를 대신 부른다 (관리자만, Claude 아님)
**맥락**: 입지 분석(specs/location)은 공공데이터포털·카카오 로컬 자료가 필요하고 둘 다 열쇠가 있어야 한다. 열쇠를 브라우저에 두면 드러나고, 공공데이터포털은 브라우저 부르기(CORS)도 막는다. 서버 코드는 `app/api/ai/` 하나뿐이다(ADR-004).
**결정** (호출한 쪽 설계 결정 + Claude 판단, 2026-11-22):
- `POST /api/ai/location/query`·`GET /api/ai/location/keys` 두 경로를 `app/api/ai/location/` 아래 둔다. Claude는 부르지 않는다 — AI 폴더를 서버 코드 자리로 쓰는 예외다.
- 열쇠 `DATA_GO_KR_KEY`(디코딩 열쇠)·`KAKAO_REST_KEY`는 Vercel 환경 변수와 `.env.local`에만. 앱 화면에 열쇠 칸을 두지 않는다.
- 서버가 로그인·승인된 병원·`admins` 줄을 확인한다. 아니면 401·403이고 바깥에 부르지 않는다.
- 정해 둔 종류·칸만 받고 정해 둔 host만 부른다(redirect 없음, 8초, 2MB). 서버는 DB에 쓰지 않는다(저장은 브라우저가 RLS로). 카카오 답은 서버에도 담아 두지 않는다. 메모리 보관은 전국 역 목록(공공) 하나, 하루.
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
**결정**: 저장하는 것은 design.md 6절 '저장하는 것' 목록뿐이다. 카카오에서 받은 주소 글·좌표·장소 목록·거리·로드뷰·법정동 코드는 저장하지 않고 열 때마다 부른다. 점수는 공공 자료(역·정류장 포함)만 써서 굳힌다. 숫자마다 출처 id·기준 날짜를 달고, 출처·법 근거·없는 자료 목록은 `lib/location/sources.ts` 한 곳이다. 동 경계는 국가데이터처 SGIS 경계(이용 제한 없음)를 줄여 `public/location/dongs/`에 둔다(반기마다 사람이 바꿈).
**대안**: (1) 둘레 시설도 저장 — 정책 위반. (2) 아무것도 굳히지 않음 — 견줄 때마다 값이 바뀐다. (3) 동 경계를 그때마다 바깥에서 — 공개 API가 없거나 따로 가입해야 한다.
**트레이드오프**: 둘레 시설·거리 사진은 카카오 열쇠가 없으면 안 보이고 열 때마다 바뀐다. 동 경계·이용률·소득 파일은 사람이 새로 넣기 전까지 옛 기준 날짜를 보인다.
**바꾸는 것**: `plan.md` §2에 '2-12. 입지 분석' 몇 줄, §4 '서버로 가는 것'에 입지 분석 저장 목록, §5 DB 표에 `location_*` 한 줄. `docs/ARCHITECTURE.md` 폴더·흐름·DB 표 한 줄씩. `CLAUDE.md` 아키텍처 규칙에 '예외 (ADR-042~044)' 한 줄.
