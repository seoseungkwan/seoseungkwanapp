// 입지 분석의 출처(SOURCES)·법 근거(LAW_BASIS)·없는 자료(MISSING) — 한 곳(specs/location design.md 2절, requirements 이 명세가 정한 것 4).
// 화면 숫자 칸·'근거와 출처'·위험 신호·점검표·일정이 이 목록만 읽어 그린다. 사실(기관·번호·이용 조건·주기)은 조사 1~5(specs/location/research) 그대로다.
// 법 근거 쉬운 한 줄(summary)·없는 자료 글은 requirements '화면 글 기본값' 글자 그대로다.
// 출처 id는 types/location.ts의 SourceId(= string, TASK-2)와 같은 글자다. 같은 Phase에서 따로 만들어 여기서는 string으로 둔다

/** 받는 길: api = 서버 경로가 볼 때 부름 · file = 파일로 받아 앱에 넣음(public/location·lib/location/data) · link = 링크만(새 창) · app = 화면이 바로 불러옴(카카오 지도 SDK) · user = 사용자가 적음 */
export type SourceVia = 'api' | 'file' | 'link' | 'app' | 'user'
/** 서버 환경 변수 열쇠: data = DATA_GO_KR_KEY · kakao = KAKAO_REST_KEY. 지도 JavaScript 키(NEXT_PUBLIC_KAKAO_MAP_KEY)는 비밀값이 아니라 여기 없다 */
export type SourceKey = 'data' | 'kakao'
/** 조사가 확인한 방법. '직접' = 페이지·조문을 열어 봄(조사 2의 '포털 기록' 포함) · '검색만' = 검색 결과로만 봄 */
export type Checked = '직접' | '검색만'

// '근거와 출처' 표의 묶음 차례(시안 SRC_GROUPS + 사람 흐름 '교통·흐름')
export const SOURCE_GROUPS = ['사는 사람·수요', '소득·쓸 힘', '경쟁 의원', '교통·흐름', '자리·건물·땅', '매물·개원 준비'] as const
export type SourceGroup = (typeof SOURCE_GROUPS)[number]

export type Source = {
  id: string
  group: SourceGroup
  /** 기관(통계청은 '국가데이터처') */
  org: string
  /** 자료 이름(공공데이터포털 자료는 포털 제목에서 기관 이름을 뺀 것 — 활용신청 안내 글에 그대로 쓴다) */
  name: string
  /** 자료 쪽 주소. 사용자 값만 없다 */
  url: string | null
  via: SourceVia
  key: SourceKey | null
  /** 고쳐지는 주기 */
  cycle: string
  unit: string
  /** 이용 조건·출처 문구 */
  terms: string
  /** 왜 보나 */
  why: string
  /** 자료가 비었을 때(why: 'none') 그 칸에 보이는 글 */
  noneText: string
  /** '근거와 출처' 표 첫 칸 — 화면에 나온 숫자 */
  shows: string
  checked: Checked
}

const FREE = '이용허락범위 제한 없음'
const portal = (no: string, page: 'openapi' | 'fileData' | 'standard') => `https://www.data.go.kr/data/${no}/${page}.do`
const hiraTerms = (name: string) => `공공누리 제1유형(출처 표시) — 출처: 건강보험심사평가원 '${name}'`

export const SOURCES: readonly Source[] = [
  // ── 사는 사람·수요 ──
  {
    id: 'pop-age',
    group: '사는 사람·수요',
    org: '행정안전부',
    name: '행정동별(통반단위) 성/연령별 주민등록 인구수',
    url: portal('15108072', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '달마다(말일 기준)',
    unit: '행정동, 10세 나이대(2022년 10월부터) → 살필 범위 안 동 넓이 비율로 나눠 더함',
    terms: FREE,
    why: '의원에 올 사람이 둘레에 얼마나 사는지, 어떤 나이대가 많은지 봐요.',
    noneText: '이 범위의 나이대 인구 자료가 없어요.',
    shows: '사는 사람 · 나이대 · 60세 이상 비율 · 4년 추세',
    checked: '직접',
  },
  {
    id: 'household',
    group: '사는 사람·수요',
    org: '행정안전부',
    name: '법정동별(행정동 통반단위) 인구 및 세대현황',
    url: portal('15108071', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '달마다(말일 기준)',
    unit: '행정동 → 살필 범위 안 동 넓이 비율로 나눠 더함',
    terms: FREE,
    why: '둘레에 사는 집(세대)이 얼마나 되는지 봐요.',
    noneText: '이 범위의 세대 수 자료가 없어요.',
    shows: '세대 수',
    checked: '직접',
  },
  {
    id: 'dongs',
    group: '사는 사람·수요',
    org: '국가데이터처',
    name: 'SGIS 행정구역 통계 및 경계',
    url: portal('15129688', 'fileData'),
    via: 'file',
    key: null,
    cycle: '반기마다',
    unit: '읍면동 경계·넓이(동마다 200점 안으로 줄임)',
    terms: FREE,
    why: '살필 범위 안 동마다 넓이 비율로 인구를 나눠 더하고, 동네 훑기 지도를 그려요.',
    noneText: '이 시·군·구의 동 경계 파일이 없어요.',
    shows: '동 경계 · 동 넓이 · 범위 안 인구 나누기',
    checked: '직접',
  },
  {
    id: 'apt-list',
    group: '사는 사람·수요',
    org: '국토교통부',
    name: '공동주택 단지 목록제공 서비스',
    url: portal('15057332', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '단지(법정동으로 찾음, 좌표 없음)',
    terms: FREE,
    why: '둘레 아파트 단지를 찾아 홍보할 차례를 정해요.',
    noneText: '범위 안 법정동에 공동주택 단지 자료가 없어요.',
    shows: '아파트 단지',
    checked: '직접',
  },
  {
    id: 'apt-info',
    group: '사는 사람·수요',
    org: '국토교통부',
    name: '공동주택 기본 정보제공 서비스',
    url: portal('15058453', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '단지(K-apt에 든 단지만, 좌표 없음)',
    terms: FREE,
    why: '둘레 아파트 세대 수와 지은 해로 홍보할 차례를 정해요.',
    noneText: '이 단지의 기본 정보가 없어요.',
    shows: '단지 세대 수 · 지은 해 · 동 수',
    checked: '직접',
  },
  {
    id: 'presale',
    group: '사는 사람·수요',
    org: '한국부동산원',
    name: '청약홈 분양정보 조회 서비스',
    url: portal('15098547', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '단지(시·도로 찾음, 좌표 없음)',
    terms: FREE,
    why: '곧 늘어날 사람(입주 예정)을 미리 봐요.',
    noneText: '이 시·도에 입주 예정 분양 정보가 없어요.',
    shows: '입주 예정 단지 · 세대 수 · 입주 때',
    checked: '직접',
  },
  {
    id: 'accident',
    group: '사는 사람·수요',
    org: '공공데이터포털',
    name: '전국교통사고다발지역표준데이터',
    url: portal('15029185', 'standard'),
    via: 'api',
    key: 'data',
    cycle: '해마다(최근 2025-09-25)',
    unit: '사고 다발 지점(좌표·영역) → 살필 범위 안',
    terms: FREE,
    why: '교통사고 환자도 정형외과에 와요.',
    noneText: '범위 안에 교통사고 다발 지점이 없어요.',
    shows: '교통사고 다발 지점 수 · 그 지점 사고 수',
    checked: '직접',
  },
  {
    id: 'school',
    group: '사는 사람·수요',
    org: '공공데이터포털',
    name: '전국초중등학교위치표준데이터',
    url: portal('15021148', 'standard'),
    via: 'api',
    key: 'data',
    cycle: '수시',
    unit: '학교 좌표 → 살필 범위 안 수',
    terms: FREE,
    why: '학생 운동 손상과 학부모 환자를 짐작해요.',
    noneText: '범위 안에 초·중·고가 없어요.',
    shows: '초·중·고 수',
    checked: '직접',
  },
  {
    id: 'senior',
    group: '사는 사람·수요',
    org: '공공데이터포털',
    name: '전국마을회관및경로당표준데이터',
    url: portal('15114136', 'standard'),
    via: 'api',
    key: 'data',
    cycle: '해마다',
    unit: '경로당 좌표 → 살필 범위 안 수',
    terms: FREE,
    why: '어르신이 모이는 곳이 많은지 봐요.',
    noneText: '범위 안에 경로당이 없어요.',
    shows: '경로당 수',
    checked: '직접',
  },
  {
    id: 'gym',
    group: '사는 사람·수요',
    org: '행정안전부',
    name: '생활_체력단련장업 조회서비스',
    url: portal('15155077', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '날마다',
    unit: '체력단련장 좌표(EPSG:5174를 바꿈) → 살필 범위 안 수, 필라테스는 빠질 수 있음',
    terms: FREE,
    why: '운동하다 다치는 사람이 많은 동네인지 짐작해요.',
    noneText: '범위 안에 체력단련장이 없어요.',
    shows: '체력단련장 수',
    checked: '직접',
  },
  {
    id: 'industry',
    group: '사는 사람·수요',
    org: '한국산업단지공단',
    name: '전국산업단지현황통계',
    url: portal('15085886', 'fileData'),
    via: 'file',
    key: null,
    cycle: '석 달마다',
    unit: '산업단지 → 시·군·구로 묶어 합(단지 위치가 없어요)',
    terms: FREE,
    why: '일하다 다치는 환자를 짐작해요.',
    noneText: '이 시·군·구에는 산업단지 고용 자료가 없어요.',
    shows: '산업단지 고용 인원(시·군·구)',
    checked: '직접',
  },
  // ── 소득·쓸 힘 ──
  {
    id: 'income',
    group: '소득·쓸 힘',
    org: '국세청',
    name: '국세통계 4-2-15 시군구별 근로소득 연말정산 신고현황(주소지)',
    url: 'https://tasis.nts.go.kr',
    via: 'file',
    key: null,
    cycle: '해마다(약 1년 늦음)',
    unit: '시·군·구, 귀속 연도 (동 단위 자료는 없어요)',
    terms: '이용 조건은 확인하지 못했어요 — 출처: 국세청 국세통계포털',
    why: '비급여 진료를 받을 쓸 힘을 짐작해요.',
    noneText: '이 시·군·구의 소득 자료가 없어요.',
    shows: '평균 소득(시·군·구)',
    checked: '검색만',
  },
  {
    id: 'welfare',
    group: '소득·쓸 힘',
    org: '한국사회보장정보원',
    name: '복지사업 시군구별 수급권자 현황',
    url: portal('15062448', 'fileData'),
    via: 'api',
    key: 'data',
    cycle: '해마다(최신 2025년 12월 기준)',
    unit: '시·군·구(일반구까지) · 기초생활보장 의료급여 기준(다른 법 의료급여는 빠짐) · 차상위 3종 합은 겹칠 수 있어요 (동 단위 자료는 없어요)',
    terms: FREE,
    why: '본인 부담이 적어 자주 오는 의료급여·차상위 이웃이 후보 시·군·구에 얼마나 사는지 봐요.',
    noneText: '이 시·군·구의 의료급여·차상위 자료가 없어요.',
    shows: '의료급여(기초)·기초생활보장 합계·차상위 3종 수급권자 수 · 주민등록 인구 대비 비율(시·군·구)',
    checked: '직접',
  },
  {
    id: 'apt-trade',
    group: '소득·쓸 힘',
    org: '국토교통부',
    name: '아파트 매매 실거래가 상세 자료',
    url: portal('15126468', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '거래 한 건(시·군·구와 계약 연월로 찾음) → 범위 안 법정동 ㎡당 평균(지난 6달)',
    terms: FREE,
    why: '집값으로 동네의 쓸 힘을 짐작해요.',
    noneText: '지난 6달 범위 안 법정동에 아파트 거래가 없어요.',
    shows: '아파트 ㎡당 거래가 · 거래 건수',
    checked: '직접',
  },
  {
    id: 'biz-trade',
    group: '소득·쓸 힘',
    org: '국토교통부',
    name: '상업업무용 부동산 매매 실거래가 자료',
    url: portal('15126463', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '거래 한 건(일반 건물은 지번이 일부만) → 범위 안 법정동 ㎡당 평균(지난 6달)',
    terms: FREE,
    why: '상가 건물 값으로 자리 값을 짐작해요.',
    noneText: '지난 6달 범위 안 법정동에 상업용 건물 거래가 없어요.',
    shows: '상업용 건물 ㎡당 거래가 · 거래 건수',
    checked: '직접',
  },
  // ── 경쟁 의원 ──
  {
    id: 'hosp-list',
    group: '경쟁 의원',
    org: '건강보험심사평가원',
    name: '병원정보서비스',
    url: portal('15001698', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '의원 하나하나(종별·진료과목·좌표·반경으로 찾음)',
    terms: hiraTerms('병원정보서비스'),
    why: '둘레 의원의 과목·의사 수·문 연 해·거리를 봐요.',
    noneText: '범위 안에서 찾은 의원이 없어요.',
    shows: '경쟁 의원 · 한의원 · 큰 병원 · 의사 수 · 문 연 해 · 거리',
    checked: '직접',
  },
  {
    id: 'hosp-detail',
    group: '경쟁 의원',
    org: '건강보험심사평가원',
    name: '의료기관별상세정보서비스',
    url: portal('15001699', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '의원 하나하나(병원정보서비스의 기호로 찾음)',
    terms: hiraTerms('의료기관별상세정보서비스'),
    why: '둘레 의원의 장비(MRI·CT)와 물리치료사 수를 봐요.',
    noneText: '이 의원이 올린 장비·인력 자료가 없어요.',
    shows: 'MRI · CT · 물리치료사 수',
    checked: '직접',
  },
  {
    id: 'hosp-hours',
    group: '경쟁 의원',
    org: '국립중앙의료원',
    name: '전국 병·의원 찾기 서비스',
    url: portal('15000736', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '의원 하나하나(요일·공휴일 진료 시간)',
    terms: FREE,
    why: '둘레 의원이 문 여는 시간을 보고 야간·주말 빈틈을 찾아요.',
    noneText: '이 의원의 진료 시간 자료가 없어요.',
    shows: '진료 시간 · 진료 시간 빈틈',
    checked: '직접',
  },
  {
    id: 'nonpay',
    group: '경쟁 의원',
    org: '건강보험심사평가원',
    name: '비급여진료비정보조회서비스',
    url: portal('15001700', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(포털 표시: 실시간)',
    unit: '의원 × 항목',
    terms: hiraTerms('비급여진료비정보조회서비스'),
    why: '체외충격파 값을 둘레 의원과 견줘요.',
    noneText: '이 의원이 올린 비급여 값이 없어요.',
    shows: '체외충격파 값 · 도수치료 값(공개 자료에 있을 때만)',
    checked: '직접',
  },
  {
    id: 'clinic-license',
    group: '경쟁 의원',
    org: '행정안전부',
    name: '건강_의원 조회서비스',
    url: portal('15154874', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '날마다(2일 늦음)',
    unit: '의원 하나하나(인허가일·폐업일, 좌표 EPSG:5174를 바꿈)',
    terms: FREE,
    why: '3년 사이 문 연 곳·닫은 곳, 이 자리에 전에 의원이 있었는지 봐요.',
    noneText: '3년 사이 범위 안에서 문 열거나 닫은 의원이 없어요.',
    shows: '3년 개업·폐업 · 전에 의원이 닫은 자리 · 대시보드 알림',
    checked: '직접',
  },
  // ── 교통·흐름 ──
  {
    id: 'flow-volume',
    group: '교통·흐름',
    org: '국토교통부',
    name: '정류장별 이용량',
    url: portal('15142066', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '모름 — 받은 자료의 달을 적어요',
    unit: '정류장·역마다 한 달 승차·하차(교통카드) → 범위 안 하루 평균 합',
    terms: FREE,
    why: '역·정류장에서 하루에 타고 내린 사람 수로 사람 흐름을 봐요. 교통카드 찍은 사람 수라 걷는 사람 수와 달라요.',
    noneText: '이 달 승하차 자료가 없어요.',
    shows: '하루 승하차 인원(역·정류장)',
    checked: '직접',
  },
  {
    id: 'flow-bus',
    group: '교통·흐름',
    org: '국토교통부',
    name: '버스정류장',
    url: portal('15142032', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '모름',
    unit: '정류장(번호 → 이름·ARS 번호, 좌표 없음)',
    terms: FREE,
    why: '승하차 숫자의 정류장 번호에 이름을 붙여 좌표 파일과 이어요.',
    noneText: '정류장 이름 자료가 없어요.',
    shows: '정류장 이름(승하차 잇기)',
    checked: '직접',
  },
  {
    id: 'flow-rail',
    group: '교통·흐름',
    org: '국토교통부',
    name: '도시철도 노선별 경유역',
    url: portal('15142034', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '모름',
    unit: '역(번호 → 역 이름·노선, 좌표 없음)',
    terms: FREE,
    why: '승하차 숫자의 역 번호에 이름·노선을 붙여 좌표 파일과 이어요.',
    noneText: '역 이름 자료가 없어요.',
    shows: '역 이름·노선(승하차 잇기)',
    checked: '직접',
  },
  {
    id: 'bus-stops',
    group: '교통·흐름',
    org: '국토교통부',
    name: '전국 버스정류장 위치정보',
    url: portal('15067528', 'fileData'),
    via: 'file',
    key: null,
    cycle: '해마다(최근 2026-11-09)',
    unit: '정류장 좌표(TAGO와 이어진 지자체만, ARS 번호는 빈 곳이 있음)',
    terms: FREE,
    why: '정류장 자리를 알아 범위 안 승하차와 정류장 수를 세요.',
    noneText: '범위 안에 버스 정류장이 없어요.',
    shows: '400m 안 버스 정류장 수 · 정류장 자리',
    checked: '직접',
  },
  {
    id: 'rail-stations',
    group: '교통·흐름',
    org: '공공데이터포털',
    name: '전국도시철도역사정보표준데이터',
    url: portal('15013205', 'standard'),
    via: 'file',
    key: null,
    cycle: '해마다(2024-12-31 기준)',
    unit: '도시철도역 좌표(KTX·일반 기차역은 없음)',
    terms: '기록이 엇갈려요(공공누리 제1유형 / 이용허락범위 제한 없음) — 출처: 전국도시철도역사정보표준데이터',
    why: '역 자리를 알아 가장 가까운 역과 범위 안 승하차를 세요.',
    noneText: '가까운 도시철도역이 없어요.',
    shows: '가장 가까운 역 · 역까지 거리 · 역 자리',
    checked: '직접',
  },
  {
    id: 'market',
    group: '교통·흐름',
    org: '공공데이터포털',
    name: '전국전통시장표준데이터',
    url: portal('15012894', 'standard'),
    via: 'api',
    key: 'data',
    cycle: '해마다',
    unit: '시장 좌표 → 가장 가까운 시장',
    terms: FREE,
    why: '시장은 어르신이 자주 오가는 길이에요.',
    noneText: '가까운 전통시장이 없어요.',
    shows: '가장 가까운 전통시장 · 거리',
    checked: '직접',
  },
  // ── 자리·건물·땅 ──
  {
    id: 'building',
    group: '자리·건물·땅',
    org: '국토교통부',
    name: '건축HUB 건축물대장정보 서비스',
    url: portal('15134735', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '달마다',
    unit: '건물 · 층(표제부·층별개요)',
    terms: FREE,
    why: '가지 않고 층 용도·넓이·지은 해·승강기·주차를 확인해요.',
    noneText: '이 지번에 건축물대장이 없어요.',
    shows: '용도 · 구조 · 층수 · 연면적 · 사용승인일 · 승강기 · 주차 · 층마다 용도·넓이',
    checked: '직접',
  },
  {
    id: 'stores',
    group: '자리·건물·땅',
    org: '소상공인시장진흥공단',
    name: '상가(상권)정보',
    url: portal('15012005', 'openapi'),
    via: 'api',
    key: 'data',
    cycle: '수시(파일은 석 달마다, 최근 2026-10-30)',
    unit: '가게 하나하나(좌표, 층 칸은 비어 있을 수 있음)',
    terms: FREE,
    why: '층마다 어떤 가게가 있는지 보고 빈 층을 짐작해요.',
    noneText: '이 자리 둘레에 가게 자료가 없어요.',
    shows: '층마다 가게 · 빈 층 짐작 · 30m 안 약국',
    checked: '직접',
  },
  {
    id: 'land',
    group: '자리·건물·땅',
    org: '국토교통부',
    name: '토지이음(토지이용계획)',
    url: 'https://www.eum.go.kr',
    via: 'link',
    key: null,
    cycle: '볼 때마다(링크)',
    unit: '땅(필지, PNU 19자리)',
    terms: '링크만 걸어요(새 창)',
    why: '땅 쓰임(용도지역)과 도로·재개발 계획을 봐요.',
    noneText: '이 자리의 필지 번호를 만들지 못해 링크가 없어요.',
    shows: '용도지역 · 지구단위계획 · 도로 계획(링크)',
    checked: '직접',
  },
  {
    id: 'iros',
    group: '자리·건물·땅',
    org: '대법원',
    name: '인터넷등기소',
    url: 'https://www.iros.go.kr/index.jsp',
    via: 'link',
    key: null,
    cycle: '볼 때마다(링크)',
    unit: '부동산(첫 화면에서 주소로 찾음)',
    terms: '링크만 걸어요(첫 화면). 첫 화면이 키보드 보안 프로그램 설치를 요구할 수 있어요.',
    why: '계약 전에 등기부의 근저당·소유자를 확인해요.',
    noneText: '특정 부동산으로 바로 가는 주소는 없어요. 첫 화면에서 찾아요.',
    shows: '등기부(링크)',
    checked: '직접',
  },
  {
    id: 'kakao-local',
    group: '자리·건물·땅',
    org: '카카오',
    name: '로컬(주소·장소 찾기)',
    url: 'https://developers.kakao.com/docs/ko/local/dev-guide',
    via: 'api',
    key: 'kakao',
    cycle: '볼 때마다 새로 받음',
    unit: '장소 하나하나(한 번에 45곳까지)',
    terms: '하루 API마다 100,000건 · 받은 주소·좌표·장소 목록은 담아 두지 않아요(카카오 운영정책 제5조)',
    why: '주소로 자리를 찾고, 둘레 역·약국·마트·큰 병원·중개업소와 산업단지를 지도에 보여요.',
    noneText: '이 범위에서 찾은 곳이 없어요.',
    shows: '주소 찾기 · 지도의 역·약국·마트·큰 병원·중개업소 · 산업단지 이름·위치',
    checked: '직접',
  },
  {
    id: 'kakao-map',
    group: '자리·건물·땅',
    org: '카카오',
    name: '지도(하늘 사진·로드뷰)',
    url: 'https://apis.map.kakao.com/web/guide',
    via: 'app',
    key: null,
    cycle: '볼 때마다',
    unit: '지도·거리 사진',
    terms: '하루 300,000건(웹 SDK) · 개발자 계정의 첫 앱에만 무료 · 담아 두기·재판매·다른 곳에 주기 금지(카카오 운영정책 제5조)',
    why: '가지 않고 지도·하늘 사진·거리 사진으로 자리를 봐요.',
    noneText: '이 자리 50m 안에는 거리 사진이 없어요',
    shows: '지도 · 하늘 사진 · 거리 사진(로드뷰)',
    checked: '직접',
  },
  // ── 매물·개원 준비 ──
  {
    id: 'naver',
    group: '매물·개원 준비',
    org: '네이버페이',
    name: '부동산',
    url: 'https://m.land.naver.com',
    via: 'link',
    key: null,
    cycle: '볼 때마다(링크)',
    unit: '매물(링크만)',
    terms: '링크만 걸어요. 자동으로 긁어 오지 않아요(약관·robots.txt).',
    why: '마음에 드는 매물을 찾아 붙여 넣어요.',
    noneText: '매물은 붙여 넣은 것만 보여요.',
    shows: '매물 보기(링크)',
    checked: '직접',
  },
  {
    id: 'user',
    group: '매물·개원 준비',
    org: '내가 적은 값',
    name: '붙여 넣은 매물·적은 값',
    url: null,
    via: 'user',
    key: null,
    cycle: '내가 고칠 때',
    unit: '매물 · 칸',
    terms: '내가 적은 값이라 이용 조건이 없어요.',
    why: '중개사·부동산 사이트에서 본 값과 직접 확인한 것을 그대로 적어 둬요.',
    noneText: '아직 적은 값이 없어요.',
    shows: '평수 · 층 · 보증금 · 월세 · 권리금 · 관리비 · 중개사 · 개원 비용 · 점검표 · 지금 의원 체외충격파 값',
    checked: '직접',
  },
]

/** '근거와 출처' 표의 받는 길 글 */
export const VIA_TEXT: Record<SourceVia, string> = {
  api: '볼 때 받음',
  file: '파일로 받아 넣음',
  link: '링크만',
  app: '화면에서 바로 불러옴(카카오 지도 열쇠)',
  user: '직접 적기',
}

/** 열쇠 이름(열쇠 없음 글·'근거와 출처' 받는 길) */
export const KEY_TEXT: Record<SourceKey, string> = {
  data: '공공데이터포털 열쇠',
  kakao: '카카오 REST 열쇠',
}

export function sourceOf(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id)
}

export function isSourceId(id: string): boolean {
  return sourceOf(id) !== undefined
}

/** 법 근거 한 줄. lease만 조사 밖(시안 '임대 조건')이라 '확인 전'이다 */
export type LawBasis = {
  id: string
  /** '근거와 출처' 법 근거 표 첫 칸 — 무엇 */
  topic: string
  law: string
  article: string
  summary: string
  /** 화면에서 쓰는 곳 */
  usedIn: string
  /** 국가법령정보센터 주소(https://www.law.go.kr/법령/<법 이름>[/<조>]). 연구 논문(진료권)은 없다 */
  url: string | null
  checked: Checked | '확인 전'
}

const LAW_GO = 'https://www.law.go.kr/법령/'

// 조사 3 B의 여덟 + 시안 '임대 조건'. id 넷(open·xray·bf·use)과 lease는 시안 LAWS 글자 그대로다
export const LAW_BASIS: readonly LawBasis[] = [
  {
    id: 'open',
    topic: '의원 개설 신고',
    law: '의료법 · 의료법 시행규칙',
    article: '의료법 제33조 제2·3항 · 시행규칙 제25조 · 제34조(별표 3·4)',
    summary:
      '의원은 허가가 아니라 구청(보건소)에 신고해요. 정부24 기준 10일 걸려요. 물리치료실·엑스레이는 의원에 꼭 있어야 하는 것은 아니에요. 평면도와 구조 설명서를 내면 구청이 시설·소방·다른 법의 제한을 확인해요. 의원 시설 기준은 별표 3·4에 있어요.',
    usedIn: '건물 요건 표 › 보건소 신고 조건 · 개원 일정표 › 의원 개설 신고',
    url: `${LAW_GO}의료법/제33조`,
    checked: '직접',
  },
  {
    id: 'xray',
    topic: '방사선 장치',
    law: '의료법 · 진단용 방사선 발생장치의 안전관리에 관한 규칙',
    article: '의료법 제37조 · 규칙 제3조 · 제4조 · 별표 2',
    summary:
      '쓰기 3일 전까지 신고하고, 장치 검사와 방어시설 검사를 받아요. 벽·천장·바닥에 방어벽을 두고, 2차 방어벽은 2m 이상, 조작하는 방은 1.5㎡ 이상에 검사대와 2m 넘게 떨어져야 해요.',
    usedIn: '건물 요건 표 › 엑스레이실 방사선 막는 벽 · 개원 일정표 › 방사선 장비 신고',
    url: `${LAW_GO}진단용방사선발생장치의안전관리에관한규칙/제3조`,
    checked: '직접',
  },
  {
    id: 'bf',
    topic: '장애인 편의시설',
    law: '장애인·노인·임산부 등의 편의증진 보장에 관한 법률 시행령',
    article: '별표 1 · 별표 2',
    summary:
      '의원은 넓이와 상관없이 대상이에요. 500㎡ 이상이면 접근로·전용 주차·턱 없애기·출입문·복도·계단이나 엘리베이터·장애인 화장실이 꼭 있어야 하고, 500㎡ 아래면 접근로·턱 없애기·출입문만 꼭 있어야 해요. 기존 건물에서 100㎡ 아래로 용도를 바꿔 들어가면 대상이 아니에요.',
    usedIn: '건물 요건 표 › 장애인 경사로·출입구, 장애인 화장실 · 위험 신호 › 승강기 없음',
    url: `${LAW_GO}장애인ㆍ노인ㆍ임산부등의편의증진보장에관한법률시행령`,
    checked: '직접',
  },
  {
    id: 'use',
    topic: '건물 용도',
    law: '건축법 시행령(용도별 건축물의 종류)',
    article: '별표 1 제3호 라목',
    summary: '의원은 넓이와 상관없이 제1종 근린생활시설이에요.',
    usedIn: '건물 서류 › 용도 · 건물 요건 표 › 건물 용도',
    url: `${LAW_GO}건축법시행령`,
    checked: '직접',
  },
  {
    id: 'violation',
    topic: '위반 건축물',
    law: '건축법',
    article: '제79조 제1~4항 · 의료법 시행규칙 제25조 제3항 제4호',
    summary:
      '구청은 위반 건축물에 다른 법의 허가·신고를 해 주지 말라고 요청할 수 있고, 요청받은 곳은 따라야 해요. 그래서 개설 신고가 막힐 수 있어요. 위반 건축물인지 알려 주는 공개 자료는 없어서, 건축물대장을 떼어 확인하세요.',
    usedIn: '위험 신호 › 위반 건축물 · 건물 요건 표 › 보건소 신고 조건',
    url: `${LAW_GO}건축법/제79조`,
    checked: '직접',
  },
  {
    id: 'bizreg',
    topic: '사업자등록',
    law: '소득세법 · 부가가치세법',
    article: '소득세법 제168조 · 부가가치세법 제8조',
    summary: '사업을 시작하고 20일 안에 해요. 시작하기 전에도 할 수 있어요.',
    usedIn: '개원 일정표(개설 신고 → 사업자등록 → 요양기관 신고 차례)',
    url: `${LAW_GO}소득세법/제168조`,
    checked: '직접',
  },
  {
    id: 'nhis',
    topic: '요양기관 신고',
    law: '국민건강보험법 · 국민건강보험법 시행규칙',
    article: '국민건강보험법 제43조 · 시행규칙 제12조',
    summary: '개설 신고를 한 뒤 요양기관 현황을 신고해요. 차례는 조문에서 끌어낸 것이에요.',
    usedIn: '개원 일정표 › 요양기관 신고',
    url: `${LAW_GO}국민건강보험법/제43조`,
    checked: '직접',
  },
  {
    id: 'catchment',
    topic: '진료권(환자가 오는 거리)',
    law: '이선경 외, 가정의학회지 2009;30(4):292-300',
    article: '초록',
    summary:
      "정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련이 있었어요. 환자가 오는 거리를 뒷받침하는 연구는 찾지 못해 범위는 직접 정해요(300m~3km). 그래서 기본 무게에서 '사는 사람·수요'를 '교통·흐름'보다 무겁게 둬요.",
    usedIn: '점수 › 사는 사람·수요(사는 사람 밀도) · 살필 범위',
    url: null,
    checked: '직접',
  },
  {
    id: 'lease',
    topic: '임대 조건',
    law: '상가건물 임대차보호법',
    article: '제10조(계약 갱신) · 제11조(차임 등의 증감)',
    summary: '계약 기간(갱신)과 월세 올리는 비율에 한도가 있어요. 내 계약에 맞는지는 조문을 열어 확인해요.',
    usedIn: '임대 조건 협상표 › 월세 올리는 비율 · 계약 기간',
    url: `${LAW_GO}상가건물임대차보호법`,
    checked: '확인 전',
  },
]

export function lawOf(id: string): LawBasis | undefined {
  return LAW_BASIS.find((l) => l.id === id)
}

export function isLawId(id: string): boolean {
  return lawOf(id) !== undefined
}

/** 자료가 없는 것 한 줄: 무엇이 없나 · 대신 무엇을 보이나(화면에 솔직히 적는다) */
export type Missing = { id: string; what: string; instead: string }

// requirements.md '화면 글 기본값' › 없는 자료 표 열둘(차례 · 무엇 · 대신, 글자 그대로). 열둘째(의료급여·차상위)는 TASK-50이 더했다
export const MISSING: readonly Missing[] = [
  { id: 'dong-income', what: '동 단위 소득', instead: "국세청 시·군·구 평균(주소지 기준, 귀속 연도)을 보이고 '동 단위 자료가 없어요'라고 적어요" },
  { id: 'violation', what: '위반 건축물', instead: '공개 자료가 없어요. 건축물대장을 떼어 확인하라는 안내와 직접 고르는 칸(있음·없음·모름)만 둬요' },
  {
    id: 'flow-gaps',
    what: '사람 흐름(승하차 인원)',
    instead: "버스정보시스템이 없는 군 지역은 정류장 위치가 없어 '이 지역은 자료 없음' · KTX·일반 기차역은 없어요 · 현금으로 타거나 내릴 때 카드를 안 찍는 곳은 적게 잡혀요",
  },
  { id: 'senior-sports', what: '노인복지관 전국 목록 · 공공 체육 시설 위치', instead: '경로당(표준데이터)과 체력단련장(행정안전부)으로 대신해요' },
  { id: 'subway-exit', what: '지하철 출구 위치', instead: '역 이름과 역까지 거리만 보여요' },
  { id: 'industry-area', what: '산업단지 경계', instead: '공공누리 4유형이라 쓰지 않아요. 이름·위치(볼 때 카카오 찾기)만 봐요 · 고용 인원은 시군구 합이에요' },
  { id: 'therapists', what: '물리치료사 수', instead: "의원이 올리지 않으면 '자료 없음'이에요" },
  { id: 'manual-therapy', what: '도수치료 값', instead: '2026년 7월부터 관리급여라 공개 자료에 값이 있을 때만 보여요. 견주기는 체외충격파 중심이에요' },
  { id: 'naver', what: '네이버 부동산', instead: '링크만 걸어요' },
  {
    id: 'no-api',
    what: '1인 세대 수 · 2022년 10월 전 나이대 · 재개발 위치(서울 밖) · 직장인 수',
    instead: '세대 수만 · 4년 추세(2022년 10월부터) · 토지이음 링크 · 사람 흐름(승하차)으로 대신해요',
  },
  { id: 'dong-accidents', what: '동 단위 교통사고 건수', instead: '교통사고 다발 지점 수와 그 지점 사고 수로 대신해요' },
  {
    id: 'dong-welfare',
    what: '동 단위 의료급여·차상위 인원 · 의료급여 1종·2종',
    instead: '시군구 값만 보여요(동 단위 파일은 서울·일부 시군뿐) · 1종·2종 나눔은 2024년 한 번뿐이고 빠진 지역이 있어 넣지 않아요',
  },
]
