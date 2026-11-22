// 입지 분석(specs/location)의 공용 모양. 화면·모으기·서버 경로(app/api/ai/location)가 함께 쓴다(design.md 3·4·6·7절).
// 날짜 칸은 한국 날짜 'YYYY-MM-DD', 달은 'YYYY-MM', 시각(…At)은 ISO 글자. 금액은 원 정수, 넓이는 ㎡, 거리는 m

// ── 출처 · 열쇠 ─────────────────────────────────────────

// SOURCES(lib/location/sources.ts)의 id. 두 파일을 같은 Phase에 따로 만들려고 글자로 둔다(SOURCES에 있는 id인지는 시험이 본다)
export type SourceId = string
// 열쇠 종류: 공공데이터포털(DATA_GO_KR_KEY) · 카카오 REST(KAKAO_REST_KEY). 둘 다 서버 환경 변수에만 있다(ADR-042)
export type KeyKind = 'data' | 'kakao'
// GET /api/ai/location/keys 답의 열쇠 하나: 됨 · 비었음 · 거절(401·403·미등록 열쇠) · 확인 못 함
export type KeyState = 'ok' | 'missing' | 'rejected' | 'failed'
export type KeysReply = { data: KeyState; kakao: KeyState }

// ── 자료 종류 · 몸통 (design.md 4절, 28개 — 28개째 welfare는 의료급여·차상위) ──

export type QueryKind =
  | 'k-address'
  | 'k-point'
  | 'k-near'
  | 'k-keyword'
  | 'pop-age'
  | 'household'
  | 'flow-volume'
  | 'flow-bus'
  | 'flow-rail'
  | 'accident'
  | 'apt-list'
  | 'apt-info'
  | 'presale'
  | 'apt-trade'
  | 'biz-trade'
  | 'stores'
  | 'bld-title'
  | 'bld-floor'
  | 'hosp-list'
  | 'hosp-detail'
  | 'hosp-hours'
  | 'nonpay'
  | 'clinic-license'
  | 'gym'
  | 'senior'
  | 'market'
  | 'school'
  | 'welfare'

// WGS84 점. lat 33~39 · lng 124~132, 소수 6자리까지
export type Point = { lat: number; lng: number }
// 카카오 카테고리: 지하철역 · 대형마트 · 약국 · 병원 · 학원(학교는 공공 school)
export type KakaoCategory = 'SW8' | 'MT1' | 'PM9' | 'HP8' | 'AG2'
// 심평원 병원 목록 무리: 의원(과목마다) · 치과의원(종별 51) · 한의원(종별 93) · 종합병원 이상
export type HospGroup = 'clinic' | 'dental' | 'korean' | 'big'

// ── 의원 과목 (design.md 18절, 목록·이름·코드는 lib/location/depts.ts DEPTS 한 곳) ──

// 과목 스물하나(DEPTS 차례): 심평원 의원 진료과목 열아홉 + 치과의원 · 한의원
export type DeptId =
  | 'im'
  | 'neuro'
  | 'psy'
  | 'gs'
  | 'ortho'
  | 'ns'
  | 'cs'
  | 'plastic'
  | 'pain'
  | 'obgy'
  | 'ped'
  | 'eye'
  | 'ent'
  | 'derm'
  | 'uro'
  | 'rad'
  | 'rehab'
  | 'fm'
  | 'oem'
  | 'dental'
  | 'korean'
// 의원 과목 열아홉(hosp-list clinic의 depts) — 치과의원·한의원은 종별 목록(dental·korean)으로 찾는다
export type ClinicDeptId = Exclude<DeptId, 'dental' | 'korean'>
// 의원 과목 고르기(location_settings.dept_rule): 경쟁 · 안 보기, 둘 다 아닌 과목은 둘레로 보기
export type DeptRule = { v: 1; rival: DeptId[]; hide: DeptId[] }
// 건축물대장 대지 구분: 산이면 '1', 아니면 '0'(design.md 5절)
export type PlatKind = '0' | '1'

// 건축물대장 열쇠(design.md 5절): 시군구 5 · 법정동 뒤 5 · 본번 4 · 부번 4(앞 0) · 대지 구분
type BuildingKey = { sgg: string; bjdong: string; bun: string; ji: string; plat: PlatKind }

// POST /api/ai/location/query 몸통. 종류마다 이 칸만 받는다(lib/location/query.ts checkQuery가 본다).
// 코드: dongs = 행정동 10자리(1~40개) · bjd = 법정동 10자리 · sgg = 시군구 5자리 · sido = 시도 2자리.
// 이름(sidoName·sggName)은 한글·숫자 2~40자(hosp-hours·welfare는 1~20자). ym = 'YYYY-MM'.
// r = m 정수(k-near·k-keyword·hosp-list 1~20,000, stores 30~2,000)
export type Query =
  | { kind: 'k-address'; q: string } // 2~100자(앞뒤 공백 뺌)
  | { kind: 'k-point'; at: Point }
  | { kind: 'k-near'; at: Point; r: number; cat: KakaoCategory }
  | { kind: 'k-keyword'; at: Point; r: number; q: '산업단지' }
  | { kind: 'pop-age'; dongs: string[]; ym: string } // 2022-10부터
  | { kind: 'household'; dongs: string[]; ym: string } // 2022-10부터
  | { kind: 'flow-volume'; sido: string; sgg: string; ym: string; part?: number } // sgg는 그 시도 안. part = 10쪽(1만 줄) 묶음 0~11, 빼면 0
  | { kind: 'flow-bus'; sgg: string; ym: string } // 2022-10부터(그 달 1일로 보냄)
  | { kind: 'flow-rail'; sgg: string; ym: string } // 2022-10부터
  | { kind: 'accident'; sidoName: string; sggName: string }
  | { kind: 'apt-list'; bjd: string }
  | { kind: 'apt-info'; complex: string } // 단지 코드(영문·숫자 1~20자)
  | { kind: 'presale'; sidoName: string; from: string; to: string } // 연월 둘, from ≤ to
  | { kind: 'apt-trade'; sgg: string; ym: string }
  | { kind: 'biz-trade'; sgg: string; ym: string }
  | { kind: 'stores'; at: Point; r: number }
  | ({ kind: 'bld-title' } & BuildingKey)
  | ({ kind: 'bld-floor' } & BuildingKey)
  | { kind: 'hosp-list'; at: Point; r: number; group: 'clinic'; depts: ClinicDeptId[] } // 의원 과목 1~19개(되풀이 없음) — 과목마다 목록 하나
  | { kind: 'hosp-list'; at: Point; r: number; group: Exclude<HospGroup, 'clinic'> }
  | { kind: 'hosp-detail'; ykiho: string } // 심평원 암호화 기관 기호(영문·숫자·+/= 1~200자)
  | { kind: 'hosp-hours'; sidoName: string; sggName: string } // 동 경계 목록 이름(카카오 아님)
  | { kind: 'nonpay'; ykiho: string; item: string } // 항목 코드(영문·숫자 1~20자)
  // 날짜 둘, from ≤ to ≤ from + 3년. addr = 도로명 주소 앞부분 '{시도} {시군구}'(한글 덩이를 공백 하나로, 2~40자)
  | { kind: 'clinic-license'; event: 'open' | 'close'; from: string; to: string; addr?: string }
  // 시설 넷: 시군구 이름 + 선택 시도 이름(design.md 17절 10 — 경로당 제공기관·학교 교육청은 시도 이름이 없으면 요청이 0개)
  | { kind: 'gym'; sggName: string; sidoName?: string }
  | { kind: 'senior'; sggName: string; sidoName?: string }
  | { kind: 'market'; sggName: string; sidoName?: string }
  | { kind: 'school'; sggName: string; sidoName?: string }
  // 한국사회보장정보원 시군구별 수급권자 현황(api.odcloud.kr) — 판에 코드 칸이 없어 이름으로 찾는다.
  // 후보 시군구 5자리 · 판의 시도 이름 1~2개(전남광주는 옛 둘) · 시군구 이름 1~4개(옛 구 묶음이면 옛 이름들), 되풀이 없음
  | { kind: 'welfare'; sgg: string; sidoNames: string[]; sggNames: string[] }

// 종류 하나의 몸통. Extract 대신 종류 → 몸통 판을 써서 Adapter<'k-address'>를 Adapter(모든 종류)로 넘길 수 있게 한다
// (조건 타입은 K를 고정으로 봐서 넘길 수 없다)
type QueryByKind = { [Q in Query as Q['kind']]: Q }
export type QueryOf<K extends QueryKind> = QueryByKind[K]

// ── 서버 경로 답 (design.md 3절, AC-7903.3) ────────────────

export type ReplyCode = 'no-key' | 'not-applied' | 'failed'
// 되면 값·출처·기준 날짜. 못 되면 까닭과(열쇠 없음이면) 어느 열쇠인지. 바깥 오류 글·열쇠는 담지 않는다
export type QueryReply<V = unknown> =
  | { ok: true; value: V; src: SourceId; asOf: string }
  | { ok: false; code: ReplyCode; key?: KeyKind }

// ── 읽는 곳(Adapter, design.md 4절) · 바깥 부르기 ─────────

// 바깥에 보낼 GET 하나. 주소에는 열쇠를 넣지 않는다 — fetchSource가 카카오는 Authorization 머리, 공공은 serviceKey 칸으로 넣는다
export type SiteRequest = { url: string }
// fetchSource 결과. 실패는 종류(http면 상태 번호)만, 오류 글·주소는 없다
export type SourceFail = 'http' | 'timeout' | 'too-big' | 'blocked-url'
export type SourceResult = { ok: true; text: string } | { ok: false; fail: SourceFail; status?: number }
// 답 읽기 결과. 빈 답은 실패가 아니다(빈 목록). asOf = 자료 안의 날짜, 없으면 받은 한국 날짜(today)
export type Parsed<V = unknown> = { ok: true; value: V; asOf: string } | { ok: false; code: 'not-applied' | 'failed' }

// 종류 하나를 읽는 곳(app/api/ai/location/sources/<묶음>.ts, 순수). requests는 정해 둔 쪽 수까지 요청을 만들고,
// parse는 그 차례대로 받은 답 글자를 읽는다. 열쇠는 받지 않는다(fetchSource가 넣는다).
// timeoutMs = 바깥 부르기 하나의 시간 한도(ms, 최대 60,000) — 없으면 fetchSource 기본 8초(비급여 nonpay만 60,000)
export type Adapter<K extends QueryKind = QueryKind, V = unknown> = {
  kind: K
  src: SourceId
  key: KeyKind
  timeoutMs?: number
  requests(q: QueryOf<K>): SiteRequest[]
  parse(texts: string[], q: QueryOf<K>, today: string): Parsed<V>
}
// 종류 → 읽는 곳(app/api/ai/location/registry.ts). 아직 잇지 않은 종류는 비어 있다
export type Registry = { readonly [K in QueryKind]?: Adapter<K> }

// ── 그날 값 (design.md 6절) ──────────────────────────────

export type Why = 'no-key' | 'not-applied' | 'failed' | 'none' | 'outside'
export type Got<T> =
  | { ok: true; v: T; src: SourceId; asOf: string }
  | { ok: false; why: Why; src: SourceId; prev?: { v: T; asOf: string } }

// 옛 이름(경쟁 의원 종류) — 이제 과목 id와 같다
export type RivalKind = DeptId
// 범위 안 의원 하나(심평원 의원 목록). 대표 과목은 늘 lib/location/depts.ts deptOf(이름, depts, 설정)로 센다
export type Rival = {
  name: string
  depts: DeptId[] // 찾은 과목(DEPTS 차례). 치과의원·한의원은 ['dental']·['korean']
  at: Point // 심평원 좌표(공공 자료, 카카오 아님)
  distM: number
  sameBuilding: boolean // 30m 안
  address: string // 심평원 주소 — 30m 안 의원만, 아니면 ''
  doctors: number | null
  openedYear: number | null
  // 모을 때 경쟁 과목이던 의원만. 없으면 '새로 경쟁에 넣은 과목'(AC-7921.5)
  detail?: {
    therapists: number | null
    mri: boolean | null
    ct: boolean | null
    week: ([number, number] | null)[] | null // 월~일 + 공휴일 8칸, [열·닫] 분
    priced: boolean // 비급여를 받았나 — false면 eswt·manual은 '지금 받지 못했어요'
    eswt: number | null // 체외충격파 값(원)
    manual: number | null // 도수치료 1회 값(원)
  }
}

// 점수 풀이 견줄 값(design.md 19절): 후보 시군구 전체, 모을 때 한 번, 공공 자료만. 못 센 칸은 null
export type SggAvg = {
  sggName: string
  areaM2: number // 동 경계 넓이 합
  total: number
  bands: number[] // 10세 나이대 11칸, 시군구 행정동 모두의 pop-age 합(의료급여 인구와 같은 부름을 나눠 씀)
  trendPct: number | null // (최근 10월 − 2022-10) ÷ 2022-10 × 100, 0.1 버림
  // 시군구 이름으로 받은 목록 수(동네 훑기와 같은 셈)
  accidents: number | null
  schools: number | null
  seniors: number | null
  gyms: number | null
  // 행정동 가운데 점마다 가장 가까운 역 거리 · 400m 안 정류장 수의 평균, 버림
  stationM: number | null
  stops: number | null
}

// 의원 목록 칸: 바깥 답이 한도에 잘렸거나 가까운 200곳·저장 크기로 줄였으면 capped: true(받은 것보다 의원이 더 있을 수 있음 —
// 화면이 '200곳 넘게 있을 수 있어요…'를 붙인다, 조용히 적게 세지 않게). 실패 칸이면 지난 값(prev)에 그대로 붙는다
export type RivalsGot =
  | { ok: true; v: Rival[]; src: SourceId; asOf: string; capped?: true }
  | { ok: false; why: Why; src: SourceId; prev?: { v: Rival[]; asOf: string; capped?: true } }

export type Snapshot = {
  v: 1
  at: string
  radiusM: number
  people: Got<{ total: number; bands: number[] /* 11칸 */; households: number; unmatched: number }>
  trend: Got<{ ym: string; total: number }[]> // 2022-10~ 해마다 10월
  flow: Got<{
    ym: string
    stations: { name: string; line: string; distM: number; perDay: number }[] // 범위 안 하루 평균 승하차
    stops: { name: string; distM: number; perDay: number }[]
    total: number
    unmatched: number // 좌표를 못 이은 정류장 수
  }> // 60개씩까지
  // sidoName·sidoWon = income.json 시·도 평균(시·도 합계 금액 ÷ 합계 인원, 사용자 2026-11-23). 그 칸이 없는 옛 값은 견주지 않는다
  income: Got<{ sggName: string; won: number; year: number; sidoName?: string | null; sidoWon?: number | null }>
  aptPrice: Got<{ perM2: number; deals: number }> // 지난 6달
  bizPrice: Got<{ perM2: number; deals: number }>
  apts: Got<{ name: string; households: number; builtYear: number | null; bdongName: string }[]> // 60개까지
  presale: Got<{ name: string; households: number; moveIn: string }[]> // 30개까지
  seniors: Got<number>
  gyms: Got<number>
  schools: Got<number>
  accidents: Got<{ spots: number; cases: number }>
  industry: Got<{ sggName: string; employees: number; parks: number; quarter: string }>
  pharmacies: Got<number> // 약국 = 후보 30m 안(상가정보)
  // 이름은 옛 그대로지만 '안 보기'가 아닌 모든 과목 의원(한의원·치과 포함), 가까운 차례 200곳까지(경쟁 과목 의원은 다 남김)
  rivals: RivalsGot
  // 후보 점의 행정동(동 경계 파일, src 'dongs'). 동 밖이면 dong·dongName null
  place: Got<{ sido: string; sidoName: string; sgg: string; sggName: string; dong: string | null; dongName: string | null }>
  sggAvg: Got<SggAvg> // 점수 풀이 견줄 값(src 'pop-age')
  // 3년, 60개까지. type = 인허가 업태 글(의원·치과의원·한의원 — 치과·한의원을 업태로 가름), 그 칸이 없는 옛 줄은 빈 글자로 본다
  history: Got<{ kind: 'open' | 'close'; name: string; dept: string; type?: string; on: string; distM: number }[]>
  station: Got<{ name: string; line: string; distM: number; at: Point }> // 좌표 파일에서(at = rail.json 좌표)
  bus: Got<number>
  market: Got<{ name: string; distM: number }>
  building: Got<{
    usage: string
    structure: string
    above: number
    below: number
    totalM2: number
    approvedOn: string | null
    elevators: number | null
    parking: number | null
    floors: { label: string; usage: string; m2: number }[]
  }>
  stores: Got<{ floor: string; count: number }[]> // 후보 30m 안 가게를 층마다
  welfare: Got<{
    sggName: string
    ym: string // 그 판 기준 연월
    medical: number // 기초 의료급여 수급권자(기초생활보장 의료급여만)
    basic: number // 기초생활보장 수급권자 합계
    nearPoor: number // 차상위 3종(본인부담경감·자활·장애인) 합 — 겹칠 수 있다
    population: number | null // 같은 연월 그 시군구 주민등록 인구(pop-age 합), 못 받으면 null(비율 없음)
    basis: string | null // 옛 구 묶음 값이면 '옛 중구·동구' 모양(design.md 5절), 아니면 null
  }> // 후보 시군구 하나(또는 옛 구 묶음)
}

// 그날 값 칸 이름(판 번호·시각·범위 뺌)과 그 칸이 되었을 때의 값
export type SnapshotKey = Exclude<keyof Snapshot, 'v' | 'at' | 'radiusM'>
export type SnapshotValue<K extends SnapshotKey> = Extract<Snapshot[K], { ok: true }>['v']

// ── 계산 입력 (lib/location의 점수·위험 신호·알림·매물 견주기가 읽는 칸, design.md 8·9·11·12절) ──

// 위험 신호(lib/location/flags.ts)가 읽는 그날 값 칸. 못 받은 칸은 null
export type FlagFacts = {
  rivals: Pick<Rival, 'name' | 'depts' | 'distM' | 'doctors' | 'openedYear'>[] | null // 그날 값 의원 모두(대표 과목은 부르는 쪽이 설정으로 셈)
  history: SnapshotValue<'history'> | null // 3년 개폐업
  building: Pick<SnapshotValue<'building'>, 'approvedOn' | 'totalM2' | 'elevators'> | null
  people: Pick<SnapshotValue<'people'>, 'total' | 'bands'> | null // 10세 나이대 11칸
  station: SnapshotValue<'station'> | null // 가장 가까운 역
  bus: SnapshotValue<'bus'> | null // 400m 안 버스 정류장 수
}

/** 점수(lib/location/score.ts)에 쓰는 값. 빈칸(undefined)·null·숫자가 아닌 값은 '자료 없음'이다.
 * 후보는 그날 값·후보 줄·매물에서, 동네 훑기는 그 동 값에서 부르는 쪽이 채운다 */
export type ScoreFacts = {
  /** 범위 넓이 ㎡ — 후보 = π × 반지름², 동네 훑기 = 그 동 넓이 */
  areaM2?: number | null
  /** 범위 안 사는 사람(그날 값 people.v 모양). bands = 10세 나이대 11칸 인구(AGE_BANDS 차례) */
  people?: { total: number; bands: readonly number[]; households: number } | null
  /** 범위 안 아파트 세대 합 */
  apartments?: number | null
  /** 범위 안 입주 예정 세대 합 */
  presale?: number | null
  /** 해마다 10월 인구(2022-10부터) */
  trend?: readonly { ym: string; total: number }[] | null
  /** 범위 안 교통사고 다발 지점 수 */
  accidentSpots?: number | null
  /** 후보 시군구 산업단지 고용 인원 합 */
  industryEmployees?: number | null
  /** 범위 안 초·중·고 수 */
  schools?: number | null
  /** 범위 안 경로당 수 */
  seniorCenters?: number | null
  /** 범위 안 체력단련장 수 */
  gyms?: number | null
  /** 후보 시군구 (기초 의료급여 + 차상위 3종) ÷ 주민등록 인구 × 100(%, 소수 첫째 자리 버림) — 그날 값 welfare에서 부르는 쪽이 채운다 */
  welfareRate?: number | null
  /** n = 범위 안 경쟁 의원 수(대표 과목이 설정의 경쟁 과목인 의원) */
  rivals?: number | null
  /** 개설일이 3년 안인 경쟁 의원 수 */
  newRivals?: number | null
  /** 진료 시간 빈틈 칸 수(월~토) */
  gapCells?: number | null
  /** 경쟁 의원 체외충격파 평균 값(원) */
  rivalEswt?: number | null
  /** 지금 의원 체외충격파 값(원, location_settings.home_eswt) */
  homeEswt?: number | null
  /** 가장 가까운 역까지 m(훑기는 동 가운데에서) */
  stationM?: number | null
  /** 400m 안 버스 정류장 수(훑기는 동 가운데에서) */
  stops?: number | null
  /** 범위 안 하루 평균 승하차 합 */
  flow?: number | null
  /** 후보 층 글(floor_label) */
  floorLabel?: string | null
  elevators?: number | null
  parking?: number | null
  /** 사용승인 뒤 햇수 */
  buildingAge?: number | null
  /** 후보 30m 안 약국 수 */
  pharmacies?: number | null
  /** 후보 30m 안 의원 수(안 보기 뺌, 경쟁 포함) — 같은 건물·옆 건물을 나누지 않아 카카오 없이 센다 */
  clinicsNear?: number | null
  /** 간판 보임(사용자가 고름) */
  sign?: YesNo | null
  /** 위반 건축물(사용자가 고름) */
  violation?: YesNo | null
  /** 후보 매물 평당 월세(원) */
  rentPerPy?: number | null
  /** 후보 매물 보증금(원) */
  deposit?: number | null
  /** 후보 매물 권리금(원) */
  premium?: number | null
  /** 넓이·월세가 있는 저장 매물 모두의 평당 월세(후보 매물 포함) — 2개 미만이면 k-vsAvg 없음 */
  savedRentsPerPy?: readonly number[] | null
}

// 새 경쟁 의원 알림(lib/location/watch.ts): 후보 줄에서 읽는 칸 · clinic-license 한 줄(WGS84 점, 못 바꾼 점은 null) · 넣을 알림 줄
export type WatchStatus = CandidateStatus
// place = 그날 값 place의 시도·시군구 이름(인허가 주소 앞부분 addr을 만든다, design.md 12절) — 그날 값이 없거나 동 경계 밖이면 null
export type WatchCandidate = Pick<Candidate, 'id' | 'name' | 'status' | 'lat' | 'lng' | 'radiusM' | 'watchCheckedOn' | 'createdAt'> & {
  place?: { sidoName: string; sggName: string } | null
}
export type LicenseRow = { name: string; dept: string; openedOn: string | null; closedOn: string | null; point: Point | null; type?: string }
export type WatchEvent = Pick<LocationEvent, 'candidateId' | 'kind' | 'clinicName' | 'dept' | 'eventOn' | 'distM'>

// 매물 견주기(lib/location/listings.ts)가 읽는 매물 칸
export type ListingNumbers = Pick<Listing, 'id' | 'areaM2' | 'rent' | 'deposit'>

// ── 표 줄 (design.md 7절, 앱 쪽 모양 — lib/storage/location.ts가 DB 칸 이름과 바꾼다) ──

export type RadiusM = 300 | 500 | 700 | 1000 | 1500 | 2000 | 3000
export type CandidateStatus = 'watching' | 'contacted' | 'visited' | 'reviewing' | 'dropped'
export type YesNo = 'yes' | 'no' | 'unknown'

// location_settings: 병원마다 한 줄. scoreRule은 score.ts가 검사해 쓴다(같은 Phase라 그 모양을 여기서 부르지 않는다).
// deptRule은 읽을 때 depts.ts fillDeptRule을 거친 값(칸이 없던 옛 줄은 처음 값)
export type LocationSettings = { scoreRule: unknown; deptRule: DeptRule; homeEswt: number | null; updatedAt: string | null }

export type Candidate = {
  id: string
  name: string
  addressNote: string
  lat: number
  lng: number
  radiusM: RadiusM
  status: CandidateStatus
  floorLabel: string
  areaM2: number | null
  signVisible: YesNo | null
  violation: YesNo | null
  costs: Record<string, unknown>
  terms: Record<string, unknown>
  checks: Record<string, unknown>
  openOn: string | null
  tasksDone: string[]
  snapshot: Snapshot | null
  snapshotAt: string | null
  watchCheckedOn: string | null
  createdAt: string
  updatedAt: string
}

export type Listing = {
  id: string
  candidateId: string | null
  title: string
  url: string // '' 또는 https://
  areaM2: number | null
  floorLabel: string
  deposit: number | null
  rent: number | null
  premium: number | null
  mgmt: number | null
  brokerId: string | null
  brokerNote: string
  memo: string
  lat: number | null
  lng: number | null
  createdAt: string
  updatedAt: string
}

export type LocationNote = { id: string; candidateId: string; day: string; body: string; createdAt: string }

// path = '<hospital_id>/<candidate_id>/<uuid>.jpg'(Storage location-photos)
export type LocationPhoto = { id: string; candidateId: string; path: string; label: string; takenOn: string | null; createdAt: string }

export type LocationEvent = {
  id: string
  candidateId: string
  kind: 'open' | 'close'
  clinicName: string
  dept: string
  eventOn: string
  distM: number
  seenAt: string | null
  createdAt: string
}
