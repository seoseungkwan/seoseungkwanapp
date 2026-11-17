// 접수 현황 화면 시험의 가짜 자료(TASK-17, TASK-23이 이어 쓴다). 진짜 비트 자료는 없다:
// 이름 '가상환자NN', 차트번호 9로 시작하는 6자리, 처방 코드는 승인 시안(Main.dc.html)의 것(ESWT7 …).
// 모양은 도우미의 `GET /api/board` 답(design.md 4절, helper/src/Precheck.Core/Reception/BoardModel.cs Board.ToJson)과 같다.

/** 줄의 상태 칸(JSON lane) */
export type FakeLane = 'wait' | 'hold' | 'pay' | 'done'

/** 화면이 고르는 칸(진료 순서 + 칸 넷) */
export type FakeList = 'queue' | FakeLane

/** 줄 하나(JSON Row). 칸 이름과 차례는 BoardModel.cs WriteRow와 같다 */
export interface FakeRow {
  k: string
  lane: FakeLane
  pos: number | null
  laneLabel: string
  chart: string
  name: string
  info: string
  time: string
  waited: string
  long: boolean
  memo: string
  rxLabel: string
  rx: string
  xray: { at: string | null } | null
}

/** `GET /api/board` 200 답 */
export interface FakeBoard {
  state: 'ok'
  at: string
  /** 화면이 저절로 다시 읽는 간격(초). 도우미 ReceptionTiming.PollSeconds (AC-1403.9) */
  every: number
  /** 설정에서 만든 판 머리 값(로고·탭·안내·보이는 칸, reception-other-clinic AC-5703.1). 늘 있다 */
  cfg: FakeCfg
  counts: Record<FakeList, number>
  lists: Record<FakeList, FakeRow[]>
  /** 어레인지 표 (reception-arrange design.md 7절). 옛 도우미 답에는 없다 */
  arrange?: FakeArrange
  /** 고르기 목록 (reception-pick-lists AC-3501.4, reception-arrange-tune AC-3603.2). 어레인지를 보내는 판에만 있다 */
  picks?: FakePicks
}

// ---- 고르기 목록 (reception-pick-lists design.md 1절 · reception-arrange-tune design.md 2절, PickLists.cs Write 모양) ----------

/**
 * 판 맨 위 picks: C-ARM 시술(약재 없음 표시)·약재, SONO 부위·부위 없이·같이 하는 것,
 * PT 종류·도수 시간·충격파 타수(hits)와 부위 수(counts)·견인 부위 (reception-arrange-tune AC-3603.2)
 */
export interface FakePicks {
  carm: { procs: { n: string; noDrug: boolean }[]; drugs: string[] }
  sono: { parts: string[]; plains: string[]; withs: string[] }
  pt: string[]
  ds: string[]
  eswt: { hits: string[]; counts: string[] }
  trac: string[]
  /** 보이는 더한 칸의 고르기 목록: 칸 열쇠(x1…) → 이름 0~8개 (reception-other-clinic AC-5703.6). 더한 칸이 없는 판에는 없어도 된다 */
  extra?: Record<string, string[]>
}

/** 목록 파일이 없을 때의 기본 목록(AC-3501.1·AC-3603.1, 승인 시안 차례). 부를 때마다 새 사본이다 */
export function defaultPicks(): FakePicks {
  return {
    carm: {
      procs: [
        { n: '목', noDrug: false },
        { n: '등', noDrug: false },
        { n: '허리', noDrug: false },
        { n: '리덕션', noDrug: true },
      ],
      drugs: ['TP', '하프', '기본'],
    },
    sono: {
      parts: ['목', '등', '허리', '어깨', '위팔', '팔꿈치', '아래팔', '손목', '손가락', '늑골', '골반', '고관절', '허벅지', '무릎', '종아리', '발목', '발바닥', '발가락', '아킬레스', '기타'],
      plains: ['소독', 'S/O', '봉합'],
      withs: ['DNA', '채혈'],
    },
    pt: ['ICE', 'HP'],
    ds: ['30분', '50분'],
    eswt: { hits: ['2000타', '3000타', '4000타', '6000타'], counts: ['1부위', '2부위', '3부위', '4부위'] },
    trac: ['목', '허리'],
  }
}

// ---- 다른 병원용 설정 (reception-other-clinic design.md 1절 · AC-5701.5·5701.6 · AC-5703.1) ---------------------------------
// TASK-6(어레인지 표)·TASK-7(설정 쪽)도 쓴다. 병원 이름·로고는 가상이다

/** 로고: pic 그림 · text 병원 이름 글자 · none 없이. ver는 로고 그림 판 번호(0이면 그림 파일 없음) */
export interface FakeLogo {
  mode: 'pic' | 'text' | 'none'
  text: string | null
  ver: number
}

/** 칸 종류: rx 처방 칸(처방으로 저절로 채움) · mn 직접 칸 */
export type FakeColKind = 'rx' | 'mn'

/** 판 cfg의 보이는 칸 하나: k 열쇠(처음 일곱 칸 또는 더한 칸 x1…), empty는 rx 칸인데 고른 처방이 없음(xray면 규칙도 꺼짐) */
export interface FakeCfgCol {
  k: string
  name: string
  kind: FakeColKind
  steps: 2 | 3
  added: boolean
  empty: boolean
}

/** `GET /api/board` 맨 위 cfg (AC-5703.1): cols는 보이는 칸만 설정 차례대로, guide는 setup.done의 반대 */
export interface FakeCfg {
  logo: FakeLogo
  tab: boolean
  guide: boolean
  cols: FakeCfgCol[]
}

/** 설정 문서의 칸 하나 (design.md 1절). rule은 xray 칸에만 있다 */
export interface FakeSettingsCol {
  k: string
  name: string
  kind: FakeColKind
  steps: 2 | 3
  show: boolean
  added: boolean
  rule?: boolean
  codes: string[]
}

/** 설정 문서 = `GET /api/settings` 답 = `POST /api/settings` 몸 (design.md 1절). picks.extra는 늘 있다(더한 칸 열쇠와 정확히 같다) */
export interface FakeSettings {
  rev: number
  logo: FakeLogo
  tab: boolean
  setup: { logo: boolean; tab: boolean; done: boolean }
  nextX: number
  cols: FakeSettingsCol[]
  picks: FakePicks & { extra: Record<string, string[]> }
}

/** 지난 30일 처방 한 줄 (`GET /api/codes`): c 코드, n 이름(사전에 없으면 null), v 내원 수 */
export interface FakeCode {
  c: string
  n: string | null
  v: number
}

/** 처음 일곱 칸 [열쇠, 이름, 종류, 단계] (AC-5701.5) */
const FIRST_COLS: Array<[string, string, FakeColKind, 2 | 3]> = [
  ['xray', 'X-RAY', 'rx', 2],
  ['sono', 'SONO', 'rx', 3],
  ['carm', 'C-ARM', 'rx', 3],
  ['pt', 'PT', 'mn', 2],
  ['ds', '도수', 'mn', 2],
  ['eswt', '충격파', 'mn', 2],
  ['trac', '견인', 'mn', 2],
]

/** 우리 의원 처음 값의 SONO·C-ARM 처방 (AC-5701.5) */
const OURS_CODES: Record<string, string[]> = { sono: ['SONO1', 'SONO', 'EB422', 'EB466', 'HA280'], carm: ['CARM1', 'G0400'] }

function firstCols(codes: Record<string, string[]>): FakeSettingsCol[] {
  return FIRST_COLS.map(([k, name, kind, steps]) => ({
    k,
    name,
    kind,
    steps,
    show: true,
    added: false,
    ...(k === 'xray' ? { rule: true } : {}),
    codes: [...(codes[k] ?? [])],
  }))
}

/** '우리 의원 처음 값' 설정 문서(AC-5701.5): 로고 그림 ver 1 · 탭 켜짐 · 안내 끝남 · SONO·C-ARM 처방 있음. 부를 때마다 새 사본이다 */
export function oursSettings(): FakeSettings {
  return {
    rev: 1,
    logo: { mode: 'pic', text: null, ver: 1 },
    tab: true,
    setup: { logo: true, tab: true, done: true },
    nextX: 1,
    cols: firstCols(OURS_CODES),
    picks: { ...defaultPicks(), extra: {} },
  }
}

/** '새 병원 처음 값' 설정 문서(AC-5701.6): 로고 없이 · 탭 켜짐 · 안내 보임 · SONO·C-ARM 처방 없음. 부를 때마다 새 사본이다 */
export function freshSettings(): FakeSettings {
  return {
    rev: 1,
    logo: { mode: 'none', text: null, ver: 0 },
    tab: true,
    setup: { logo: false, tab: false, done: false },
    nextX: 1,
    cols: firstCols({}),
    picks: { ...defaultPicks(), extra: {} },
  }
}

/** 설정 문서로 판 cfg를 만든다(도우미 규칙 AC-5703.1과 같다: 보이는 칸만, empty는 rx인데 codes가 비고 xray면 rule도 거짓) */
export function cfgOf(settings: FakeSettings): FakeCfg {
  return {
    logo: { ...settings.logo },
    tab: settings.tab,
    guide: !settings.setup.done,
    cols: settings.cols
      .filter((c) => c.show)
      .map((c) => ({
        k: c.k,
        name: c.name,
        kind: c.kind,
        steps: c.steps,
        added: c.added,
        empty: c.kind === 'rx' && c.codes.length === 0 && !(c.k === 'xray' && c.rule === true),
      })),
  }
}

/** 우리 의원 처음 값의 판 cfg (로고 그림 ver 1) */
export function oursCfg(): FakeCfg {
  return cfgOf(oursSettings())
}

/** 새 병원 처음 값의 판 cfg (로고 없이 · 안내 보임 · SONO·C-ARM 빈 칸) */
export function freshCfg(): FakeCfg {
  return cfgOf(freshSettings())
}

/** 시험 판(boardOf·mockupBoard…)의 처음 cfg: 우리 의원 처음 값의 칸, 로고만 없이(GET /api/logo를 묻지 않는 판) */
function boardCfg(): FakeCfg {
  return { ...oursCfg(), logo: { mode: 'none', text: null, ver: 0 } }
}

/** 판의 cfg를 바꾼 사본 */
export function withCfg(board: FakeBoard, cfg: FakeCfg): FakeBoard {
  return { ...board, cfg }
}

/**
 * 우리 의원 처음 값 + 더한 칸 IMS(x1 · 직접 칸 · 두 단계, 승인 시안 COLS) 설정 문서. list는 IMS 고르기 목록(기본 목·어깨·허리·무릎).
 * 부를 때마다 새 사본이다 (TASK-6 어레인지 표)
 */
export function imsSettings(list: string[] = ['목', '어깨', '허리', '무릎']): FakeSettings {
  const settings = oursSettings()
  settings.nextX = 2
  settings.cols.push({ k: 'x1', name: 'IMS', kind: 'mn', steps: 2, show: true, added: true, codes: [] })
  settings.picks.extra = { x1: [...list] }
  return settings
}

/**
 * 판의 cfg·picks를 설정 문서로 바꾼 사본(도우미 AC-5703.1·5703.2·5703.6과 같다): cfg는 cfgOf(로고만 판 것 그대로 — GET /api/logo를 묻지 않게),
 * picks는 그 설정의 목록이고 extra는 보이는 더한 칸만, 어레인지 줄 cells에서는 보이지 않는 칸 열쇠를 뺀다
 */
export function withSettings(board: FakeBoard, settings: FakeSettings): FakeBoard {
  const cfg = { ...cfgOf(settings), logo: { ...board.cfg.logo } }
  const shown = new Set(cfg.cols.map((col) => col.k))
  const { extra, ...lists } = structuredClone(settings.picks)
  const picks: FakePicks = { ...lists, extra: Object.fromEntries(cfg.cols.filter((col) => col.added).map((col) => [col.k, extra[col.k] ?? []])) }
  const arrange = board.arrange && {
    rows: board.arrange.rows.map((row) => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).filter(([k]) => shown.has(k))) as FakeCells })),
    ended: board.arrange.ended,
  }
  return { ...board, cfg, picks, ...(arrange ? { arrange } : {}) }
}

/** 지난 30일 처방 목록(승인 시안 CODES 차례, 내원 많은 순). SONO는 사전에 이름이 없다(null). AA 진찰료는 도우미가 뺀다 */
export function fakeCodes(): FakeCode[] {
  return [
    { c: 'MM015', n: '표층열치료', v: 412 },
    { c: 'MM301', n: '간섭파전류치료', v: 398 },
    { c: 'G7101', n: '가상 경추 촬영', v: 164 },
    { c: 'MM110', n: '견인치료', v: 140 },
    { c: 'G7301', n: '가상 요추 촬영', v: 131 },
    { c: 'SONO1', n: '초음파 검사', v: 96 },
    { c: 'MM105', n: '도수치료', v: 77 },
    { c: 'CARM1', n: 'C-arm 시술', v: 58 },
    { c: 'G0400', n: 'C-Arm형 영상증폭장치이용료', v: 55 },
    { c: 'G5201', n: '가상 어깨 촬영', v: 47 },
    { c: 'EB466', n: '초음파(견관절)', v: 31 },
    { c: 'SONO2', n: '초음파 유도 주사', v: 21 },
    { c: 'KK010', n: '가상 관절강내 주사', v: 18 },
    { c: 'HA280', n: '관절조영', v: 12 },
    { c: 'SONO', n: null, v: 9 },
    { c: 'EB422', n: '초음파(흉부)', v: 4 },
  ]
}

/** 가짜 로고 그림: 1×1 PNG(서명·IHDR·IDAT·IEND가 맞는 그림) */
const FAKE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function base64Of(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
}

/** 가짜 PNG 로고 바이트(부를 때마다 새 사본) */
export function fakeLogoPng(): Uint8Array<ArrayBuffer> {
  return bytesOf(FAKE_PNG_BASE64)
}

/** 가짜 JPEG 로고 바이트: FF D8 FF로 시작하고 FF D9로 끝나는 짧은 바이트(그림으로 풀지는 않는다) */
export function fakeLogoJpeg(): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9])
}

/** 가짜 로고의 data: URL(getLogo가 돌려주는 모양) */
export function fakeLogoUrl(type: 'png' | 'jpeg' = 'png'): string {
  return `data:image/${type};base64,${base64Of(type === 'png' ? fakeLogoPng() : fakeLogoJpeg())}`
}

// ---- 어레인지 표 (reception-arrange, design.md 7절 ArrangeBuilder 답 모양) ----------------------------------

/** 어레인지 칸 (JSON 이름) */
export type FakeCol = 'xray' | 'sono' | 'carm' | 'pt' | 'ds' | 'eswt' | 'trac'

/** 칸 일곱 (표 차례) */
export const ARRANGE_COLS: FakeCol[] = ['xray', 'sono', 'carm', 'pt', 'ds', 'eswt', 'trac']

/**
 * 칸 하나: st 준비(todo)·준비완료(ready)·완료(done), at 처방(넣은) 시각·준비완료 시각·완료 시각(비트 처방 시각을 모르면 null), ord SONO·C-ARM 순서,
 * part SONO·C-ARM 부위·시술(여러 줄은 "|"로 이음), tags SONO 같이 하는 것·C-ARM 약재(늘 배열, reception-pick-lists AC-3502.2)
 */
export interface FakeCell {
  st: 'todo' | 'ready' | 'done'
  det: string
  part: string | null
  at: string | null
  ord: number | null
  manual: boolean
  tags: string[]
}

/** 어레인지 줄의 칸: 처음 일곱 칸 열쇠는 늘 있고(없으면 null), 더한 칸(x1…) 열쇠는 넣은 것만 있다 (reception-other-clinic AC-5703.2) */
export type FakeCells = Record<FakeCol, FakeCell | null> & Record<string, FakeCell | null>

/**
 * 어레인지 줄 하나. 이름·차트번호·정보·메모·상태·접수 시각은 같은 k의 목록 줄에 있다.
 * back 돌아온 시각·backWait 돌아온 뒤 기다린 글("12분째", 다음 치료 칸을 누르기 전까지만, reception-arrange-tune AC-3601.4)
 */
export interface FakeArrangeRow {
  k: string
  away: string | null
  back: string | null
  backWait: string | null
  ptf: { st: 'up' | 'down'; at: string } | null
  last: string
  cells: FakeCells
  allDone: boolean
}

export interface FakeArrange {
  rows: FakeArrangeRow[]
  ended: { k: string; endedAt: string | null; paid?: boolean }[]
}

/** 칸 하나. 주지 않은 값은 처방에서 온 준비 칸이다 */
export function fakeCell(over: Partial<FakeCell> = {}): FakeCell {
  return { st: 'todo', det: '', part: null, at: '10:30', ord: null, manual: false, tags: [], ...over }
}

/**
 * 어레인지 줄 하나: 주지 않은 처음 일곱 칸은 없음(null), 더한 칸(x1…)은 준 것만, allDone은 칸이 하나 이상이고 모두 완료일 때 true (AC-3305.8)
 */
export function arrangeRow(
  k: string,
  cells: Partial<Record<string, Partial<FakeCell>>> = {},
  over: Partial<Omit<FakeArrangeRow, 'cells' | 'allDone'>> = {},
): FakeArrangeRow {
  const keys = [...ARRANGE_COLS, ...Object.keys(cells).filter((col) => !(ARRANGE_COLS as string[]).includes(col))]
  const all = Object.fromEntries(keys.map((col) => [col, cells[col] ? fakeCell(cells[col]) : null])) as FakeCells
  const present = Object.values(all).filter((cell): cell is FakeCell => cell !== null)
  return { k, away: null, back: null, backWait: null, ptf: null, last: '', ...over, cells: all, allDone: present.length > 0 && present.every((cell) => cell.st === 'done') }
}

/** 판에 어레인지 표를 얹은 사본. 어레인지를 보내는 판이라 고르기 목록 picks도 있다(없으면 기본 목록, AC-3501.4) */
export function withArrange(board: FakeBoard, arrange: FakeArrange): FakeBoard {
  return { ...board, arrange, picks: board.picks ?? defaultPicks() }
}

/** 어레인지 시안(Arrange.html)의 환자 a~j 자리의 화면 열쇠. 이름은 가상환자21~30 */
export const ARRANGE_KEYS = {
  a: fakeKey(21),
  b: fakeKey(22),
  c: fakeKey(23),
  d: fakeKey(24),
  e: fakeKey(25),
  f: fakeKey(26),
  g: fakeKey(27),
  h: fakeKey(28),
  i: fakeKey(29),
  j: fakeKey(30),
} as const

/**
 * 어레인지 승인 시안(docs/mockups/reception-arrange/Arrange.html)과 같은 모양의 판(11:04:15 기준, 지어낸 가짜 환자):
 * 표에 8명(접수 순 a~h), 오늘 치료 종료 2명(종료 늦은 순 j·i). 목록 칸은 진료대기 f·g·h, 진료보류 c·d·e, 수납대기 b, 수납완료 a·i·j다.
 * a 모든 칸 끝남(allDone) · b C-ARM 준비완료(1번)·PT·견인·돌아옴 10:31(셈 멈춤) · c 신환 X-RAY 끝남·SONO 부위 없음(1번)·PT ICE·충격파 2부위 ·
 * d 자리비움 10:50·X-RAY 직접 넣음 끝남·도수 30분 · e C-ARM 준비(2번)·PT·견인 목·돌아옴 10:52 12분째(셈 중) · f PT 먼저 올라감 10:40 ·
 * g PT 먼저 내려옴 10:58·SONO 직접 넣음(2번) · h 신환 칸 없음 (돌아옴은 reception-arrange-tune 시안 Mock.html의 가상환자22·25)
 */
export function arrangeMockupBoard(at = '11:04:15'): FakeBoard {
  const K = ARRANGE_KEYS
  const row = (n: number, info: string, time: string, memo = '') =>
    fakeRow({ k: fakeKey(n), chart: `9100${n}`, name: `가상환자${n}`, info, time: `${time} 접수`, waited: '', memo, rxLabel: '', rx: '' })
  const board = boardOf(
    {
      wait: [row(26, '71세 · 남 · 재진', '10:31'), row(27, '45세 · 남 · 재진', '10:44', '실비 서류'), row(28, '26세 · 여 · 신환', '10:58', '오른 손목 처음')],
      hold: [row(23, '38세 · 여 · 신환', '09:40', '오른 어깨 처음'), row(24, '29세 · 남 · 재진', '10:02', '왼 발목 삠'), row(25, '52세 · 여 · 재진', '10:15', '목·어깨 뻐근')],
      pay: [row(22, '47세 · 남 · 재진', '09:25', '허리 C-arm 2차')],
      done: [row(21, '64세 · 여 · 재진', '09:12', '오른 무릎 주사 2차'), row(30, '61세 · 여 · 재진', '09:08'), row(29, '58세 · 남 · 재진', '09:05')],
    },
    at,
  )
  return withArrange(board, {
    rows: [
      arrangeRow(
        K.a,
        {
          xray: { st: 'done', at: '09:35' },
          sono: { st: 'done', part: '오른 무릎', at: '09:55' },
          pt: { st: 'done', det: 'HP', at: '10:10', manual: true },
        },
        { last: 'Rt knee pain\n계단·앉았다 일어날 때 심함\n\nxr: OA gr.2' },
      ),
      arrangeRow(
        K.b,
        {
          carm: { st: 'ready', part: '허리 L4-5', at: '11:01', ord: 1 },
          pt: { det: 'HP', at: '10:20', manual: true },
          trac: { det: '허리', at: '10:20', manual: true },
        },
        { last: 'LBP with Rt buttock pain\n2주 전부터', back: '10:31' },
      ),
      arrangeRow(K.c, {
        xray: { st: 'done', at: '10:12' },
        sono: { at: '10:30', ord: 1 },
        pt: { det: 'ICE', at: '10:31', manual: true },
        eswt: { det: '2부위', at: '10:31', manual: true },
      }),
      arrangeRow(K.d, { xray: { st: 'done', at: '10:28', manual: true }, ds: { det: '30분', at: '10:35', manual: true } }, { away: '10:50', last: 'Rt wrist pain\n운동 뒤' }),
      arrangeRow(
        K.e,
        {
          carm: { part: '목 C5-6', at: '10:42', ord: 2 },
          pt: { det: 'HP', at: '10:42', manual: true },
          trac: { det: '목', at: '10:50', manual: true },
        },
        { last: 'neck pain 1달', back: '10:52', backWait: '12분째' },
      ),
      arrangeRow(K.f, {}, { ptf: { st: 'up', at: '10:40' }, last: 'Lt knee pain\n붓기 있음' }),
      arrangeRow(K.g, { sono: { part: '왼 어깨', at: '11:02', ord: 2, manual: true } }, { ptf: { st: 'down', at: '10:58' }, last: 'Lt shoulder pain\n팔 뒤로 돌릴 때' }),
      arrangeRow(K.h),
    ],
    ended: [
      { k: K.j, endedAt: '10:40' },
      { k: K.i, endedAt: '10:15' },
    ],
  })
}

const LANE_LABEL: Record<FakeLane, string> = { wait: '진료대기', hold: '진료보류', pay: '수납대기', done: '수납완료' }

/** 도우미가 지금 보내는 읽기 간격(초): ReceptionTiming.PollSeconds (AC-1403.9, 사용자 결정 2026-11-05) */
export const FAKE_EVERY = 5

/** 화면용 열쇠 모양(16자리 소문자 16진수). n이 같으면 같은 열쇠 */
export function fakeKey(n: number): string {
  return `3f9a${String(n).padStart(12, '0')}`
}

/** 줄 하나. 주지 않은 칸은 진료대기 가상환자01 줄의 값이고, 진료보류 줄이면 엑스레이 칸이 { at: null }이다 */
export function fakeRow(over: Partial<FakeRow> = {}): FakeRow {
  const lane = over.lane ?? 'wait'
  return {
    k: fakeKey(1),
    lane,
    pos: null,
    laneLabel: LANE_LABEL[lane],
    chart: '910234',
    name: '가상환자01',
    info: '54세 · 여 · 재진',
    time: '10:42 접수',
    waited: '18분째 대기',
    long: false,
    memo: '',
    rxLabel: '지난번',
    rx: '오른쪽 어깨 통증 조금 줄었음 밤에 아픔',
    xray: lane === 'hold' ? { at: null } : null,
    ...over,
  }
}

/**
 * 줄 정보 글이 화면에 보이는 조각들(reception-paper AC-1503.2): " · "로 나눈 끝 조각이 "신환"이면 그 조각을 뺀 정보 글과
 * 신환 표시 "신환" 둘, 아니면 정보 글 그대로 하나. 빈 조각은 뺀다
 */
export function shownInfo(info: string): string[] {
  const parts = info.split(' · ')
  const shown = parts.at(-1) === '신환' ? [parts.slice(0, -1).join(' · '), '신환'] : [info]
  return shown.filter((text) => text !== '')
}

/**
 * 줄 하나에서 화면(목록 줄)에 보이는 환자 글: 이름·차트번호·메모·정보(보이는 조각, shownInfo). 빈 글은 뺀다.
 * 처방·증상 글(rx)은 목록 줄에 그리지 않는다(reception-paper AC-1504.1)
 * 화면에 보이는지·끊김/숨김 뒤 남지 않았는지 볼 때 쓴다(정보 글 원문 "37세 · 남 · 신환"은 화면에 한 덩이로 나오지 않는다)
 */
export function rowTexts(row: FakeRow): string[] {
  return [row.name, row.chart, row.memo, ...shownInfo(row.info)].filter((text) => text !== '')
}

/** 접수 시각 글("10:42 접수")의 시:분. 못 읽으면 맨 뒤로 */
function timeOf(row: FakeRow): string {
  return /^\d\d:\d\d/.exec(row.time)?.[0] ?? '99:99'
}

/**
 * 칸 넷의 줄로 한 판을 만든다(도우미 BoardBuilder와 같은 규칙): 진료 순서 = 진료대기 + 진료보류를 접수 빠른 순으로 잇고
 * 순서 번호(pos)를 1부터 붙인다. 칸 넷의 줄은 pos가 null이다. 건수는 각 목록의 길이다. 칸 넷의 줄 차례는 받은 그대로다.
 * 읽기 간격 every는 도우미의 지금 값(FAKE_EVERY)이다
 */
export function boardOf(lanes: Partial<Record<FakeLane, FakeRow[]>> = {}, at = '13:42:10'): FakeBoard {
  const pick = (lane: FakeLane) => (lanes[lane] ?? []).map((row) => ({ ...row, lane, laneLabel: LANE_LABEL[lane], pos: null }))
  const wait = pick('wait')
  const hold = pick('hold')
  const pay = pick('pay')
  const done = pick('done')
  const queue = [...wait, ...hold]
    .map((row, i) => ({ row, i }))
    .sort((a, b) => timeOf(a.row).localeCompare(timeOf(b.row)) || a.i - b.i)
    .map(({ row }, i) => ({ ...row, pos: i + 1 }))
  return {
    state: 'ok',
    at,
    every: FAKE_EVERY,
    cfg: boardCfg(),
    counts: { queue: queue.length, wait: wait.length, hold: hold.length, pay: pay.length, done: done.length },
    lists: { queue, wait, hold, pay, done },
  }
}

/** 승인 시안(Main.dc.html·Tablet.dc.html)과 같은 판: 진료대기 3 · 진료보류 2 · 수납대기 2 · 수납완료 2, 진료 순서 5명, 13:42:10 기준 */
export function mockupBoard(at = '13:42:10'): FakeBoard {
  return boardOf(
    {
      wait: [
        fakeRow({ k: fakeKey(1), chart: '910871', name: '가상환자01', info: '37세 · 남 · 신환', time: '09:38 접수', waited: '1시간 4분째 대기', long: true, memo: '', rxLabel: '처방', rx: '첫 방문이라 지난 처방이 없어요' }),
        fakeRow({ k: fakeKey(2), chart: '910234', name: '가상환자02', info: '54세 · 여 · 재진', time: '10:42 접수', waited: '18분째 대기', memo: '오른쪽 어깨 통증 심해짐', rxLabel: '지난번', rx: '오른쪽 어깨 통증 조금 줄었음 밤에 아픔' }),
        fakeRow({ k: fakeKey(3), chart: '909412', name: '가상환자03', info: '71세 · 여 · 재진', time: '10:51 접수', waited: '9분째 대기', memo: '보호자 동반', rxLabel: '지난번', rx: '적힌 증상이 없어요' }),
      ],
      hold: [
        fakeRow({ k: fakeKey(4), lane: 'hold', chart: '910502', name: '가상환자04', info: '45세 · 남 · 재진', time: '10:05 접수', waited: '보류 22분째', memo: '엑스레이 찍으러 감', rxLabel: '오늘', rx: '엑스레이 촬영(XR2)', xray: { at: null } }),
        fakeRow({ k: fakeKey(5), lane: 'hold', chart: '910733', name: '가상환자05', info: '58세 · 여 · 재진', time: '10:15 접수', waited: '보류 15분째', memo: '', rxLabel: '오늘', rx: '엑스레이 촬영(XR2)', xray: { at: '10:55' } }),
      ],
      pay: [
        fakeRow({ k: fakeKey(6), lane: 'pay', chart: '908833', name: '가상환자06', info: '62세 · 여 · 재진', time: '09:58 접수', waited: '수납 6분째', memo: '', rxLabel: '오늘', rx: '체외충격파(ESWT7) · 주사(INJ1)' }),
        fakeRow({ k: fakeKey(7), lane: 'pay', chart: '910920', name: '가상환자07', info: '29세 · 남 · 신환', time: '10:12 접수', waited: '수납 2분째', memo: '실손 서류 요청', rxLabel: '오늘', rx: '엑스레이 촬영(XR2) · 표층열치료(PT01)' }),
      ],
      done: [
        fakeRow({ k: fakeKey(8), lane: 'done', chart: '907761', name: '가상환자08', info: '48세 · 남 · 재진', time: '09:12 접수', waited: '09:40 수납', memo: '', rxLabel: '오늘', rx: '도수치료 20분(DS20) · 간섭파치료(PT03)' }),
        fakeRow({ k: fakeKey(9), lane: 'done', chart: '910655', name: '가상환자09', info: '33세 · 여 · 재진', time: '09:05 접수', waited: '09:31 수납', memo: '', rxLabel: '오늘', rx: '체외충격파(ESWT7)' }),
      ],
    },
    at,
  )
}

// ---- 상세 답과 가짜 도우미 (TASK-23) ------------------------------------------------------------------
// 화면 끝까지 시험(app.test.ts)과 Phase 끝 화면 캡처가 함께 쓴다. 도우미 없이 같은 모양의 답을 준다(design.md 4·5·6절)

/** 지난 진료 처방 하나 */
export interface FakeRx {
  name: string
  code: string
}

/** 지난 진료 하나(JSON Visit) */
export interface FakeVisit {
  date: string
  ago: string
  sym: string
  rx: FakeRx[]
}

/** 종이 기록부 처방·원외처방 한 줄 (reception-paper design.md 2절) */
export interface FakeOrder {
  code: string
  name: string
  qty: string
  tms: string
  day: string
}

/** 상세 첫 쪽(from=0)의 종이 기록부 자료 `paper` (reception-paper design.md 2절, AC-1501.1) */
export interface FakePaper {
  res: string
  addr: string
  tel: string
  cel: string
  special: string
  room: string
  ins: string
  sym: string
  dx: { code: string; name: string; main: boolean }[]
  rx: FakeOrder[]
  out: FakeOrder[]
}

/** `GET /api/visit/{k}/history?from=N` 200 답. paper는 from=0 답에만 있다 */
export interface FakeHistory {
  visits: FakeVisit[]
  next: number | null
  more: number
  first: string
  total: number
  todaySym: string
  paper?: FakePaper
}

/**
 * 종이 기록부 자료 하나(지어낸 가짜 사람). 주지 않은 칸은 진료 전 환자의 값이다(증상·상병·처방이 아직 없음).
 * 주민번호는 앞 6자리만 온다(AC-1501.2)
 */
export function fakePaper(over: Partial<FakePaper> = {}): FakePaper {
  return {
    res: '720304-*******',
    addr: '가상시 가상구 예시로 12 (가상맨션 101동 202호)',
    tel: '',
    cel: '010-0000-1234',
    special: '가상 특이사항: 페니실린 알레르기',
    room: '1진료실',
    ins: '국민건강보험',
    sym: '',
    dx: [],
    rx: [],
    out: [],
    ...over,
  }
}

/** 진료가 끝난 날의 종이 기록부: 증상(sym)·주상병·처방·원외처방이 있다 */
export function fakeTreatedPaper(sym: string, over: Partial<FakePaper> = {}): FakePaper {
  return fakePaper({
    sym,
    dx: [
      { code: 'M7581', name: '가상 어깨 병, 오른쪽', main: true },
      { code: 'M5456', name: '가상 허리 긴장', main: false },
    ],
    rx: [
      { code: 'MM015', name: '가상 표층열치료', qty: '1', tms: '1', day: '1' },
      { code: 'LA272', name: '가상 신경차단', qty: '2.5', tms: '1', day: '1' },
    ],
    out: [{ code: '641901140', name: '가상정200mg', qty: '1', tms: '2', day: '7' }],
    ...over,
  })
}

/**
 * 직전 진료기록부 `GET /api/visit/{k}/prev`의 prev (reception-arrange design.md 9절): 지난 내원 하나의 날짜(yyyy-MM-dd)·N일 전·
 * 진료실·보험·증상·상병·처방·원외처방. 사람 칸(주민번호·주소·전화)·특이사항은 없다. 주지 않은 칸은 시안 환자 a의 지어낸 가짜 값이다
 */
export interface FakePrev {
  date: string
  ago: string
  room: string
  ins: string
  sym: string
  dx: { code: string; name: string; main: boolean }[]
  rx: FakeOrder[]
  out: FakeOrder[]
}

export function fakePrev(over: Partial<FakePrev> = {}): FakePrev {
  return {
    date: '2026-10-26',
    ago: '14일 전',
    room: '1진료실',
    ins: '국민건강보험',
    sym: 'Rt knee pain\n계단·앉았다 일어날 때 심함\n\nxr: OA gr.2',
    dx: [{ code: 'M1716', name: '가상 무릎관절증', main: true }],
    rx: [{ code: 'G7204', name: '가상 무릎 촬영', qty: '1', tms: '1', day: '1' }],
    out: [{ code: '641901140', name: '가상정200mg', qty: '1', tms: '2', day: '7' }],
    ...over,
  }
}

/** 가짜 오늘: 2026년 11월 5일 (시험의 기기 날짜와 같게 둔다) */
export const FAKE_TODAY = { year: 2026, month: 11, day: 5 }

/** 상세 첫 쪽은 5번, [더 보기]마다 20번 (AC-1404.1) */
const FIRST_PAGE = 5
const MORE_PAGE = 20

/** 승인 시안(Detail.dc.html)의 지난 진료 증상·처방. 6번째부터는 차례대로 다시 쓴다 */
const VISIT_SYMS = [
  '오른쪽 어깨 통증 조금 줄었음, 밤에 아픔',
  '오른쪽 어깨 통증, 팔 올릴 때 아픔',
  '어깨·목 뻐근함',
  '오른쪽 어깨 통증 2주째, 1주 뒤 다시 봄',
  '오른쪽 어깨 통증 처음 옴',
]
const VISIT_RX: FakeRx[][] = [
  [{ name: '체외충격파', code: 'ESWT7' }, { name: '도수치료 20분', code: 'DS20' }],
  [{ name: '체외충격파', code: 'ESWT7' }, { name: '표층열치료', code: 'PT01' }],
  [{ name: '도수치료 20분', code: 'DS20' }, { name: '간섭파치료', code: 'PT03' }, { name: '표층열치료', code: 'PT01' }],
  [{ name: '엑스레이 촬영', code: 'XR2' }, { name: '주사', code: 'INJ1' }],
  [{ name: '엑스레이 촬영', code: 'XR2' }, { name: '표층열치료', code: 'PT01' }],
]

/** 오늘에서 days일 앞 날 */
function daysBefore(days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(FAKE_TODAY.year, FAKE_TODAY.month - 1, FAKE_TODAY.day) - days * 86400000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** 날짜 글: 올해면 "10월 29일", 다른 해면 "2025년 3월 12일" (AC-1404.2) */
function visitDate(d: { year: number; month: number; day: number }): string {
  return d.year === FAKE_TODAY.year ? `${d.month}월 ${d.day}일` : `${d.year}년 ${d.month}월 ${d.day}일`
}

function longDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}년 ${d.month}월 ${d.day}일`
}

/** i번째 지난 진료(0이 가장 최근): 7일 간격으로 거슬러 간다. 처음 5번은 승인 시안과 같다 */
export function fakeVisit(i: number): FakeVisit {
  const days = 7 * (i + 1)
  return { date: visitDate(daysBefore(days)), ago: `${days}일 전`, sym: VISIT_SYMS[i % VISIT_SYMS.length]!, rx: VISIT_RX[i % VISIT_RX.length]! }
}

/**
 * 지난 진료가 past번인 환자의 상세 한 쪽. from이 0이면 처음 5번, 그 뒤는 20번씩이다(AC-1404.1·1404.3).
 * 지난 진료가 없으면 처음 온 날은 오늘이고 모두 1번이다. from이 0이면 종이 기록부 자료 paper가 붙는다(AC-1501.1):
 * 주지 않으면 오늘 증상이 없을 때 진료 전, 있을 때 진료가 끝난 날의 것이다
 */
export function fakeHistory(past: number, from = 0, todaySym = '', paper?: FakePaper): FakeHistory {
  const end = Math.min(past, from + (from === 0 ? FIRST_PAGE : MORE_PAGE))
  const visits = Array.from({ length: Math.max(0, end - from) }, (_, j) => fakeVisit(from + j))
  const page: FakeHistory = {
    visits,
    next: end < past ? end : null,
    more: Math.max(0, past - end),
    first: longDate(past > 0 ? daysBefore(7 * past) : daysBefore(0)),
    total: past + 1,
    todaySym,
  }
  if (from !== 0) return page
  return { ...page, paper: paper ?? (todaySym === '' ? fakePaper() : fakeTreatedPaper(todaySym)) }
}

/**
 * 지난 진료기록부 `GET /api/visit/{k}/papers?from=N` 답 (reception-memo-papers design.md 4절): 종이 칸은 직전 기록부(prev)와 같고,
 * total은 지난 내원 수, next는 더 있으면 다음 from(없으면 null)이다
 */
export interface FakePapers {
  papers: FakePrev[]
  total: number
  next: number | null
}

/** 지난 진료기록부 첫 쪽은 2장, [더 보기]마다 3장 (AC-3404.1) */
const PAPERS_FIRST = 2
const PAPERS_MORE = 3

/** i번째 지난 종이(0이 가장 최근): 지난 진료(fakeVisit)와 같은 날·증상, 진료실은 'N진료실'(i+1) */
export function fakePastPaper(i: number): FakePrev {
  const days = 7 * (i + 1)
  const d = daysBefore(days)
  const date = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
  return fakePrev({ date, ago: `${days}일 전`, room: `${i + 1}진료실`, sym: VISIT_SYMS[i % VISIT_SYMS.length]! })
}

/** 지난 내원이 past번인 환자의 지난 진료기록부 한 쪽(from이 0이면 2장, 그 뒤 3장) */
export function fakePapers(past: number, from = 0): FakePapers {
  const end = Math.min(past, from + (from === 0 ? PAPERS_FIRST : PAPERS_MORE))
  const papers = Array.from({ length: Math.max(0, end - from) }, (_, j) => fakePastPaper(from + j))
  return { papers, total: past, next: papers.length > 0 && end < past ? end : null }
}

/** 가짜 도우미의 답: 상태 번호와 JSON 몸(없으면 몸 없음). raw는 JSON이 아닌 몸(로고 그림)과 그 Content-Type */
export interface FakeReply {
  status: number
  body?: unknown
  raw?: { type: string; bytes: Uint8Array<ArrayBuffer> }
}

export interface FakeServer {
  /** 지금 비트 판. 시험이 바꿔 끼운다. 찍음 표시는 답할 때 엑스레이 칸이 있는 줄에 얹는다 */
  board: FakeBoard
  /** 찍음 표시: 열쇠 → 'HH:MM'. 판을 바꿔 끼워도 남는다(도우미의 표시 파일처럼) */
  marks: Map<string, string>
  /** [X-ray 완료]를 받은 PC 시각 'HH:MM' */
  now: string
  /** 오늘 증상을 정해 둔 환자: 열쇠 → todaySym(없으면 칸으로 정함). 종이 기록부의 증상(paper.sym)도 이것이다(AC-1404.8) */
  syms: Map<string, string>
  /** 종이 기록부를 통째로 정해 둔 환자: 열쇠 → paper(없으면 오늘 증상으로 정함). 상세가 열린 동안 바뀌는 종이 시험(AC-1502.4) */
  papers: Map<string, FakePaper>
  /** 직전 진료기록부를 정해 둔 환자: 열쇠 → prev(없으면 신환은 null, 재진은 fakePrev()) (reception-arrange) */
  prevs: Map<string, FakePrev | null>
  /** 지난 내원 수를 정해 둔 환자: 열쇠 → 수(없으면 신환 0, 재진 36). 지난 진료기록부 쪽(fakePapers)이 따른다 (reception-memo-papers) */
  pasts: Map<string, number>
  /** 받은 목록 쓰기 몸들(POST /api/lists, reception-pick-lists AC-3501.3). 맞는 모양이면 판의 picks가 그것으로 바뀐다 */
  lists: unknown[]
  /** 병원 로고 그림(GET /api/logo, reception-other-clinic AC-5706.2). null이면 404 */
  logo: { type: 'image/png' | 'image/jpeg'; bytes: Uint8Array<ArrayBuffer> } | null
  /** 요청 하나에 답한다. url은 같은 곳 길('/api/board?fresh=1' 모양) */
  answer: (method: string, url: string, body?: string | null) => FakeReply
}

/** 어레인지 쓰기 몸 (reception-arrange design.md 8절). t는 SONO·C-ARM add·part의 이름표를 "|"로 이은 글 (reception-pick-lists AC-3502.3) */
interface FakeArrangeAsk {
  k?: unknown
  op?: unknown
  col?: unknown
  v?: unknown
  t?: unknown
}

/** 부위·시술 칸(SONO·C-ARM): part·이름표(t)가 있는 칸. 칸 열쇠로 정한다 (reception-other-clinic design.md 1절) */
const PARTED = new Set<string>(['sono', 'carm'])

/**
 * 가짜 도우미의 어레인지 쓰기(design.md 8절 op 표의 줄기만): 판의 arrange를 그 자리에서 바꾼다. 시각은 now다.
 * 칸은 판 cfg.cols의 보이는 칸(더한 칸 포함)이고 단계(steps)도 cfg를 따른다(reception-other-clinic AC-5703.2·5703.3, 단계 2 칸에 set ready는 400).
 * 칸이 없는 칸에 step·set·part, 빈 칸 아닌 칸에 add면 404·400처럼 false. 끝난 줄을 다시 넣으면 빼 두었던 줄(없으면 빈 줄)을 접수 순 자리에 넣는다
 */
function applyArrange(board: FakeBoard, stash: Map<string, FakeArrangeRow>, ask: FakeArrangeAsk, now: string): number {
  const arrange = board.arrange
  if (!arrange || typeof ask.k !== 'string' || typeof ask.op !== 'string') return 400
  const k = ask.k
  const row = arrange.rows.find((r) => r.k === k)
  const ended = arrange.ended.some((e) => e.k === k)
  if (!row && !ended) return 404
  const shown = board.cfg.cols.find((c) => c.k === ask.col)
  const col = shown?.k
  const three = shown?.steps === 3
  const parted = col !== undefined && PARTED.has(col)
  const v = typeof ask.v === 'string' ? ask.v : undefined
  // 이름표(t)는 SONO·C-ARM의 add·part에만 온다(목록에 있는지는 보지 않는다)
  if (ask.t !== undefined && (typeof ask.t !== 'string' || !(ask.op === 'add' || ask.op === 'part') || !parted)) return 400
  const tags = typeof ask.t === 'string' && ask.t !== '' ? ask.t.split('|') : []
  const cell = row && col ? (row.cells[col] ?? null) : null
  const settle = () => {
    if (!row) return
    const present = Object.values(row.cells).filter((c): c is FakeCell => c !== null)
    row.allDone = present.length > 0 && present.every((c) => c.st === 'done')
    // 받아진 칸 쓰기(X-RAY 칸 포함)는 돌아온 뒤 기다린 셈을 멈춘다 (reception-arrange-tune AC-3601.3). away·ptf·end는 멈추지 않는다
    if (ask.op === 'step' || ask.op === 'set' || ask.op === 'add' || ask.op === 'remove' || ask.op === 'part') row.backWait = null
  }
  switch (ask.op) {
    case 'step':
      if (!cell) return 404
      if (cell.st === 'done') return 400
      cell.st = cell.st === 'todo' && three ? 'ready' : 'done'
      cell.at = now
      if (cell.st === 'done') cell.ord = null
      break
    case 'set':
      if (!cell) return 404
      if ((v !== 'todo' && v !== 'ready' && v !== 'done') || (v === 'ready' && !three)) return 400
      cell.st = v
      if (v !== 'todo') cell.at = now
      if (v === 'done') cell.ord = null
      break
    case 'add':
      if (!row || !col || cell || v === undefined || (parted && v === '부위는 나중에')) return 400
      row.cells[col] = fakeCell({
        det: parted || col === 'xray' ? '' : v,
        part: parted ? v : null,
        at: now,
        manual: true,
        tags,
      })
      break
    case 'remove':
      if (!row || !col || !cell?.manual) return 400
      row.cells[col] = null
      break
    case 'part':
      if (!cell) return 404
      if (!parted || v === undefined || v === '부위는 나중에') return 400
      cell.part = v
      cell.tags = tags
      break
    case 'away':
      // on 자리비움 · off 돌아옴(셈은 0분부터) · clear 되돌리기(아무 표시 없음) (reception-arrange-tune AC-3601.2·AC-3601.4)
      if (!row || (v !== 'on' && v !== 'off' && v !== 'clear')) return 400
      row.away = v === 'on' ? now : null
      row.back = v === 'off' ? now : null
      row.backWait = v === 'off' ? '0분째' : null
      break
    case 'ptf':
      if (!row || (v !== 'up' && v !== 'down' && v !== 'off')) return 400
      row.ptf = v === 'off' ? null : { st: v, at: now }
      break
    case 'end':
      if (v === 'on' && row) {
        stash.set(k, row)
        arrange.rows = arrange.rows.filter((r) => r.k !== k)
        arrange.ended = [{ k, endedAt: now }, ...arrange.ended.filter((e) => e.k !== k)]
      } else if (v === 'off' && ended) {
        arrange.ended = arrange.ended.filter((e) => e.k !== k)
        const time = (key: string) => timeOf(Object.values(board.lists).flat().find((r) => r.k === key) ?? fakeRow({ time: '' }))
        arrange.rows = [...arrange.rows, stash.get(k) ?? arrangeRow(k)].sort((a, b) => time(a.k).localeCompare(time(b.k)))
      } else return 400
      break
    default:
      return 400
  }
  settle()
  return 204
}

/** 신환은 지난 진료가 없고, 재진은 36번(승인 시안: 모두 37번) */
function pastOf(row: FakeRow): number {
  return row.info.includes('신환') ? 0 : 36
}

/** 오늘 증상: 진료 전(진료대기)에는 아직 없다 */
function todaySymOf(row: FakeRow): string {
  return row.lane === 'wait' ? '' : '오른쪽 어깨 통증 계속됨'
}

function rowsOfBoard(board: FakeBoard): FakeRow[] {
  return Object.values(board.lists).flat()
}

/**
 * 가짜 도우미(design.md 7절의 길만): GET /api/board(?fresh=1) · GET /api/visit/{k}/history?from=N · POST /api/xray,
 * 그리고 어레인지(reception-arrange design.md 8·9절): POST /api/arrange(판의 arrange를 바꾸고 204) · GET /api/visit/{k}/prev,
 * 지난 진료기록부(reception-memo-papers design.md 4절): GET /api/visit/{k}/papers?from=N,
 * 고르기 목록(reception-pick-lists AC-3501.3): POST /api/lists(판 picks 모양이면 판의 picks를 바꾸고 204, 아니면 400),
 * 병원 로고(reception-other-clinic AC-5706.2): GET /api/logo(server.logo가 있으면 그 형식·바이트, 없으면 404).
 * 다른 길·그날 판에 없는 열쇠·모양이 틀린 값은 404, 진료보류가 아닌 줄의 표시는 400이다
 */
export function fakeServer(board: FakeBoard = mockupBoard(), now = '13:43'): FakeServer {
  const marks = new Map<string, string>()
  for (const row of rowsOfBoard(board)) if (row.xray?.at) marks.set(row.k, row.xray.at)
  /** 치료 종료로 뺀 어레인지 줄(다시 넣기에 돌려준다) */
  const stash = new Map<string, FakeArrangeRow>()
  const server: FakeServer = {
    board,
    marks,
    now,
    syms: new Map<string, string>(),
    papers: new Map<string, FakePaper>(),
    prevs: new Map<string, FakePrev | null>(),
    pasts: new Map<string, number>(),
    lists: [],
    logo: null,
    answer(method, url, body) {
      const [path = '', query = ''] = url.split('?')
      const params = new URLSearchParams(query)
      if (method === 'GET' && path === '/api/board' && (query === '' || query === 'fresh=1')) {
        return { status: 200, body: withMarks(server.board, server.marks) }
      }
      if (method === 'GET' && url === '/api/logo') {
        return server.logo ? { status: 200, raw: { type: server.logo.type, bytes: server.logo.bytes } } : { status: 404 }
      }
      const prev = /^\/api\/visit\/([0-9a-f]{16})\/prev$/.exec(path)
      if (method === 'GET' && prev && query === '') {
        const row = rowsOfBoard(server.board).find((r) => r.k === prev[1])
        if (!row) return { status: 404 }
        return { status: 200, body: { prev: server.prevs.has(row.k) ? server.prevs.get(row.k) : pastOf(row) === 0 ? null : fakePrev() } }
      }
      const papers = /^\/api\/visit\/([0-9a-f]{16})\/papers$/.exec(path)
      if (method === 'GET' && papers) {
        const row = rowsOfBoard(server.board).find((r) => r.k === papers[1])
        if (!row || !/^from=\d+$/.test(query)) return { status: 404 }
        return { status: 200, body: fakePapers(server.pasts.get(row.k) ?? pastOf(row), Number(params.get('from'))) }
      }
      if (method === 'POST' && path === '/api/lists') {
        let picks: unknown
        try {
          picks = JSON.parse(body ?? '')
        } catch {
          return { status: 400 }
        }
        server.lists.push(picks)
        if (!isFakePicks(picks)) return { status: 400 }
        server.board.picks = picks
        return { status: 204 }
      }
      if (method === 'POST' && path === '/api/arrange') {
        let ask: FakeArrangeAsk
        try {
          ask = JSON.parse(body ?? '') as FakeArrangeAsk
        } catch {
          return { status: 400 }
        }
        return { status: applyArrange(server.board, stash, ask, server.now) }
      }
      const history = /^\/api\/visit\/([0-9a-f]{16})\/history$/.exec(path)
      if (method === 'GET' && history) {
        const row = rowsOfBoard(server.board).find((r) => r.k === history[1])
        const from = Number(params.get('from'))
        if (!row || !/^\d+$/.test(params.get('from') ?? '')) return { status: 404 }
        return { status: 200, body: fakeHistory(pastOf(row), from, server.syms.get(row.k) ?? todaySymOf(row), server.papers.get(row.k)) }
      }
      if (method === 'POST' && path === '/api/xray') {
        let ask: { k?: unknown; on?: unknown }
        try {
          ask = JSON.parse(body ?? '') as { k?: unknown; on?: unknown }
        } catch {
          return { status: 400 }
        }
        const row = server.board.lists.hold.find((r) => r.k === ask.k)
        if (!row || typeof ask.on !== 'boolean') return { status: row ? 400 : 404 }
        if (ask.on) server.marks.set(row.k, server.now)
        else server.marks.delete(row.k)
        return { status: 204 }
      }
      return { status: 404 }
    },
  }
  return server
}

/** 판 picks 모양(이름·개수 규칙은 보지 않는다). PT·도수·충격파·견인 무리도 있어야 한다 (reception-arrange-tune AC-3603.2) */
function isFakePicks(v: unknown): v is FakePicks {
  const texts = (list: unknown) => Array.isArray(list) && list.every((item) => typeof item === 'string')
  const p = v as FakePicks | null
  return (
    typeof p === 'object' &&
    p !== null &&
    Array.isArray(p.carm?.procs) &&
    p.carm.procs.every((item) => typeof item?.n === 'string' && typeof item?.noDrug === 'boolean') &&
    texts(p.carm.drugs) &&
    texts(p.sono?.parts) &&
    texts(p.sono?.plains) &&
    texts(p.sono?.withs) &&
    texts(p.pt) &&
    texts(p.ds) &&
    texts(p.eswt?.hits) &&
    texts(p.eswt?.counts) &&
    texts(p.trac)
  )
}

/** 판의 엑스레이 칸 줄(진료보류)에 찍음 표시를 얹은 사본 */
function withMarks(board: FakeBoard, marks: Map<string, string>): FakeBoard {
  const lists = {} as Record<FakeList, FakeRow[]>
  for (const [name, rows] of Object.entries(board.lists) as Array<[FakeList, FakeRow[]]>)
    lists[name] = rows.map((row) => (row.xray ? { ...row, xray: { at: marks.get(row.k) ?? null } } : { ...row }))
  return { ...board, counts: { ...board.counts }, lists }
}
