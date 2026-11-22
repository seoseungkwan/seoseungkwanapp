import { describe, expect, it } from 'vitest'
import { KEY_TEXT, LAW_BASIS, MISSING, SOURCE_GROUPS, SOURCES, VIA_TEXT, isLawId, isSourceId, lawOf, sourceOf } from './sources'

// 입지 분석 출처·법 근거·없는 자료 목록(specs/location design.md 2절, requirements '자료가 없는 것', tasks.md TASK-3).
// 사실(기관·번호·이용 조건·주기)은 조사 1~5(specs/location/research)를 따른다. 법 근거 쉬운 한 줄·없는 자료 글은 requirements '화면 글 기본값' 그대로다(TASK-50)

// 조사 1~5 표의 기관 · 공공데이터포털 번호. 번호는 url의 /data/<번호>/로 본다.
// 표준데이터 다섯(역사·사고 다발·경로당·전통시장·학교)은 조사가 기관 이름을 적지 않아 '공공데이터포털'로 적는다
const PORTAL = {
  'pop-age': ['행정안전부', '15108072'],
  household: ['행정안전부', '15108065'],
  'apt-list': ['국토교통부', '15057332'],
  'apt-info': ['국토교통부', '15058453'],
  presale: ['한국부동산원', '15098547'],
  'apt-trade': ['국토교통부', '15126468'],
  'biz-trade': ['국토교통부', '15126463'],
  stores: ['소상공인시장진흥공단', '15012005'],
  building: ['국토교통부', '15134735'],
  'hosp-list': ['건강보험심사평가원', '15001698'],
  'hosp-detail': ['건강보험심사평가원', '15001699'],
  'hosp-hours': ['국립중앙의료원', '15000736'],
  nonpay: ['건강보험심사평가원', '15001700'],
  'clinic-license': ['행정안전부', '15154874'],
  'flow-volume': ['국토교통부', '15142066'],
  'flow-bus': ['국토교통부', '15142032'],
  'flow-rail': ['국토교통부', '15142034'],
  'bus-stops': ['국토교통부', '15067528'],
  'rail-stations': ['공공데이터포털', '15013205'],
  accident: ['공공데이터포털', '15029185'],
  gym: ['행정안전부', '15155077'],
  senior: ['공공데이터포털', '15114136'],
  market: ['공공데이터포털', '15012894'],
  school: ['공공데이터포털', '15021148'],
  industry: ['한국산업단지공단', '15085886'],
  dongs: ['국가데이터처', '15129688'],
  welfare: ['한국사회보장정보원', '15062448'],
} as const

// 공공데이터포털 밖 출처(조사 1·2): 기관 · 받는 길 · 열쇠 · 자료 쪽 주소
const OTHER = {
  income: ['국세청', 'file', null, 'https://tasis.nts.go.kr'],
  'kakao-local': ['카카오', 'api', 'kakao', 'https://developers.kakao.com/docs/ko/local/dev-guide'],
  'kakao-map': ['카카오', 'app', null, 'https://apis.map.kakao.com/web/guide'],
  land: ['국토교통부', 'link', null, 'https://www.eum.go.kr'],
  iros: ['대법원', 'link', null, 'https://www.iros.go.kr/index.jsp'],
  naver: ['네이버페이', 'link', null, 'https://m.land.naver.com'],
  user: ['내가 적은 값', 'user', null, null],
} as const

// 파일로 받아 앱에 두는 것(부르기 없음): 정류장·역 좌표(TASK-30 public/location/transit) · 동 경계 · 소득 · 산업단지 고용
const FILES = ['bus-stops', 'rail-stations', 'income', 'industry', 'dongs']

// design.md 4절 종류 28개 → 그 종류가 다는 출처 id. 바깥 자료 읽는 곳(TASK-12~23)의 Adapter.src가 이 글자다
const KIND_SOURCE = {
  'k-address': 'kakao-local',
  'k-point': 'kakao-local',
  'k-near': 'kakao-local',
  'k-keyword': 'kakao-local',
  'pop-age': 'pop-age',
  household: 'household',
  'flow-volume': 'flow-volume',
  'flow-bus': 'flow-bus',
  'flow-rail': 'flow-rail',
  accident: 'accident',
  'apt-list': 'apt-list',
  'apt-info': 'apt-info',
  presale: 'presale',
  'apt-trade': 'apt-trade',
  'biz-trade': 'biz-trade',
  stores: 'stores',
  'bld-title': 'building',
  'bld-floor': 'building',
  'hosp-list': 'hosp-list',
  'hosp-detail': 'hosp-detail',
  'hosp-hours': 'hosp-hours',
  nonpay: 'nonpay',
  'clinic-license': 'clinic-license',
  gym: 'gym',
  senior: 'senior',
  market: 'market',
  school: 'school',
  welfare: 'welfare',
} as const

// design.md 6절 그날 값(Snapshot)의 숫자 칸마다 쓰는 출처 id. 화면의 숫자 칸(Fact)은 이 출처 id를 단다
const SNAPSHOT_SOURCES = {
  people: ['pop-age', 'household', 'dongs'],
  trend: ['pop-age'],
  flow: ['flow-volume', 'flow-bus', 'flow-rail', 'bus-stops', 'rail-stations'],
  income: ['income'],
  aptPrice: ['apt-trade'],
  bizPrice: ['biz-trade'],
  apts: ['apt-list', 'apt-info'],
  presale: ['presale'],
  seniors: ['senior'],
  gyms: ['gym'],
  schools: ['school'],
  accidents: ['accident'],
  industry: ['industry'],
  pharmacies: ['stores'],
  rivals: ['hosp-list', 'hosp-detail', 'hosp-hours', 'nonpay'],
  history: ['clinic-license'],
  station: ['rail-stations'],
  bus: ['bus-stops'],
  market: ['market'],
  building: ['building'],
  stores: ['stores'],
  // 의료급여·차상위(후보 시군구) + 비율의 주민등록 인구(그 판 연월 pop-age, design.md 4절)
  welfare: ['welfare', 'pop-age'],
} as const

// 그날 값이 아닌 화면 숫자: 지도·로드뷰(카카오), 붙여 넣은 매물·비용·지금 의원 체외충격파 값(사용자), 링크(토지이음·등기소·네이버)
const SCREEN_ONLY = ['kakao-local', 'kakao-map', 'user', 'land', 'iros', 'naver']

const FIELDS = ['id', 'org', 'name', 'url', 'via', 'key', 'cycle', 'unit', 'terms', 'why', 'noneText', 'checked'] as const
const TEXT_FIELDS = ['id', 'org', 'name', 'cycle', 'unit', 'terms', 'why', 'noneText', 'shows'] as const

const allText = (value: unknown) => JSON.stringify(value)

describe('AC-7906.1 SOURCES — 출처 목록', () => {
  it('AC-7906.1: 출처마다 design.md 2절 칸(id·org·name·url·via·key·cycle·unit·terms·why·noneText·checked)이 다 있다', () => {
    expect(SOURCES.length).toBeGreaterThan(0)
    for (const source of SOURCES) {
      for (const field of FIELDS) expect(Object.hasOwn(source, field), `${source.id}.${field}`).toBe(true)
      for (const field of TEXT_FIELDS) expect(source[field].trim(), `${source.id}.${field}`).not.toBe('')
      expect(['api', 'file', 'link', 'app', 'user'], source.id).toContain(source.via)
      expect(['data', 'kakao', null], source.id).toContain(source.key)
      expect(['직접', '검색만'], source.id).toContain(source.checked)
    }
  })

  it("AC-7906.1: id는 겹치지 않고 '#src-<id>' 닻에 쓸 수 있는 글자(영어 소문자·숫자·-)다", () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/)
  })

  it('AC-7906.1: 목록은 조사 표의 출처와 사용자 값 user가 빠짐없이, 그 밖의 줄 없이 있다', () => {
    expect(SOURCES.map((s) => s.id).sort()).toEqual([...Object.keys(PORTAL), ...Object.keys(OTHER)].sort())
  })

  it.each(Object.entries(PORTAL))('AC-7906.1: %s는 조사 표의 기관·공공데이터포털 번호 그대로다', (id, [org, no]) => {
    const source = sourceOf(id)
    expect(source?.org).toBe(org)
    expect(source?.url).toMatch(new RegExp(`^https://www\\.data\\.go\\.kr/data/${no}/(?:openapi|fileData|standard)\\.do$`))
  })

  it.each(Object.entries(OTHER))('AC-7906.1: %s는 기관·받는 길·열쇠·자료 쪽 주소가 조사 그대로다', (id, [org, via, key, url]) => {
    const source = sourceOf(id)
    expect(source?.org).toBe(org)
    expect(source?.via).toBe(via)
    expect(source?.key).toBe(key)
    expect(source?.url).toBe(url)
  })

  it("AC-7906.1: 주소는 모두 https이고, 주소가 없는 것은 사용자 값 user뿐이다", () => {
    for (const source of SOURCES) {
      if (source.id === 'user') expect(source.url).toBeNull()
      else expect(source.url, source.id).toMatch(/^https:\/\//)
    }
  })

  it('AC-7906.1: 공공데이터포털 자료는 열쇠 data로 볼 때 받고(api), 좌표·경계·소득·산업단지 고용은 파일로 받아 넣는다(file)', () => {
    for (const id of Object.keys(PORTAL)) {
      const source = sourceOf(id)
      if (FILES.includes(id)) {
        expect(source?.via, id).toBe('file')
        expect(source?.key, id).toBeNull()
        expect(source?.url, id).not.toContain('/openapi.do')
      } else {
        expect(source?.via, id).toBe('api')
        expect(source?.key, id).toBe('data')
      }
    }
    expect(sourceOf('income')?.via).toBe('file')
    // 열쇠는 서버가 부르는 것(api)에만 있다
    for (const source of SOURCES) expect(source.key !== null, source.id).toBe(source.via === 'api')
  })

  it("AC-7906.1: 통계청은 '국가데이터처'로 적고(SGIS 경계), 기관 이름 '통계청'은 어디에도 없다", () => {
    expect(sourceOf('dongs')?.org).toBe('국가데이터처')
    expect(allText({ SOURCES, LAW_BASIS, MISSING })).not.toContain('통계청')
  })

  it('AC-7906.1: 부동산원 임대동향·서울 생활인구·하루 이용률(15072876)·직원 월급(실태조사·구인 시세)은 넣지 않는다', () => {
    const text = allText(SOURCES)
    for (const word of ['임대동향', 'R-ONE', '15134761', '15069789', '생활인구', '열린데이터광장', 'OA-', '15072876', '이용률', '실태조사', '구인', '고용24', '월급'])
      expect(text, word).not.toContain(word)
  })

  it('AC-7906.1: 학교(15021148)·산업단지 고용(15085886) 줄과 사람 흐름 셋(15142066·15142032·15142034)·좌표 파일 둘(15067528·15013205) 줄이 있다', () => {
    expect(sourceOf('school')?.name).toBe('전국초중등학교위치표준데이터')
    expect(sourceOf('industry')?.name).toBe('전국산업단지현황통계')
    expect(sourceOf('flow-volume')?.name).toBe('정류장별 이용량')
    expect(sourceOf('flow-bus')?.name).toBe('버스정류장')
    expect(sourceOf('flow-rail')?.name).toBe('도시철도 노선별 경유역')
    expect(sourceOf('bus-stops')?.name).toBe('전국 버스정류장 위치정보')
    expect(sourceOf('rail-stations')?.name).toBe('전국도시철도역사정보표준데이터')
    // 승하차는 걷는 사람 수가 아니다(조사 4) — 왜 보나에 적는다
    expect(sourceOf('flow-volume')?.why).toContain('걷는 사람 수와 달라요')
    // 버스 정류장 좌표 파일은 국가대중교통정보센터와 이어진 지자체만 있다(조사 2·4, 화면 글은 영어 이름 대신 우리말 — TASK-63)
    expect(sourceOf('bus-stops')?.unit).toContain('국가대중교통정보센터')
  })

  it('AC-7906.1·AC-7906.3: 심평원 자료(공공누리 1유형)는 이용 조건에 출처 문구가 있다', () => {
    const hira = SOURCES.filter((s) => s.org === '건강보험심사평가원')
    expect(hira.map((s) => s.id).sort()).toEqual(['hosp-detail', 'hosp-list', 'nonpay'])
    for (const source of hira) {
      expect(source.terms, source.id).toContain('공공누리 제1유형')
      expect(source.terms, source.id).toContain(`출처: 건강보험심사평가원 '${source.name}'`)
    }
  })

  it("AC-7906.1: 조사에서 '제한 없음'인 공공데이터포털 자료는 이용 조건이 '이용허락범위 제한 없음'이다", () => {
    const free = Object.keys(PORTAL).filter((id) => !['hosp-list', 'hosp-detail', 'nonpay', 'rail-stations'].includes(id))
    for (const id of free) expect(sourceOf(id)?.terms, id).toBe('이용허락범위 제한 없음')
    // 도시철도역사 표준데이터는 기록이 엇갈린다(조사 2: 1유형/제한 없음) → 출처를 함께 적는다
    expect(sourceOf('rail-stations')?.terms).toContain('엇갈려요')
    expect(sourceOf('rail-stations')?.terms).toContain('출처: 전국도시철도역사정보표준데이터')
    // 국세청 TASIS 이용 조건은 모른다(조사 1)
    expect(sourceOf('income')?.terms).toContain('확인하지 못했어요')
  })

  it('AC-7906.1: 카카오 자료는 받은 것을 담아 두지 않는다는 이용 조건(운영정책 제5조)과 무료 한도를 적는다', () => {
    expect(sourceOf('kakao-local')?.terms).toContain('운영정책 제5조')
    expect(sourceOf('kakao-local')?.terms).toContain('100,000건')
    expect(sourceOf('kakao-map')?.terms).toContain('운영정책 제5조')
    expect(sourceOf('kakao-map')?.terms).toContain('300,000건')
    // 카카오 로컬은 한 번에 45곳까지만 준다(조사 2)
    expect(sourceOf('kakao-local')?.unit).toContain('45곳')
  })

  it("AC-7906.1: 확인은 조사 그대로 — 국세청 표 번호만 '검색만', 나머지는 '직접'(포털 기록·열어 봄 포함)이다", () => {
    expect(SOURCES.filter((s) => s.checked === '검색만').map((s) => s.id)).toEqual(['income'])
    expect(sourceOf('income')?.name).toContain('4-2-15')
  })

  it('AC-7906.1: 소득은 시·군·구 단위라 동 단위 자료가 없다고 단위에 적는다', () => {
    expect(sourceOf('income')?.unit).toContain('동 단위 자료는 없어요')
  })

  it.each(Object.entries(KIND_SOURCE))('AC-7906.1: 종류 %s의 출처 id %s가 목록에 있다', (_kind, id) => {
    expect(isSourceId(id)).toBe(true)
  })

  it('AC-7906.1: 종류는 design.md 4절의 28개다(의료급여·차상위 welfare 포함)', () => {
    expect(Object.keys(KIND_SOURCE)).toHaveLength(28)
  })

  it("AC-7906.1: 의료급여·차상위(welfare)는 조사 5 그대로 — 한국사회보장정보원 · '소득·쓸 힘' · 볼 때 받음(공공데이터포털 열쇠) · 이용 제한 없음 · 해마다 · 시·군·구", () => {
    const source = sourceOf('welfare')
    expect(source?.group).toBe('소득·쓸 힘')
    expect(source?.org).toBe('한국사회보장정보원')
    // 포털 제목 '한국사회보장정보원_복지사업 시군구별 수급권자 현황'에서 기관 이름을 뺀 것(활용신청 안내 글에 그대로 쓴다)
    expect(source?.name).toBe('복지사업 시군구별 수급권자 현황')
    // 파일 자료를 API(api.odcloud.kr)로 주는 곳이라 자료 쪽은 fileData
    expect(source?.url).toBe('https://www.data.go.kr/data/15062448/fileData.do')
    expect(source?.via).toBe('api')
    expect(source?.key).toBe('data')
    expect(source?.terms).toBe('이용허락범위 제한 없음')
    expect(source?.cycle).toContain('해마다')
    expect(source?.unit).toContain('시·군·구')
    expect(source?.unit).toContain('일반구')
    // 기초 의료급여는 기초생활보장 의료급여만 센다(다른 법 의료급여는 빠짐) · 동 단위는 없다(조사 5)
    expect(source?.unit).toContain('기초생활보장 의료급여')
    expect(source?.unit).toContain('동 단위 자료는 없어요')
    expect(source?.checked).toBe('직접')
    // 1종·2종 나눔(15150882)·동 단위 파일은 쓰지 않는다
    expect(allText(SOURCES)).not.toContain('15150882')
  })

  it.each(Object.entries(SNAPSHOT_SOURCES))('AC-7906.1: 그날 값 칸 %s의 숫자는 있는 출처 id(%j)를 가진다', (_field, ids) => {
    for (const id of ids) expect(isSourceId(id), id).toBe(true)
  })

  it('AC-7906.1: 목록의 출처는 모두 그날 값이나 화면 숫자 어딘가에 쓰인다(남는 줄이 없다)', () => {
    const used = new Set<string>([...Object.values(SNAPSHOT_SOURCES).flat(), ...SCREEN_ONLY])
    expect(SOURCES.map((s) => s.id).filter((id) => !used.has(id))).toEqual([])
  })

  it("AC-7906.1·AC-7906.3: 묶음은 '근거와 출처' 표의 차례이고 줄마다 그 가운데 하나, 묶음마다 줄이 있다", () => {
    // 묶음 이름은 requirements 승인 3 '묶음별 기관 표' 여섯 줄 그대로(경쟁 의원 묶음은 둘레 다른 과 의원도 같은 심평원 자료라 '경쟁 의원·다른 과 의원', TASK-63)
    expect(SOURCE_GROUPS).toEqual(['사는 사람·수요', '소득·쓸 힘', '경쟁 의원·다른 과 의원', '교통·흐름', '자리·건물·땅', '매물·개원 준비'])
    expect(sourceOf('hosp-list')?.group).toBe('경쟁 의원·다른 과 의원')
    for (const source of SOURCES) expect(SOURCE_GROUPS, source.id).toContain(source.group)
    for (const group of SOURCE_GROUPS) expect(SOURCES.some((s) => s.group === group), group).toBe(true)
  })

  it('AC-7906.3: 받는 길·열쇠 글이 종류마다 있다', () => {
    for (const via of ['api', 'file', 'link', 'app', 'user'] as const) expect(VIA_TEXT[via].trim(), via).not.toBe('')
    expect(KEY_TEXT.data).toContain('공공데이터포털')
    expect(KEY_TEXT.kakao).toContain('카카오')
  })

  it("AC-7906.3·AC-7917.1: 열쇠 이름은 requirements '화면 글 기본값' 열쇠 상태 글 그대로다(카카오는 '장소 찾기 열쇠')", () => {
    expect(KEY_TEXT).toEqual({ data: '공공데이터포털 열쇠', kakao: '카카오 장소 찾기 열쇠' })
  })

  it('AC-7906.1: 세대 수(household)는 행정안전부 행정동별(통반단위) 주민등록 인구 및 세대현황(15108065)이다', () => {
    const source = sourceOf('household')
    expect(source?.org).toBe('행정안전부')
    expect(source?.name).toBe('행정동별(통반단위) 주민등록 인구 및 세대현황')
    expect(source?.url).toBe('https://www.data.go.kr/data/15108065/openapi.do')
    // 법정동 자료(15108071)는 쓰지 않는다
    expect(allText(SOURCES)).not.toContain('15108071')
  })

  it('AC-7906.1·AC-7906.3: 진료비(nonpay) 줄은 체외충격파 항목 SZ084를 보고, 도수치료는 값이 있을 때만이라고 적는다', () => {
    const source = sourceOf('nonpay')
    expect(source?.unit).toContain('체외충격파 SZ084')
    expect(source?.unit).toContain('도수치료는 있을 때만')
    expect(source?.shows).toContain('도수치료 값(공개 자료에 있을 때만)')
  })

  it('AC-7906.1: sourceOf·isSourceId는 목록에 있는 id만 찾는다', () => {
    expect(sourceOf('pop-age')?.name).toBe('행정동별(통반단위) 성/연령별 주민등록 인구수')
    expect(sourceOf('nope')).toBeUndefined()
    expect(isSourceId('user')).toBe(true)
    expect(isSourceId('')).toBe(false)
    expect(isSourceId('POP-AGE')).toBe(false)
    expect(isSourceId('toString')).toBe(false)
  })
})

// 법 근거 아홉 줄: 조사 3 B의 여덟(design.md 2절 목록) + 승인된 시안의 '임대 조건'(상가건물 임대차보호법).
// id 넷(open·xray·bf·use)과 lease는 시안 LAWS 글자 그대로다(시안이 '#law-<id>'로 건다)
const LAW_IDS = ['open', 'xray', 'bf', 'use', 'violation', 'bizreg', 'nhis', 'catchment', 'lease']

// requirements '화면 글 기본값' › 법 근거 쉬운 한 줄(글자 그대로)
const LAW_SUMMARY = {
  open: '의원은 허가가 아니라 구청(보건소)에 신고해요. 정부24 기준 10일 걸려요. 물리치료실·엑스레이는 의원에 꼭 있어야 하는 것은 아니에요. 평면도와 구조 설명서를 내면 구청이 시설·소방·다른 법의 제한을 확인해요. 의원 시설 기준은 별표 3·4에 있어요.',
  xray: '쓰기 3일 전까지 신고하고, 장치 검사와 방어시설 검사를 받아요. 벽·천장·바닥에 방어벽을 두고, 2차 방어벽은 2m 이상, 조작하는 방은 1.5㎡ 이상에 검사대와 2m 넘게 떨어져야 해요.',
  bf: '의원은 넓이와 상관없이 대상이에요. 500㎡ 이상이면 접근로·전용 주차·턱 없애기·출입문·복도·계단이나 엘리베이터·장애인 화장실이 꼭 있어야 하고, 500㎡ 아래면 접근로·턱 없애기·출입문만 꼭 있어야 해요. 기존 건물에서 100㎡ 아래로 용도를 바꿔 들어가면 대상이 아니에요.',
  use: '의원은 넓이와 상관없이 제1종 근린생활시설이에요.',
  violation: '구청은 위반 건축물에 다른 법의 허가·신고를 해 주지 말라고 요청할 수 있고, 요청받은 곳은 따라야 해요. 그래서 개설 신고가 막힐 수 있어요. 위반 건축물인지 알려 주는 공개 자료는 없어서, 건축물대장을 떼어 확인하세요.',
  bizreg: '사업을 시작하고 20일 안에 해요. 시작하기 전에도 할 수 있어요.',
  nhis: '개설 신고를 한 뒤 요양기관 현황을 신고해요. 차례는 조문에서 끌어낸 것이에요.',
  catchment: "정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련이 있었어요. 환자가 오는 거리를 뒷받침하는 연구는 찾지 못해 범위는 직접 정해요(300m~3km). 그래서 기본 무게에서 '사는 사람·수요'를 '교통·흐름'보다 무겁게 둬요.",
  lease: '계약 기간(갱신)과 월세 올리는 비율에 한도가 있어요. 내 계약에 맞는지는 조문을 열어 확인해요.',
}

// 줄마다 법 이름·조항에 꼭 있어야 할 글자(조사 3 B)
const LAW_TEXT = {
  open: ['의료법', '제33조', '시행규칙 제25조', '제34조'],
  xray: ['의료법 제37조', '진단용 방사선 발생장치의 안전관리에 관한 규칙', '제3조', '제4조', '별표 2'],
  bf: ['편의증진 보장에 관한 법률 시행령', '별표 1', '별표 2'],
  use: ['건축법 시행령', '별표 1 제3호 라목'],
  violation: ['건축법', '제79조'],
  bizreg: ['소득세법 제168조', '부가가치세법 제8조'],
  nhis: ['국민건강보험법', '제43조', '시행규칙 제12조'],
  catchment: ['이선경', '가정의학회지', '2009'],
  lease: ['상가건물 임대차보호법', '제10조', '제11조'],
} as const

describe('AC-7906.1 LAW_BASIS — 법 근거', () => {
  it('AC-7906.1: 법 근거는 아홉 줄이고 id는 겹치지 않는다', () => {
    expect(LAW_BASIS.map((l) => l.id)).toEqual(LAW_IDS)
  })

  it('AC-7906.1: 줄마다 design.md 2절 칸(id·law·article·summary·url·checked)과 화면 칸(무엇·쓰는 곳)이 있다', () => {
    for (const law of LAW_BASIS) {
      for (const field of ['id', 'law', 'article', 'summary', 'url', 'checked', 'topic', 'usedIn'] as const)
        expect(Object.hasOwn(law, field), `${law.id}.${field}`).toBe(true)
      for (const field of ['law', 'article', 'summary', 'topic', 'usedIn'] as const) expect(law[field].trim(), `${law.id}.${field}`).not.toBe('')
    }
  })

  it.each(Object.entries(LAW_TEXT))('AC-7906.1: %s 줄은 조사 3 B의 법 이름·조항 그대로다', (id, words) => {
    const law = lawOf(id)
    for (const word of words) expect(`${law?.law} ${law?.article}`, word).toContain(word)
  })

  it('AC-7906.1: 법령 주소는 국가법령정보센터 https://www.law.go.kr/법령/<법 이름>이고, 연구 논문(진료권)만 주소가 없다', () => {
    for (const law of LAW_BASIS) {
      if (law.id === 'catchment') expect(law.url).toBeNull()
      else expect(law.url, law.id).toMatch(/^https:\/\/www\.law\.go\.kr\/법령\/[^/\s]+(?:\/제\d+조(?:의\d+)?)?$/)
    }
    expect(lawOf('open')?.url).toBe('https://www.law.go.kr/법령/의료법/제33조')
    expect(lawOf('violation')?.url).toBe('https://www.law.go.kr/법령/건축법/제79조')
    expect(lawOf('nhis')?.url).toBe('https://www.law.go.kr/법령/국민건강보험법/제43조')
  })

  it("AC-7906.1: 쉬운 한 줄(summary) 아홉은 requirements '화면 글 기본값' 글자 그대로다", () => {
    expect(Object.fromEntries(LAW_BASIS.map((l) => [l.id, l.summary]))).toEqual(LAW_SUMMARY)
  })

  it('AC-7906.1: 조사 3 B의 값(의원은 신고 · 3일 전 · 500㎡ · 제1종 근린생활시설 · 막힐 수 있음 · 20일 · 사는 사람)이 요약에 있다', () => {
    expect(lawOf('open')?.summary).toContain('신고')
    expect(lawOf('open')?.summary).toContain('10일')
    expect(lawOf('xray')?.summary).toContain('3일 전')
    expect(lawOf('xray')?.summary).toContain('1.5㎡')
    expect(lawOf('bf')?.summary).toContain('500㎡')
    expect(lawOf('bf')?.summary).toContain('100㎡')
    expect(lawOf('use')?.summary).toContain('제1종 근린생활시설')
    expect(lawOf('violation')?.summary).toContain('막힐 수 있어요')
    expect(lawOf('bizreg')?.summary).toContain('20일')
    expect(lawOf('catchment')?.summary).toContain('사는 사람')
  })

  it("AC-7906.1: 확인은 조사 3 B대로 '직접'이고, 조사 밖에서 더한 임대 조건(lease)만 '확인 전'이다", () => {
    for (const law of LAW_BASIS) expect(law.checked, law.id).toBe(law.id === 'lease' ? '확인 전' : '직접')
  })

  it('AC-7906.1: lawOf·isLawId는 목록에 있는 id만 찾는다(위험 신호·점검표·일정의 근거 id를 견주는 곳)', () => {
    for (const id of LAW_IDS) expect(isLawId(id), id).toBe(true)
    expect(isLawId('lease ')).toBe(false)
    expect(isLawId('toString')).toBe(false)
    expect(lawOf('nope')).toBeUndefined()
  })
})

// requirements '화면 글 기본값' › 없는 자료 표 열둘(차례 · 무엇 · 대신, 글자 그대로). id는 TASK-3이 정했고 열둘째(의료급여·차상위)는 TASK-50이 더한다
const MISSING_ROWS = [
  ['dong-income', '동 단위 소득', "국세청 시·군·구 평균(주소지 기준, 귀속 연도)을 보이고 '동 단위 자료가 없어요'라고 적어요"],
  ['violation', '위반 건축물', '공개 자료가 없어요. 건축물대장을 떼어 확인하라는 안내와 직접 고르는 칸(있음·없음·모름)만 둬요'],
  [
    'flow-gaps',
    '사람 흐름(승하차 인원)',
    "버스정보시스템이 없는 군 지역은 정류장 위치가 없어 '이 지역은 자료 없음' · KTX·일반 기차역은 없어요 · 현금으로 타거나 내릴 때 카드를 안 찍는 곳은 적게 잡혀요",
  ],
  ['senior-sports', '노인복지관 전국 목록 · 공공 체육 시설 위치', '경로당(표준데이터)과 체력단련장(행정안전부)으로 대신해요'],
  ['subway-exit', '지하철 출구 위치', '역 이름과 역까지 거리만 보여요'],
  ['industry-area', '산업단지 경계', '공공누리 4유형이라 쓰지 않아요. 이름·위치(볼 때 카카오 찾기)만 봐요 · 고용 인원은 시군구 합이에요'],
  ['therapists', '물리치료사 수', "의원이 올리지 않으면 '자료 없음'이에요"],
  ['manual-therapy', '도수치료 값', '2026년 7월부터 관리급여라 공개 자료에 값이 있을 때만 보여요. 견주기는 체외충격파 중심이에요'],
  ['naver', '네이버 부동산', '링크만 걸어요'],
  [
    'no-api',
    '1인 세대 수 · 2022년 10월 전 나이대 · 재개발 위치(서울 밖) · 직장인 수',
    '세대 수만 · 4년 추세(2022년 10월부터) · 토지이음 링크 · 사람 흐름(승하차)으로 대신해요',
  ],
  ['dong-accidents', '동 단위 교통사고 건수', '교통사고 다발 지점 수와 그 지점 사고 수로 대신해요'],
  [
    'dong-welfare',
    '동 단위 의료급여·차상위 인원 · 의료급여 1종·2종',
    '시군구 값만 보여요(동 단위 파일은 서울·일부 시군뿐) · 1종·2종 나눔은 2024년 한 번뿐이고 빠진 지역이 있어 넣지 않아요',
  ],
] as const

describe('AC-7906.1 MISSING — 자료가 없는 것', () => {
  it("AC-7906.1: requirements '없는 자료 표' 열두 줄이 차례대로 있고 줄마다 무엇이·대신 무엇을 보이나가 있다", () => {
    expect(MISSING.map((m) => m.id)).toEqual(MISSING_ROWS.map(([id]) => id))
    for (const item of MISSING) {
      expect(item.what.trim(), item.id).not.toBe('')
      expect(item.instead.trim(), item.id).not.toBe('')
    }
  })

  it.each(MISSING_ROWS)("AC-7906.1: %s 줄의 무엇·대신은 '화면 글 기본값' 글자 그대로다", (id, what, instead) => {
    const item = MISSING.find((m) => m.id === id)
    expect(item?.what).toBe(what)
    expect(item?.instead).toBe(instead)
  })

  it('AC-7906.1: 열둘째 줄(의료급여·차상위)은 시군구 값만 보이고 1종·2종 나눔은 넣지 않는다고 적는다(조사 5)', () => {
    const item = MISSING[MISSING.length - 1]
    expect(item.id).toBe('dong-welfare')
    expect(item.instead).toContain('시군구 값만')
    expect(item.instead).toContain('넣지 않아요')
  })
})

// AC-7917.1: 화면 글에 영어 낱말(사이트·도구 이름 등)이 없다. 된다: SGIS·TASIS·KTX·MRI·CT·km·PDF·A4 같은 이름·단위(m·km·㎡·km²).
// SZ084는 심평원 체외충격파 항목 번호라 이름처럼 둔다(TASK-63이 nonpay 줄에 적으라 함). 주소(url)·id·받는 길(via)·열쇠(key)는 화면 글이 아니다
const ALLOWED_LATIN = ['SGIS', 'TASIS', 'KTX', 'MRI', 'CT', 'km', 'm', 'PDF', 'A4', 'SZ084']
const latinWords = (text: string) => (text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []).filter((w) => !ALLOWED_LATIN.includes(w))

// 화면에 보이는 글: 출처(기관·자료·주기·단위·이용 조건·왜 보나·없을 때 글·화면 숫자) · 법 근거 · 없는 자료 · 열쇠·받는 길 · 묶음 이름
const SHOWN: [string, string][] = [
  ...SOURCES.flatMap((s) =>
    (['org', 'name', 'cycle', 'unit', 'terms', 'why', 'noneText', 'shows'] as const).map((f): [string, string] => [`${s.id}.${f}`, s[f]]),
  ),
  ...LAW_BASIS.flatMap((l) => (['topic', 'law', 'article', 'summary', 'usedIn'] as const).map((f): [string, string] => [`law ${l.id}.${f}`, l[f]])),
  ...MISSING.flatMap((m) => (['what', 'instead'] as const).map((f): [string, string] => [`missing ${m.id}.${f}`, m[f]])),
  ...Object.entries(KEY_TEXT).map(([k, v]): [string, string] => [`KEY_TEXT.${k}`, v]),
  ...Object.entries(VIA_TEXT).map(([k, v]): [string, string] => [`VIA_TEXT.${k}`, v]),
  ...SOURCE_GROUPS.map((g): [string, string] => [`SOURCE_GROUPS ${g}`, g]),
]

describe('AC-7917.1 화면 글에 영어 낱말이 없다', () => {
  it.each(SHOWN)('AC-7917.1: %s에 허용 목록 밖 로마자가 없다', (_where, text) => {
    expect(latinWords(text)).toEqual([])
  })

  it('AC-7917.1: 허용 목록 검사는 영어 낱말을 잡고, 이름·단위는 지나간다(검사 자체 확인)', () => {
    expect(latinWords('하루 API마다 · 웹 SDK · robots.txt · EPSG:5174 · K-apt')).toEqual(['API', 'SDK', 'robots', 'txt', 'EPSG', 'K', 'apt'])
    expect(latinWords('SGIS 경계 · KTX · MRI·CT · 300m~3km · 1.5㎡ · km² · A4 · PDF · TASIS · SZ084')).toEqual([])
  })

  it('AC-7917.1: 영어 이름은 우리말로 — 건축물대장·공동주택관리정보시스템·필지 번호·옛 좌표계·국가대중교통정보센터·정류장 번호·웹 지도·사이트가 막아 둠', () => {
    const building = sourceOf('building')
    expect(building?.name).toBe('건축물대장정보 서비스')
    // 출처 줄은 '{기관} {자료}'
    expect(`${building?.org} ${building?.name}`).toBe('국토교통부 건축물대장정보 서비스')
    expect(sourceOf('apt-info')?.unit).toContain('공동주택관리정보시스템')
    expect(sourceOf('land')?.unit).toContain('필지 번호 19자리')
    expect(sourceOf('gym')?.unit).toContain('옛 좌표계')
    expect(sourceOf('clinic-license')?.unit).toContain('옛 좌표계')
    expect(sourceOf('bus-stops')?.unit).toContain('국가대중교통정보센터')
    expect(sourceOf('bus-stops')?.unit).toContain('정류장 번호')
    expect(sourceOf('flow-bus')?.unit).toContain('정류장 번호')
    expect(sourceOf('kakao-map')?.terms).toContain('웹 지도')
    expect(sourceOf('kakao-local')?.terms).toContain('자료마다 하루 100,000건')
    expect(sourceOf('naver')?.terms).toContain('사이트가 막아 둠')
  })
})
