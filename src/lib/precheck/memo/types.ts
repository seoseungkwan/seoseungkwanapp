import type { LineHint, Tables, Visit } from '@/types/precheck'

// 청구메모 모양(precheck TASK-14). 원본(양지바른 사전점검 seoseungkwan/shared@2a1069b)의 설정 모양 + 시술별 약(design.md 19-3)

/** 원본 TPL 칸. 칸의 뜻과 허용 값은 phrases.ts의 validate(원본 claim_hospital_settings)가 정한다 */
export type PhraseTemplates = {
  sideRuleVersion?: number
  main?: string
  mainCentral?: string
  mainPeripheral?: string
  mainCentralCodes?: string
  mainPeripheralCodes?: string
  cpb?: string
  snb?: string
  sentence?: string
  ara?: string
  klg?: string
  iaAra?: string
  iaEtc?: string
  ts?: string
  /** 건초내주사로 알아볼 차트 말(쉼표로, 500자까지). 비면 지금 말(TS_WORDS_FALLBACK)이다(claim-learn REQ-9308) */
  tsWords?: string
  itv?: string
  ia2?: string
  twoSiteRules?: string
  intervalCodes?: string
  lidoCodes?: string
  intervalDays?: number
  reasonPriority?: string
  sideAuto?: string
  sideQuantity?: string
  sideOmit?: string
  sideByCode?: Record<string, string>
  procedureTypes?: Record<string, string>
  sideKeep?: string
  rename?: string
  icnb?: string
  byRegion?: Record<string, string>
  byProc?: Record<string, string>
  splitEach?: boolean
  mark?: string
  fixedPhrases?: { token: string; text: string; on?: boolean }[]
  siteNames?: Record<string, string>
  sideStyle?: string
  drugWrap?: string
  drugQty?: boolean
  drugUnit?: string
  drugLocal?: boolean
  kneeSetSkipIa?: boolean
  splitCpb?: boolean
  splitSnb?: boolean
  sideMode?: string
  sideSpread?: string
  cartilageSideLang?: string
  drugNames?: Record<string, string>
  drugUnlistedOther?: boolean
  lineJoin?: string
  guides?: string
  levelSep?: string
  __labels?: Record<string, string>
  __catalog?: unknown
  __codeHistory?: unknown
}

/** 원본 CODEMAP 한 줄 */
export type MemoCode = {
  n: string
  k: string
  rg: string | null
  memo?: string
  add?: boolean
  cartilage?: boolean
  cartilageMemo?: string
  displayName?: string
  bitActive?: boolean
  bitName?: string
  bitKind?: string
  standardCode?: string
  steroid?: boolean
  localAnesthetic?: boolean
  carm?: boolean
  injectionDrug?: boolean
  pendingReview?: boolean
  templateKey?: string
}

/** 약을 넣는 자리: 시술 뒤(틀의 {약제} 자리, 없으면 {시술} 바로 뒤) · 끝맺음 뒤(그 줄 맨 끝) · 따로 한 줄 */
export type DrugPlace = 'afterProc' | 'afterEnding' | 'ownLine'
/** 한 시술에서 약 하나를 어떻게 할지. label은 메모에 쓰는 표기(없으면 약 이름). 빼기에는 자리가 없다 */
export type DrugChoice = { use: 'include' | 'exclude'; place?: DrugPlace; label?: string }
/** 시술(원본 procKeys, 대문자 코드) → 약 이름(CODEMAP의 n) → 넣기·빼기. 없는 칸은 아직 정하지 않은 것이다(design.md 19-4) */
export type ProcedureDrugs = Record<string, Record<string, DrugChoice>>

/** 원본에 없는 메모 규칙(memo-settings design.md §1). 칸이 없으면 괄호 안 값이다 */
export type MemoRules = {
  /** 시술 2개 이상인 날, 넣기인 시술이 하나뿐이면 그 시술 줄에 약을 넣는다(없으면 true, REQ-3002) */
  singleOwnerDrug?: boolean
  /** IA·건초내주사 줄의 {부위}에 차트 좌우를 쓴다(없으면 false, AC-3003.1) */
  iaSide?: boolean
  /** 무릎 세트 날에 IA 줄에 놓을 약이 있으면 IA 줄을 쓴다(없으면 false, AC-3003.2) */
  kneeSetIaWithDrug?: boolean
  /** 코드(대문자) → 줄 순서 1~999. 번호 있는 코드의 줄이 먼저 온다(없으면 차트 순서, REQ-3005) */
  order?: Record<string, number>
}

/** 차트 줄임말 한 줄(clinic-profile REQ-6612): 차트에 term으로 적으면 target으로 읽는다. 앞뒤 빈칸 없는 1~40자 */
export type ChartWord = { term: string; target: string }

/** 학습 할 일(claim-learn design.md 2절): 줄 바꿈 · 줄 더함 · 줄 뺌 */
export type LearnKind = 'replace' | 'add' | 'remove'
/** 학습을 쓸 조건. 칸이 비면 그 조건은 꺼짐이고, 켠 조건이 모두 맞을 때만 쓴다(AC-9302.3) */
export type LearnWhen = {
  /** 처방 코드(대문자) */
  codes: string[]
  /** 부위 키(Region: lumbar·knee…) */
  regions: string[]
  /** 사람이 칸에 쓴 차트 말. 0~5개, 말마다 1~20자 */
  chartWords: string[]
  /** 함께 한 다른 처방 코드(대문자) */
  withCodes: string[]
  /** 진료의 코드 */
  doctors: string[]
}
/**
 * 학습 하나(claim-learn design.md 2절 '학습 모양'). 환자 이름·차트번호·진료 날짜·차트 원문은 없다.
 * from·after는 엔진 줄에서 그 진료 값을 {좌우}·{레벨}·{부위}로 바꾼 줄 틀이고, to는 새 문장 틀이다
 */
export type LearnRule = {
  /** 'l' + 소문자 16진수 8자 */
  id: string
  /** 1~40자 */
  name: string
  kind: LearnKind
  /** replace·remove: 줄 틀(1~300자). add: '' */
  from: string
  /** replace·add: 새 문장 틀(1~300자). remove: '' */
  to: string
  /** add만: 앞 줄 틀(0~300자). 그 밖은 '' */
  after: string
  when: LearnWhen
  on: boolean
  /** 남은 확인 0~3 */
  left: number
  /** 만든 날 YYYY-MM-DD(한국 날짜) */
  made: string
}

/**
 * 병원 문구 값(claim_hospital_settings.phrases): 원본 설정 모양 + 시술별 약 + 메모 규칙 + 차트 줄임말(100줄까지, 없으면 빈 표)
 * + 학습(300개까지)과 처음 학습에서 확인한 종류 열쇠(2000개까지, 열쇠마다 120자까지, claim-learn design.md 2절)
 */
export type Phrases = {
  TPL: PhraseTemplates
  CODEMAP: Record<string, MemoCode>
  CODEMAP_DEL: string[]
  procedureDrugs: ProcedureDrugs
  memoRules?: MemoRules
  chartWords?: ChartWord[]
  learned?: LearnRule[]
  learnKinds?: string[]
}

export type PhraseError = { path: string; message: string }
export type PhraseCheck = { ok: true; value: Phrases } | { ok: false; errors: PhraseError[] }
/** 원본 diff 한 줄 */
export type PhraseDiffRow = { path: string; label: string; before: string; after: string }
export type PhraseDiff = PhraseDiffRow[]

/** 문구 사전(원본 NEW_MEDICORE_DICTIONARY에서 메모가 읽는 칸): 줄임말과 생략 규칙. 원본은 병원 PC에 둔다 */
export type MemoDictionary = {
  aliases: { id?: string; kind: string; term: string; target: string }[]
  omissions: { dropRootEpi: boolean; dropShoulderAnbWithCervicalMbb: boolean }
}

/** 약 역할(clinic-profile design.md 10절, drugRoles.ts의 DrugRole + 'none'). 메모는 연골주사 역할만 읽는다 */
export type MemoDrugRole = 'steroid' | 'localAnesthetic' | 'cartilage' | 'none'

/**
 * 메모가 읽는 표: 점검 표(Worker의 Tables)를 그대로 받고, 그중 메모가 읽는 것은 문구 사전·약 역할·연골주사 약 이름뿐이다. 없으면 빈 사전(원본 defaults)이다.
 * roles: 대문자 처방코드 → 역할(처방코드 탭 깃발 → 보험코드 성분, design.md 10절). cartilageNames: 처방 목록에서 역할이 연골주사인 줄의 이름(design.md 11절)
 */
export type MemoTables = Partial<Tables> & { dictionary?: MemoDictionary; roles?: ReadonlyMap<string, MemoDrugRole>; cartilageNames?: string[] }

export type Region = 'shoulder' | 'cervical' | 'lumbar' | 'knee' | 'ankle' | 'elbow' | 'wrist' | 'hand' | 'hip' | 'chest' | 'foot' | 'upper'

/** 시술 줄을 나눈 분절(원본 segs·segAll) */
export type MemoSegment = { t: string; rg: string | null; sd: string | null; sourceText?: string }
/** 증상 한 줄을 분석한 것(원본 v.items) */
export type MemoItem = { t: string; raw: string; k: string; rg: string | null; sd: string | null; hint: LineHint | null; inherit?: boolean; segs?: MemoSegment[] }

/** 처방 수량 표(원본 v.rxQty): 시술 이름(대문자) → 수량. 코드별 줄은 __nmSideRows에 안 보이게 둔다 */
export type QuantityMap = Record<string, number | null> & { __nmSideRows?: { code: string; name: string; quantity: number | null }[] }

/** 부위 메모 조각(원본 buildMemo 결과. 화면 점검용 칸 checks·chips·tags·have는 옮기지 않았다) */
export type MemoParts = {
  rg: string
  ko: string
  side?: string | null
  headTxt?: string
  examTxt?: string[]
  procTxt: string
  procList?: string[]
  cpbTxt?: string
  snbSide?: string | null
  snbSeg?: string | null
  dropped: string[]
  klTxt: string
  araV?: boolean
  rxQty?: QuantityMap | null
  icnbSide?: string
  kl1?: string | null
  kl2?: string | null
  dxKo?: string | null
  dur?: string | null
  imgTxt?: string
  rxOnly?: boolean
  sub?: MemoParts[]
}

export type RxAddition = { name: string; rg: string | null; code: string; qty: number | null }
/** 내원 간격(원본 v.shortItv). prev는 YYYY-MM-DD */
export type ShortInterval = { nm: string; code: string; d: number; prev: string; src: string; lim: number; steroid: boolean; exact: boolean }

/** 분석한 진료(원본 analyze·applyRx·computeIntervals 뒤의 v) */
export type MemoVisit = Visit & {
  items: MemoItem[]
  segAll: MemoSegment[]
  memos: MemoParts[]
  rxAdd: RxAddition[]
  rxNames: Set<string> | null
  rxQty: QuantityMap | null
  rxNone: boolean
  shortItv: ShortInterval | null
}

