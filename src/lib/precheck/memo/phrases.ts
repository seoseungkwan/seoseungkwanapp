import defaults from './defaults.json'
import ourClinic from './ourClinic.json'
import type { MemoCode, PhraseCheck, PhraseDiff, PhraseDiffRow, PhraseError, Phrases, ProcedureDrugs } from './types'

// 병원 문구 값(원본 tools/claim_hospital_settings.js의 defaults·validate·diff·migrateSideConfig, AC-014.3).
// 원본 칸(TPL·CODEMAP·CODEMAP_DEL)은 원본과 같은 결과를 낸다(골든). 시술별 약(procedureDrugs)은 원본에 없어 따로 검사한다(design.md 19-3)
// 원본의 과거 코드 검토(__codeHistory)는 옮기지 않아 그 칸이 있으면 원본이 그 기능을 못 불렀을 때와 같게 거절한다(골든 knownDiffs)
// 병원 값은 defaults.json·ourClinic.json에만 있다. defaults.json의 CODEMAP은 점검 표 codeMap.json과 같다(시험이 본다): 표는 tables.ts만 부른다(AC-007.4)

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const banned = new Set(['__proto__', 'constructor', 'prototype'])
/** 원본의 제어문자 검사([\u0000-\u0008\u000b\u000c\u000e-\u001f]) */
const hasControl = (value: string) => [...value].some((ch) => {
  const code = ch.codePointAt(0)!
  return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)
})
const validCode = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 40 && value === value.trim() && !banned.has(value.toLowerCase()) && /^[\p{L}\p{N} ._+*(),/-]+$/u.test(value)

/** 원본 migrateSideConfig: 옛 좌우 규칙(1)을 2로 바꾼다. 받은 값은 고치지 않는다. 틀리면 던진다 */
export function migratePhrases(value: unknown): unknown {
  const config: unknown = JSON.parse(JSON.stringify(value) ?? 'null')
  if (!plain(config)) throw new Error('병원 설정 형식을 확인해 주세요.')
  if (config.TPL !== undefined) {
    if (!plain(config.TPL)) throw new Error('병원 문구 설정 형식을 확인해 주세요.')
    const version = config.TPL.sideRuleVersion
    if (version !== undefined && version !== 1 && version !== 2) throw new Error('지원하지 않는 좌우 규칙 버전입니다.')
    if (version !== 2) {
      const policies = config.TPL.sideByCode === undefined ? {} : config.TPL.sideByCode
      if (!plain(policies) || Object.keys(policies).length > 12000) throw new Error('이전 코드별 좌우 설정을 확인해 주세요.')
      const migrated: Record<string, unknown> = {}
      const seen = new Set<string>()
      for (const [code, policy] of Object.entries(policies)) {
        if (
          !code ||
          code !== code.trim() ||
          code.length > 40 ||
          !/^[\p{L}\p{N} ._+*(),/-]+$/u.test(code) ||
          ['__proto__', 'constructor', 'prototype'].includes(code.toLowerCase()) ||
          seen.has(code.toUpperCase()) ||
          !['omit', 'quantity', 'keep'].includes(policy as string)
        )
          throw new Error('이전 코드별 좌우 설정을 확인해 주세요.')
        seen.add(code.toUpperCase())
        if (policy === 'omit') migrated[code] = policy
      }
      config.TPL.sideByCode = migrated
      config.TPL.procedureTypes = {}
      config.TPL.sideRuleVersion = 2
    }
  }
  if (plain(config.HOSPITAL_MEMO) && Array.isArray(config.HOSPITAL_MEMO.history)) {
    config.HOSPITAL_MEMO.history = config.HOSPITAL_MEMO.history.map((entry: unknown) =>
      plain(entry) && entry.settings !== undefined ? { ...entry, settings: migratePhrases(entry.settings) } : entry,
    )
  }
  return config
}

const regions = ['shoulder', 'cervical', 'lumbar', 'knee', 'ankle', 'elbow', 'wrist', 'hand', 'hip', 'chest', 'foot', 'upper']
const baseTokens = ['좌우', '한글방향', '영문방향', '레벨', '부위', '시술', '약제', 'KLG', '검사', '기간', '진단', '영상']
const fixedFallback = [{ token: 'C-arm' }, { token: 'Sono' }, { token: '시행함' }]
const reservedTokens = new Set([...baseTokens, '회차', 'KL1', 'KL2', '투여량', '코드', '처방명', '표기', '골절', '시술목록'])
const templateKeys = ['main', 'mainCentral', 'mainPeripheral', 'cpb', 'snb', 'ara', 'klg', 'iaAra', 'iaEtc', 'ts', 'itv', 'ia2', 'icnb', 'sentence']
const procedureTemplate = (key: string) => ['main', 'mainCentral', 'mainPeripheral', 'cpb', 'snb', 'ts', 'iaEtc'].includes(key) || /^(byRegion|byProc)\./.test(key)
const FIELD_TOKENS: Record<string, string[]> = { ara: ['회차'], klg: ['KL1', 'KL2'], iaAra: ['투여량'], iaEtc: ['투여량'], sentence: ['시술목록'] }

type Rec = Record<string, unknown>

function fixedTokens(data: Rec): string[] {
  const list = Array.isArray((data.TPL as Rec | undefined)?.fixedPhrases) ? ((data.TPL as Rec).fixedPhrases as unknown[]) : fixedFallback
  return list.map((row) => String((row as Rec | null)?.token || '')).filter((token) => token && !reservedTokens.has(token))
}

/** 문구 칸 하나(경로: 'TPL.main'·'TPL.byProc.이름'·'CODEMAP.코드.memo' 등)에 쓸 수 있는 {항목}. 검사(validatePhrases)가 허용하는 것과 같다. 틀 칸이 아니면 빈 목록이다(AC-3008.1) */
export function allowedTokens(path: string, phrases: Phrases): string[] {
  return tokens(path, phrases as unknown as Rec)
}

function tokens(path: string, data: Rec): string[] {
  const key = path.replace(/^TPL\./, '')
  const extra = /^CODEMAP\..+\.cartilageMemo$/.test(path)
    ? ['회차', '코드']
    : /^CODEMAP\..+\.memo$/.test(path)
      ? ['투여량', '코드', '표기', '골절']
      : templateKeys.includes(key) || /^(byRegion|byProc)\./.test(key)
        ? [...(Object.hasOwn(FIELD_TOKENS, key) ? FIELD_TOKENS[key] : []), ...(procedureTemplate(key) ? ['코드', '처방명'] : [])]
        : null
  return extra ? [...new Set([...baseTokens, ...extra, ...fixedTokens(data)])] : []
}

const TPL_KEYS = [
  'main', 'mainCentral', 'mainPeripheral', 'mainCentralCodes', 'mainPeripheralCodes', 'twoSiteRules', 'intervalCodes', 'lidoCodes', 'intervalDays', 'reasonPriority',
  'sideStyle', 'drugWrap', 'drugQty', 'drugUnit', 'drugLocal', 'kneeSetSkipIa', 'splitCpb', 'splitSnb', 'cpb', 'snb', 'ara', 'klg', 'iaAra', 'iaEtc', 'ts', 'itv', 'ia2', 'icnb',
  'sideAuto', 'sideKeep', 'sideQuantity', 'sideOmit', 'sideByCode', 'procedureTypes', 'sideRuleVersion', 'sideMode', 'sideSpread', 'cartilageSideLang', 'drugNames', 'drugUnlistedOther',
  'lineJoin', 'sentence', 'guides', 'levelSep', 'fixedPhrases', 'siteNames', 'rename', 'mark', 'splitEach', 'byRegion', 'byProc', '__labels', '__catalog', '__codeHistory',
]
const CODE_KEYS = ['n', 'k', 'rg', 'memo', 'add', 'cartilage', 'cartilageMemo', 'displayName', 'bitActive', 'bitName', 'bitKind', 'standardCode', 'steroid', 'localAnesthetic', 'carm', 'injectionDrug', 'pendingReview', 'templateKey']

/** 원본 validate. 원본 칸만 받는다 */
function validateOriginal(data: unknown): PhraseError[] {
  const errors: PhraseError[] = []
  const err = (path: string, message: string) => errors.push({ path, message })
  function safe(value: unknown, path: string, depth = 0) {
    if (depth > 8) {
      err(path, '설정 구조가 너무 깊습니다.')
      return
    }
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (banned.has(key)) {
          err(path, '사용할 수 없는 항목 이름입니다.')
          continue
        }
        safe((value as Rec)[key], `${path}.${key}`, depth + 1)
      }
    }
  }
  if (!plain(data) || !plain(data.TPL) || !plain(data.CODEMAP) || !Array.isArray(data.CODEMAP_DEL)) return [{ path: '설정', message: '설정 형식을 확인해 주세요.' }]
  const T = data.TPL
  if (Object.keys(data).some((key) => !['TPL', 'CODEMAP', 'CODEMAP_DEL'].includes(key))) err('설정', '문구 설정 이외의 자료는 포함할 수 없습니다.')
  if (Object.keys(T).some((key) => !TPL_KEYS.includes(key))) err('TPL', '알 수 없는 문구 항목입니다.')
  safe(data, '설정')
  if (errors.length) return errors
  if (T.__codeHistory !== undefined) err('TPL.__codeHistory', '과거 코드 검토 기능을 불러오지 못했습니다.')
  if (JSON.stringify(data).length > 2000000) return [{ path: '설정', message: '설정의 문자 수가 저장 한도를 넘었습니다.' }]
  const text = (value: unknown, path: string, max = 4000, templated = true) => {
    if (typeof value !== 'string' || value.length > max || hasControl(value)) {
      err(path, '문자열 길이 또는 제어문자를 확인해 주세요.')
      return
    }
    if (!templated) return
    const allowed = tokens(path, data)
    for (const match of value.matchAll(/\{([^{}]*)\}/g)) if (!allowed.includes(match[1])) err(path, `지원하지 않는 항목 {${match[1]}}입니다. 이 항목의 삽입 버튼을 사용해 주세요.`)
    if (/[{}]/.test(value.replace(/\{[^{}]*\}/g, ''))) err(path, '중괄호를 확인해 주세요. 자동 항목은 {항목} 형식입니다.')
  }
  for (const key of ['main', 'mainCentral', 'mainPeripheral', 'cpb', 'snb', 'ara', 'klg', 'iaAra', 'iaEtc', 'ts', 'itv', 'ia2', 'icnb', 'sideAuto', 'sideKeep', 'sideQuantity', 'sideOmit', 'rename', 'mark', 'sentence', 'guides']) {
    if (T[key] !== undefined) text(T[key], `TPL.${key}`, key === 'mark' ? 16 : 4000)
  }
  if (T.twoSiteRules !== undefined) {
    text(T.twoSiteRules, 'TPL.twoSiteRules', 4000, false)
    const bad = String(T.twoSiteRules)
      .split('\n')
      .filter((line) => line.trim())
      .flatMap((line) => {
        const parts = line.split('=')
        if (parts.length > 2) return [line.trim()]
        return [parts[0].trim(), ...(parts[1] || '').split(/[\s,]+/).filter(Boolean)].filter((code) => !validCode(code))
      })
    if (bad.length) err('TPL.twoSiteRules', `한 줄에 하나씩 "기준코드 = 같이 있어도 한 부위로 보는 코드" 형식으로 적어 주세요: ${bad.slice(0, 3).join(', ')}`)
  }
  if (T.intervalDays !== undefined && !(Number.isInteger(T.intervalDays) && (T.intervalDays as number) >= 1 && (T.intervalDays as number) <= 365)) err('TPL.intervalDays', '주사 간격 일수는 1~365 사이의 숫자로 적어 주세요.')
  const oneOf = (value: unknown, list: string[]) => list.includes(value as string)
  if (T.reasonPriority !== undefined && !oneOf(T.reasonPriority, ['twoSite', 'both', 'interval'])) err('TPL.reasonPriority', '두 사유가 겹칠 때 쓸 문장을 고르세요.')
  if (T.sideStyle !== undefined && !oneOf(T.sideStyle, ['Rt', 'upper', 'dot', 'bil', 'ko', 'koShort'])) err('TPL.sideStyle', '좌우 표기 모양을 고르세요.')
  if (T.drugWrap !== undefined && !oneOf(T.drugWrap, ['paren', 'plain'])) err('TPL.drugWrap', '약제 표기 모양을 고르세요.')
  if (T.drugUnit !== undefined) text(T.drugUnit, 'TPL.drugUnit', 10, false)
  for (const key of ['drugQty', 'drugLocal', 'kneeSetSkipIa', 'splitCpb', 'splitSnb']) if (T[key] !== undefined && typeof T[key] !== 'boolean') err(`TPL.${key}`, '켜기·끄기 값을 확인해 주세요.')
  for (const key of ['mainCentralCodes', 'mainPeripheralCodes', 'intervalCodes', 'lidoCodes']) {
    if (T[key] === undefined) continue
    text(T[key], `TPL.${key}`, 20000, false)
    const bad = String(T[key]).split(/[\s,]+/).filter(Boolean).filter((code) => !validCode(code))
    if (bad.length) err(`TPL.${key}`, `처방코드 형식을 확인해 주세요: ${bad.slice(0, 3).join(', ')}`)
  }
  if (typeof T.splitEach !== 'boolean') err('TPL.splitEach', '줄 나누기 설정을 확인해 주세요.')
  if (T.sideMode !== undefined && !oneOf(T.sideMode, ['quantity', 'chart'])) err('TPL.sideMode', '좌우 기본 표기는 수량 기준 또는 차트 좌우 그대로 중에서 고르세요.')
  if (T.sideSpread !== undefined && !oneOf(T.sideSpread, ['all', 'adjacent'])) err('TPL.sideSpread', '앞에 한 번 적힌 좌우의 적용 범위를 고르세요.')
  if (T.cartilageSideLang !== undefined && !oneOf(T.cartilageSideLang, ['ko', 'en'])) err('TPL.cartilageSideLang', '연골주사 좌우 표기는 한글 또는 영어 중에서 고르세요.')
  if (T.levelSep !== undefined && !oneOf(T.levelSep, ['comma', 'dash', 'repeat'])) err('TPL.levelSep', '레벨 구분 기호는 쉼표·붙임표·글자 반복 중에서 고르세요.')
  if (T.fixedPhrases !== undefined) {
    const list = T.fixedPhrases
    const seen = new Set<string>()
    if (!Array.isArray(list) || list.length > 30) err('TPL.fixedPhrases', '고정 멘트는 30개까지 등록할 수 있습니다.')
    else {
      list.forEach((row: unknown, index: number) => {
        const path = `TPL.fixedPhrases.${index}`
        if (!plain(row) || Object.keys(row).some((key) => !['token', 'text', 'on'].includes(key))) {
          err(path, '고정 멘트 형식을 확인해 주세요.')
          return
        }
        const token = typeof row.token === 'string' ? row.token : ''
        if (!token || token.length > 20 || /[{}\s]/.test(token)) err(path, '고정 멘트 버튼 이름은 띄어쓰기·중괄호 없이 20자 이내로 적어 주세요.')
        else if (reservedTokens.has(token) || seen.has(token)) err(path, `이미 있는 버튼 이름입니다: {${token}}`)
        seen.add(token)
        text(row.text, path, 200, false)
        if (row.on !== undefined && typeof row.on !== 'boolean') err(path, '고정 멘트 켜기·끄기 값을 확인해 주세요.')
      })
    }
  }
  if (T.siteNames !== undefined) {
    const map = T.siteNames
    if (!plain(map) || Object.keys(map).some((key) => !regions.includes(key))) err('TPL.siteNames', '부위 영어 표기 형식을 확인해 주세요.')
    else for (const [key, value] of Object.entries(map)) text(value, `TPL.siteNames.${key}`, 40, false)
  }
  if (T.lineJoin !== undefined && !oneOf(T.lineJoin, ['lines', 'oneLine'])) err('TPL.lineJoin', '줄 나눔은 줄마다 나누기 또는 한 줄로 이어쓰기 중에서 고르세요.')
  if (T.drugUnlistedOther !== undefined && typeof T.drugUnlistedOther !== 'boolean') err('TPL.drugUnlistedOther', '목록에 없는 약 처리 방식을 확인해 주세요.')
  if (T.drugNames !== undefined) {
    const names = T.drugNames
    if (!plain(names) || Object.keys(names).some((key) => !['localAnesthetic', 'steroid', 'cartilage', 'injectionDrug'].includes(key))) err('TPL.drugNames', '약 이름 목록 형식을 확인해 주세요.')
    else for (const key of Object.keys(names)) text(names[key], `TPL.drugNames.${key}`, 2000, false)
  }
  if (Object.hasOwn(T, 'sideRuleVersion') && T.sideRuleVersion !== 2) err('TPL.sideRuleVersion', '좌우 규칙 버전은 2여야 합니다. 이전 설정은 다시 불러와 변환해 주세요.')
  if (T.sideByCode !== undefined) {
    const map = T.sideByCode
    const seen = new Set<string>()
    if (!plain(map) || Object.keys(map).length > 12000) err('TPL.sideByCode', '코드별 좌우 설정은 최대 12000개입니다.')
    else {
      for (const [code, policy] of Object.entries(map)) {
        if (!validCode(code) || seen.has(code.toUpperCase())) err(`TPL.sideByCode.${code}`, '처방코드 형식 또는 중복을 확인해 주세요.')
        seen.add(code.toUpperCase())
        if (!oneOf(policy, ['omit', 'quantity', 'keep'])) err(`TPL.sideByCode.${code}`, '좌우 미표기·1.5 이상만 both·차트 좌우 유지 중 선택하세요.')
      }
    }
  }
  if (T.procedureTypes !== undefined) {
    const map = T.procedureTypes
    const seen = new Set<string>()
    if (!plain(map) || Object.keys(map).length > 12000) err('TPL.procedureTypes', '코드별 표기 유형은 최대 12000개입니다.')
    else {
      for (const [code, type] of Object.entries(map)) {
        if (!validCode(code) || seen.has(code.toUpperCase())) err(`TPL.procedureTypes.${code}`, '처방코드 형식 또는 중복을 확인해 주세요.')
        seen.add(code.toUpperCase())
        if (!oneOf(type, ['side', 'level'])) err(`TPL.procedureTypes.${code}`, '좌우형 또는 레벨+좌우형을 선택하세요.')
      }
    }
  }
  if (T.__catalog !== undefined) {
    const meta = T.__catalog
    const keys = ['schema', 'profileId', 'institutionCode', 'asOf', 'source', 'rowCount']
    const asOf = plain(meta) ? meta.asOf : undefined
    const date = typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? new Date(`${asOf}T00:00:00Z`) : null
    if (
      !plain(meta) ||
      Object.keys(meta).length !== keys.length ||
      Object.keys(meta).some((key) => !keys.includes(key)) ||
      meta.schema !== 1 ||
      typeof meta.profileId !== 'string' ||
      !/^[a-f0-9]{32}$/.test(meta.profileId) ||
      typeof meta.institutionCode !== 'string' ||
      !/^\d{8}$/.test(meta.institutionCode) ||
      !date ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== asOf ||
      meta.source !== 'drbit-hospital' ||
      !Number.isInteger(meta.rowCount) ||
      (meta.rowCount as number) < 0 ||
      (meta.rowCount as number) > 12000
    )
      err('TPL.__catalog', '병원 코드 출처 정보를 확인해 주세요.')
  }
  for (const group of ['byRegion', 'byProc', '__labels']) {
    const map = T[group] || {}
    if (!plain(map) || Object.keys(map).length > 12000) {
      err(`TPL.${group}`, '항목은 최대 12000개입니다.')
      continue
    }
    const seen = new Set<string>()
    for (const [key, value] of Object.entries(map)) {
      if (!key.trim() || key !== key.trim() || key.length > 120 || seen.has(key.toUpperCase())) err(`TPL.${group}`, '빈 이름이나 중복 이름을 확인해 주세요.')
      seen.add(key.toUpperCase())
      if (group === 'byRegion' && !regions.includes(key)) err(`TPL.byRegion.${key}`, '지원하는 부위를 골라 주세요.')
      text(value, `TPL.${group}.${key}`, group === '__labels' ? 120 : 4000, group !== '__labels')
    }
  }
  for (const line of String(T.rename || '').split('\n').filter((x) => x.trim())) {
    const parts = line.split('>')
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) err('TPL.rename', '한 줄마다 찾을표기 > 바꿀표기를 입력해 주세요.')
  }
  const codes = Object.entries(data.CODEMAP)
  const seen = new Set<string>()
  if (codes.length > 12000) err('CODEMAP', '처방코드는 최대 12000개입니다.')
  for (const [code, item] of codes) {
    if (!validCode(code) || seen.has(code.toUpperCase())) err(`CODEMAP.${code}`, '코드는 문자·숫자·공백·._+-*(),/ 40자 이내로 입력하고 앞뒤 공백과 대소문자만 다른 중복은 제외하세요.')
    seen.add(code.toUpperCase())
    if (!plain(item)) {
      err(`CODEMAP.${code}`, '코드 설정을 확인해 주세요.')
      continue
    }
    if (Object.keys(item).some((key) => !CODE_KEYS.includes(key))) err(`CODEMAP.${code}`, '알 수 없는 코드 항목입니다.')
    text(item.n, `CODEMAP.${code}.n`, 120, false)
    if (item.templateKey !== undefined) text(item.templateKey, `CODEMAP.${code}.templateKey`, 120, false)
    if (item.displayName !== undefined) text(item.displayName, `CODEMAP.${code}.displayName`, 120, false)
    if (item.bitName !== undefined) text(item.bitName, `CODEMAP.${code}.bitName`, 120, false)
    if (item.bitKind !== undefined && !oneOf(item.bitKind, ['drug', 'procedure', 'lab', 'other', 'unknown'])) err(`CODEMAP.${code}.bitKind`, '비트 원본 구분을 확인해 주세요.')
    if (item.standardCode !== undefined && item.standardCode !== '' && !validCode(item.standardCode)) err(`CODEMAP.${code}.standardCode`, '비트 원본 보험수가 코드를 확인해 주세요.')
    if (item.bitActive !== undefined && typeof item.bitActive !== 'boolean') err(`CODEMAP.${code}.bitActive`, '비트 등록 유효 상태를 확인해 주세요.')
    if (!String(item.n || '').trim()) err(`CODEMAP.${code}.n`, '시술·약제 표기를 입력해 주세요.')
    if (!oneOf(item.k, ['proc', 'drug', 'note', 'lab', 'skip'])) err(`CODEMAP.${code}.k`, '코드 구분을 골라 주세요.')
    if (item.rg !== null && item.rg !== '' && !regions.includes(item.rg as string)) err(`CODEMAP.${code}.rg`, '부위를 골라 주세요.')
    if (item.add !== undefined && typeof item.add !== 'boolean') err(`CODEMAP.${code}.add`, '자동 보충 여부를 확인해 주세요.')
    if (item.cartilage !== undefined && typeof item.cartilage !== 'boolean') err(`CODEMAP.${code}.cartilage`, '연골주사 약제 여부를 확인해 주세요.')
    for (const role of ['steroid', 'localAnesthetic', 'carm', 'injectionDrug', 'pendingReview']) {
      if (item[role] !== undefined && typeof item[role] !== 'boolean') err(`CODEMAP.${code}.${role}`, '분류와 확인 상태는 선택 또는 해제로 지정해 주세요.')
    }
    if (item.memo !== undefined) text(item.memo, `CODEMAP.${code}.memo`)
    if (item.cartilageMemo !== undefined) text(item.cartilageMemo, `CODEMAP.${code}.cartilageMemo`)
  }
  if (data.CODEMAP_DEL.length > 12000 || data.CODEMAP_DEL.some((code: unknown) => !validCode(code))) err('CODEMAP_DEL', '삭제 코드 목록을 확인해 주세요.')
  return errors
}

const DRUG_PLACES = ['afterProc', 'afterEnding', 'ownLine']
const CHOICE_KEYS = ['use', 'place', 'label']

/** 시술별 약 칸 검사(원본에 없는 칸. design.md 19-3) */
function validateDrugs(value: unknown): PhraseError[] {
  const errors: PhraseError[] = []
  const err = (path: string, message: string) => errors.push({ path, message })
  if (!plain(value)) return [{ path: 'procedureDrugs', message: '시술별 약 형식을 확인해 주세요.' }]
  for (const [proc, drugs] of Object.entries(value)) {
    const procPath = `procedureDrugs.${proc}`
    if (!validCode(proc) || proc !== proc.toUpperCase()) {
      err(procPath, '시술 코드 형식을 확인해 주세요.')
      continue
    }
    if (!plain(drugs)) {
      err(procPath, '시술별 약 형식을 확인해 주세요.')
      continue
    }
    for (const [name, choice] of Object.entries(drugs)) {
      const path = `${procPath}.${name}`
      if (!name.trim() || name !== name.trim() || name.length > 120 || banned.has(name.toLowerCase())) {
        err(path, '약 이름을 확인해 주세요.')
        continue
      }
      if (!plain(choice) || Object.keys(choice).some((key) => !CHOICE_KEYS.includes(key))) {
        err(path, '넣기·빼기 값을 확인해 주세요.')
        continue
      }
      if (choice.use !== 'include' && choice.use !== 'exclude') err(`${path}.use`, '넣기 또는 빼기를 골라 주세요.')
      if (choice.use === 'include' && !DRUG_PLACES.includes(choice.place as string)) err(`${path}.place`, '약을 넣을 자리를 골라 주세요.')
      if (choice.use === 'exclude' && choice.place !== undefined) err(`${path}.place`, '빼는 약에는 자리가 없습니다.')
      if (choice.label !== undefined) {
        const bad = typeof choice.label !== 'string' || choice.label.length > 120 || hasControl(choice.label) || /[\n\t\r{}]/.test(choice.label)
        if (bad) err(`${path}.label`, '약 표기는 120자 이내로 적고 중괄호를 쓰지 말아 주세요.')
      }
    }
  }
  return errors
}

const RULE_FLAGS = ['singleOwnerDrug', 'iaSide', 'kneeSetIaWithDrug']
const RULE_KEYS = [...RULE_FLAGS, 'order']

/** 메모 규칙 칸 검사(원본에 없는 칸. memo-settings design.md §1). 칸이 없으면 지난다 */
function validateMemoRules(value: unknown): PhraseError[] {
  if (value === undefined) return []
  const errors: PhraseError[] = []
  const err = (path: string, message: string) => errors.push({ path, message })
  if (!plain(value)) return [{ path: 'memoRules', message: '메모 규칙 형식을 확인해 주세요.' }]
  if (Object.keys(value).some((key) => !RULE_KEYS.includes(key))) err('memoRules', '알 수 없는 메모 규칙 항목입니다.')
  for (const key of RULE_FLAGS) if (value[key] !== undefined && typeof value[key] !== 'boolean') err(`memoRules.${key}`, '켜기·끄기 값을 확인해 주세요.')
  if (value.order !== undefined) {
    const order = value.order
    if (!plain(order) || Object.keys(order).length > 12000) err('memoRules.order', '줄 순서는 코드마다 번호 하나씩, 12000개까지 적어 주세요.')
    else {
      for (const [code, rank] of Object.entries(order)) {
        if (!validCode(code) || code !== code.toUpperCase()) err(`memoRules.order.${code}`, '처방코드 형식을 확인해 주세요.')
        else if (!Number.isInteger(rank) || (rank as number) < 1 || (rank as number) > 999) err(`memoRules.order.${code}`, '줄 순서는 1~999 사이의 숫자로 적어 주세요.')
      }
    }
  }
  return errors
}

const CHART_WORD_KEYS = ['term', 'target']
const CHART_WORD_MAX = 100

/** 차트 줄임말 칸 검사(원본에 없는 칸. clinic-profile design.md 14절): 100줄까지, 칸마다 앞뒤 빈칸 없는 1~40자, 적으면 칸은 대소문자 무시하고 한 번만. 칸이 없으면 지난다 */
function validateChartWords(value: unknown): PhraseError[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) return [{ path: 'chartWords', message: '차트 줄임말 형식을 확인해 주세요.' }]
  if (value.length > CHART_WORD_MAX) return [{ path: 'chartWords', message: `차트 줄임말은 ${CHART_WORD_MAX}줄까지 적어 주세요.` }]
  const errors: PhraseError[] = []
  const seen = new Set<string>()
  value.forEach((row: unknown, index: number) => {
    const path = `chartWords.${index}`
    if (!plain(row) || Object.keys(row).some((key) => !CHART_WORD_KEYS.includes(key))) {
      errors.push({ path, message: '차트 줄임말 형식을 확인해 주세요.' })
      return
    }
    for (const key of CHART_WORD_KEYS) {
      const cell = row[key]
      if (typeof cell !== 'string' || !cell || cell.length > 40 || cell !== cell.trim() || hasControl(cell) || /[\n\r\t]/.test(cell)) {
        errors.push({ path: `${path}.${key}`, message: '차트 줄임말은 칸마다 앞뒤 빈칸 없이 1~40자로 적어 주세요.' })
      }
    }
    if (typeof row.term !== 'string' || !row.term) return
    const key = row.term.toLowerCase()
    if (seen.has(key)) errors.push({ path: `${path}.term`, message: `같은 줄임말이 이미 있습니다: ${row.term}` })
    seen.add(key)
  })
  return errors
}

const TS_WORDS_MAX = 500

/**
 * 건초내주사로 알아볼 차트 말(TPL.tsWords, 원본에 없는 칸. claim-learn design.md 2절): 500자까지의 글. 원본 검사가 모르는 칸이라
 * 원본 검사에 넘기는 TPL에서만 뺀다(돌려주는 값에는 남는다). 칸이 없으면 지난다
 */
function takeTsWords(original: Rec): PhraseError[] {
  if (!plain(original.TPL) || !Object.hasOwn(original.TPL, 'tsWords')) return []
  const { tsWords, ...TPL } = original.TPL
  original.TPL = TPL
  const bad = typeof tsWords !== 'string' || tsWords.length > TS_WORDS_MAX || hasControl(tsWords)
  return bad ? [{ path: 'TPL.tsWords', message: `건초내주사로 알아볼 차트 말은 쉼표로 나눠 ${TS_WORDS_MAX}자까지 적어 주세요.` }] : []
}

// ── 학습(claim-learn design.md 2절 '학습 모양'). 원본에 없는 칸이다 ─────────────

/** 학습은 300개까지(AC-9304.3, notes '한도'의 {N}) */
export const LEARN_MAX = 300
/** 처음 학습에서 확인한 종류 열쇠는 2000개까지, 열쇠마다 120자까지 */
export const LEARN_KINDS_MAX = 2000
export const LEARN_KIND_KEY_MAX = 120
/** 설정 전체 글자 한도(원본 validate의 200만 자와 같은 수) */
export const PHRASES_MAX_CHARS = 2000000

const LEARN_KEYS = ['id', 'name', 'kind', 'from', 'to', 'after', 'when', 'on', 'left', 'made']
const WHEN_KEYS = ['codes', 'regions', 'chartWords', 'withCodes', 'doctors']
const LEARN_KINDS = ['replace', 'add', 'remove']
/** 한 줄 글: 줄바꿈·탭·제어문자 없이 max자까지 */
const oneLine = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !hasControl(value) && !/[\n\r\t]/.test(value)
const ymd = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function validateWhen(value: unknown, path: string): PhraseError[] {
  if (!plain(value) || Object.keys(value).length !== WHEN_KEYS.length || Object.keys(value).some((key) => !WHEN_KEYS.includes(key))) return [{ path, message: '학습 조건 형식을 확인해 주세요.' }]
  const errors: PhraseError[] = []
  const list = (key: string, ok: (item: unknown) => boolean, message: string, max = Infinity) => {
    const items = value[key]
    if (!Array.isArray(items) || items.length > max || !items.every(ok)) errors.push({ path: `${path}.${key}`, message })
  }
  const upperCode = (item: unknown) => validCode(item) && item === item.toUpperCase()
  list('codes', upperCode, '처방코드 형식을 확인해 주세요.')
  list('regions', (item) => regions.includes(item as string), '지원하는 부위를 골라 주세요.')
  list('chartWords', (item) => oneLine(item, 20) && item.trim() !== '', '차트에 쓴 말은 5개까지, 말마다 1~20자로 적어 주세요.', 5)
  list('withCodes', upperCode, '처방코드 형식을 확인해 주세요.')
  list('doctors', validCode, '진료의 코드 형식을 확인해 주세요.')
  if (!errors.length && WHEN_KEYS.every((key) => !(value[key] as unknown[]).length)) errors.push({ path, message: '학습 조건을 하나 이상 골라 주세요.' })
  return errors
}

/** 학습 칸 검사: 300개까지, 칸은 학습 모양뿐(환자 값 칸이 끼면 거절, AC-9316.2), 번호 모양·겹침, 할 일마다 빈 칸 규칙, 남은 확인 0~3 정수. 칸이 없으면 지난다 */
function validateLearned(value: unknown): PhraseError[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) return [{ path: 'learned', message: '학습 목록 형식을 확인해 주세요.' }]
  if (value.length > LEARN_MAX) return [{ path: 'learned', message: `학습은 ${LEARN_MAX}개까지 둘 수 있습니다.` }]
  const errors: PhraseError[] = []
  const seen = new Set<string>()
  value.forEach((row: unknown, index: number) => {
    const path = `learned.${index}`
    const err = (key: string, message: string) => errors.push({ path: `${path}.${key}`, message })
    if (!plain(row) || Object.keys(row).length !== LEARN_KEYS.length || Object.keys(row).some((key) => !LEARN_KEYS.includes(key))) {
      errors.push({ path, message: '학습 형식을 확인해 주세요.' })
      return
    }
    if (typeof row.id !== 'string' || !/^l[0-9a-f]{8}$/.test(row.id)) err('id', '학습 번호 형식을 확인해 주세요.')
    else if (seen.has(row.id)) err('id', '같은 학습 번호가 이미 있습니다.')
    else seen.add(row.id)
    if (!oneLine(row.name, 40) || !row.name.trim()) err('name', '학습 이름은 1~40자로 적어 주세요.')
    if (!LEARN_KINDS.includes(row.kind as string)) err('kind', '학습 할 일을 골라 주세요.')
    else {
      const needs: Record<string, [boolean, boolean]> = {
        // 칸: [쓰는 칸인가, 꼭 있어야 하나]
        from: [row.kind !== 'add', true],
        to: [row.kind !== 'remove', true],
        after: [row.kind === 'add', false],
      }
      for (const [key, [used, required]] of Object.entries(needs)) {
        const cell = row[key]
        if (!oneLine(cell, 300)) err(key, '학습 문장은 줄바꿈 없이 300자까지 적어 주세요.')
        else if (!used && cell !== '') err(key, '이 학습 할 일에는 쓰지 않는 칸입니다.')
        else if (used && required && !cell.trim()) err(key, '학습 문장을 적어 주세요.')
      }
    }
    errors.push(...validateWhen(row.when, `${path}.when`))
    if (typeof row.on !== 'boolean') err('on', '켜기·끄기 값을 확인해 주세요.')
    if (!Number.isInteger(row.left) || (row.left as number) < 0 || (row.left as number) > 3) err('left', '남은 확인은 0~3 사이의 정수로 적어 주세요.')
    if (!ymd(row.made)) err('made', '만든 날 형식을 확인해 주세요.')
  })
  return errors
}

/** 처음 학습 확인한 종류 칸 검사: 2000개까지, 열쇠마다 1~120자 한 줄 글. 칸이 없으면 지난다 */
function validateLearnKinds(value: unknown): PhraseError[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) return [{ path: 'learnKinds', message: '처음 학습 종류 형식을 확인해 주세요.' }]
  if (value.length > LEARN_KINDS_MAX) return [{ path: 'learnKinds', message: `처음 학습 종류는 ${LEARN_KINDS_MAX}개까지입니다.` }]
  return value.flatMap((key: unknown, index: number) =>
    oneLine(key, LEARN_KIND_KEY_MAX) && key !== '' ? [] : [{ path: `learnKinds.${index}`, message: `처음 학습 종류 열쇠는 1~${LEARN_KIND_KEY_MAX}자로 적어 주세요.` }],
  )
}

/**
 * 메모에 쓸 수 있는 문구 값인지 본다. 옛 좌우 규칙은 먼저 2로 바꾼다(원본 apply·preview 흐름). 틀리면 어느 칸인지 돌려준다.
 * 줄이 없거나 빈 {}이거나 약 칸이 없으면 ok가 거짓이고, 부르는 쪽은 메모를 만들지 않는다(AC-014.8)
 */
export function validatePhrases(input: unknown): PhraseCheck {
  let migrated: unknown
  try {
    migrated = migratePhrases(input)
  } catch (error) {
    return { ok: false, errors: [{ path: '설정', message: (error as Error).message }] }
  }
  const { procedureDrugs, memoRules, chartWords, learned, learnKinds, ...original } = migrated as Rec
  const tsWordErrors = takeTsWords(original)
  const errors = validateOriginal(original)
  if (errors.length === 1 && errors[0].path === '설정' && errors[0].message === '설정 형식을 확인해 주세요.') return { ok: false, errors }
  errors.push(...validateDrugs(procedureDrugs), ...validateMemoRules(memoRules), ...validateChartWords(chartWords))
  errors.push(...tsWordErrors)
  errors.push(...validateLearned(learned), ...validateLearnKinds(learnKinds))
  return errors.length ? { ok: false, errors } : { ok: true, value: migrated as Phrases }
}

const labels: Record<string, string> = {
  main: '기본 시술 문구', mainCentral: 'Central 시술 문구', mainPeripheral: 'Peripheral 시술 문구', mainCentralCodes: 'Central 시술 처방코드', mainPeripheralCodes: 'Peripheral 시술 처방코드',
  lidoCodes: '리도카인(국소마취제) 처방코드', twoSiteRules: '2부위로 보는 처방', intervalCodes: '주사 간격을 볼 처방코드', intervalDays: '주사 간격 일수', reasonPriority: '두 사유가 겹칠 때',
  sideStyle: '좌우 표기 모양', drugWrap: '약제 표기 모양', drugQty: '약제 투여량 쓰기', drugUnit: '약제 투여량 단위', drugLocal: '국소마취제도 약제에 쓰기', kneeSetSkipIa: '무릎 세트면 IA 줄 생략',
  splitCpb: '경추 CPB 따로 쓰기', splitSnb: '요추 SNB 따로 쓰기', cpb: '경부 CPB', snb: 'SNB 문구', ara: '연골주사', klg: 'K-L grade', iaAra: '연골주사 포함 IA', iaEtc: '일반 IA', ts: '건초내주사', tsWords: '건초내주사로 알아볼 차트 말',
  itv: '주사 간격 사유', ia2: '2부위 시술 사유', icnb: 'ICNB', sideAuto: '좌우 자동 처리', sideKeep: '좌우 유지', sideQuantity: '수량 1.5 기준 시술', sideOmit: '항상 좌우 미표기', sideByCode: '코드별 좌우 표시',
  sideRuleVersion: '좌우 적용 규칙', rename: '표기 바꾸기', mark: '줄머리 기호', splitEach: '시술 줄 나누기', sideMode: '좌우 기본 표기', sideSpread: '앞에 적힌 좌우 적용', cartilageSideLang: '연골주사 좌우 표기',
  drugUnlistedOther: '목록에 없는 약·처치', lineJoin: '줄 나눔', sentence: '한 줄 문장 틀', guides: '가이드(투시) 문구(이전)', fixedPhrases: '고정 멘트', siteNames: '부위 영어 표기', levelSep: '레벨 구분 기호',
  'drugNames.localAnesthetic': '국소마취제 약 이름', 'drugNames.steroid': '스테로이드 약 이름', 'drugNames.cartilage': '연골주사 약 이름', 'drugNames.injectionDrug': '주사약 약 이름',
}

const lookup = (table: Record<string, string>, value: unknown, fallback: string) => (typeof value === 'string' && Object.hasOwn(table, value) ? table[value] : fallback)

/** 메모 규칙 켜기·끄기 칸: 이름표와 칸이 없을 때의 값(AC-3006.2) */
const RULE_FLAG_LABELS: Record<string, { label: string; unset: boolean }> = {
  singleOwnerDrug: { label: '시술 2개 이상인 날 넣기 시술이 하나면 약 넣기', unset: true },
  iaSide: { label: 'IA·건초내주사 줄에 좌우 넣기', unset: false },
  kneeSetIaWithDrug: { label: '무릎 세트 날 약이 있으면 IA 줄 쓰기', unset: false },
}

/** 메모 규칙 칸 한 줄(원본에 없는 칸이라 원본 diff 모양 밖이다). 보이는 값이 같으면(없음 ↔ 처음 값) 줄을 내지 않는다 */
function memoRuleRow(path: string, a: unknown, b: unknown): PhraseDiffRow | null {
  const key = path.slice('memoRules.'.length)
  let label: string
  let shown: (value: unknown) => string
  if (key.startsWith('order.')) {
    label = `${key.slice('order.'.length)} · 줄 순서`
    shown = (value) => (value === undefined ? '(없음)' : typeof value === 'number' ? String(value) : JSON.stringify(value))
  } else if (Object.hasOwn(RULE_FLAG_LABELS, key)) {
    const flag = RULE_FLAG_LABELS[key]
    label = flag.label
    shown = (value) => ((value === undefined ? flag.unset : value) === true ? '켬' : value === undefined || value === false ? '끔' : JSON.stringify(value))
  } else {
    label = path
    shown = (value) => (value === undefined ? '(없음)' : JSON.stringify(value))
  }
  const row = { path, label, before: shown(a), after: shown(b) }
  return row.before === row.after ? null : row
}

/** 차트 줄임말 칸의 보이는 값: '적으면 = 읽어요'를 쉼표로. 없음과 빈 표는 같다(clinic-profile design.md 14절) */
function chartWordsShown(value: unknown): string {
  if (value === undefined || (Array.isArray(value) && !value.length)) return '(없음)'
  if (!Array.isArray(value)) return JSON.stringify(value)
  return value.map((row) => (plain(row) ? `${String(row.term ?? '')} = ${String(row.target ?? '')}` : JSON.stringify(row))).join(', ')
}

/** 원본 diff: 두 값의 다른 칸을 이름표와 함께. 약 칸도 같은 길로 보인다(이름표가 없어 경로로 보인다). 메모 규칙 칸은 쉬운 이름표로 칸마다(줄 순서는 코드마다) 보인다 */
export function diffPhrases(before: Phrases, after: Phrases): PhraseDiff {
  const result: PhraseDiff = []
  function walk(a: unknown, b: unknown, path: string) {
    if (JSON.stringify(a) === JSON.stringify(b)) return
    if (plain(a) && plain(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) walk(a[key], b[key], path ? `${path}.${key}` : key)
      return
    }
    if ((path === 'memoRules' || path === 'memoRules.order') && (a === undefined || plain(a)) && (b === undefined || plain(b))) {
      walk(a ?? {}, b ?? {}, path)
      return
    }
    if (path.startsWith('memoRules.')) {
      const row = memoRuleRow(path, a, b)
      if (row) result.push(row)
      return
    }
    if (path === 'chartWords') {
      const row = { path, label: '차트 줄임말', before: chartWordsShown(a), after: chartWordsShown(b) }
      if (row.before !== row.after) result.push(row)
      return
    }
    const sideCode = path.startsWith('TPL.sideByCode.')
    const procedureType = path.startsWith('TPL.procedureTypes.')
    const shown = (value: unknown): string => {
      if (path === 'TPL.sideRuleVersion') return value === 2 ? '코드별 켜기·끄기 규칙' : '이전 좌우 규칙'
      if (procedureType) return lookup({ side: '좌우형', level: '레벨+좌우형' }, value, '기본 분류')
      if (sideCode) return lookup({ omit: '좌우 미표기', quantity: '총투여량 1.5 이상만 both', keep: '차트 Lt/Rt/both 유지' }, value, '기존 규칙 사용')
      if (path === 'TPL.sideMode') return lookup({ quantity: '총투여량 1.5 이상만 both', chart: '차트 Lt/Rt/both 그대로' }, value, '총투여량 1.5 이상만 both')
      if (path === 'TPL.sideSpread') return lookup({ all: '뒤 시술 모두', adjacent: '바로 옆 시술만' }, value, '뒤 시술 모두')
      if (path === 'TPL.cartilageSideLang') return lookup({ ko: '한글 (우측·좌측·양측)', en: '영어 (Rt·Lt·both)' }, value, '한글 (우측·좌측·양측)')
      if (path === 'TPL.levelSep') return lookup({ comma: '쉼표 (L4,5,S1)', dash: '붙임표 (L4-5-S1)' }, value, '쉼표 (L4,5,S1)')
      if (path === 'TPL.lineJoin') return lookup({ lines: '줄마다 나누어 쓰기', oneLine: '한 줄로 이어쓰기' }, value, '줄마다 나누어 쓰기')
      if (path === 'TPL.drugUnlistedOther') return value === false ? '분류 확인 필요로 표시' : '메모와 관계없는 항목으로 보기'
      return value === undefined ? '(없음)' : typeof value === 'string' ? value : JSON.stringify(value)
    }
    const label = procedureType
      ? `${path.slice('TPL.procedureTypes.'.length)} · 표기 유형`
      : sideCode
        ? `${path.slice('TPL.sideByCode.'.length)} · 좌우 표시`
        : lookup(labels, path.replace(/^TPL\./, ''), path)
    result.push({ path, label, before: shown(a), after: shown(b) })
  }
  walk(before, after, '')
  return result
}

/** 원본 기본 문구(TPL_DEF·FIXED_PHRASES_DEF·SITE_NAMES_DEF·CODEMAP_DEF). 약은 고른 적이 없어 비어 있다 */
export function defaultPhrases(): Phrases {
  return { ...clone(defaults), CODEMAP: clone(defaults.CODEMAP) as Record<string, MemoCode>, procedureDrugs: {} }
}

/** 우리 병원 설정: 원본 기본 문구 + 원본 결과가 나오는 시술별 약(design.md 19-3). 서버 줄로 넣는 길은 scripts/precheck/our-clinic-settings.mjs다 */
export function ourClinicPhrases(): Phrases {
  return { ...defaultPhrases(), procedureDrugs: clone(ourClinic.procedureDrugs) as ProcedureDrugs }
}

/**
 * 원본 기본값 가운데 우리 의원이 붙인 코드의 줄(clinic-profile design.md 9절의 7개): 약 줄(병원이 붙인 약 코드)과 소문자가 든 병원 안 코드(C-arm·Sono).
 * 보험 시술·검사 코드 줄은 병원마다 같아 남긴다. 병원 값은 defaults.json에만 두므로(AC-014.7) 코드를 적지 않고 줄 모양으로 고른다. 7개가 맞는지는 clinicMemo.test.ts가 본다
 */
const clinicOwnRow = (code: string, row: MemoCode) => row.k === 'drug' || code !== code.toUpperCase()

/**
 * 중립 기본 문구(clinic-profile AC-6607.3): 다른 병원이 처음 질문 없이 바로 시작하는 값. 원본 기본 문구에서 우리 의원 코드를 빼고,
 * 리도카인 코드 칸은 비우며, 시술별 약은 고른 적이 없어 비어 있고 메모 규칙은 없다. defaultPhrases()·ourClinicPhrases()는 그대로다
 */
export function neutralPhrases(): Phrases {
  const value = defaultPhrases()
  value.CODEMAP = Object.fromEntries(Object.entries(value.CODEMAP).filter(([code, row]) => !clinicOwnRow(code, row)))
  value.TPL.lidoCodes = ''
  value.procedureDrugs = {}
  delete value.memoRules
  return value
}

/** 원본 TPL_DEF.ara. 원본 cartilageLine이 고치지 않은 기본 문구를 알아볼 때 쓴다 */
export const DEFAULT_ARA: string = defaults.TPL.ara
