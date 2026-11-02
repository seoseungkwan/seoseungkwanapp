// 차트 글 읽기(원본 mx999_v22.html 본 스크립트, seoseungkwan/shared@2a1069b). 설정과 상관없는 부분만 모았다. 원본 줄을 그대로 옮겼다.
// 원본 차팅 사전(CHDICT_DEF)은 기본값 그대로 쓴다. 병원이 고치는 칸은 requirements.md에 없다(골든 knownDiffs)

const CHDICT = {
  proc: [
    '후지내측지차단술 = MBB', '내측지차단술 = MBB', '내측지 차단술 = MBB', '내측지차단 = MBB', '내측지 차단 = MBB',
    '견갑상신경차단술 = SSNB', '견갑상신경 차단 = SSNB', '견갑상신경차단 = SSNB',
    '액와신경차단술 = ANB', '액와신경 차단 = ANB', '액와신경차단 = ANB',
    '대퇴신경차단술 = FNB', '대퇴신경 차단 = FNB', '대퇴신경차단 = FNB',
    '좌골신경차단술 = SNB', '좌골신경 차단 = SNB', '좌골신경차단 = SNB',
    '늑간신경차단술 = ICNB', '늑간신경 차단 = ICNB', '늑간신경차단 = ICNB',
    '경신경총차단술 = CPB', '경신경총 차단 = CPB', '경신경총차단 = CPB', '천경신경총차단 = CPB',
    '선택적신경근차단술 = root', '선택적 신경근 차단 = root', '신경근차단술 = root', '신경근 차단 = root', '신경근차단 = root',
    'SNRB = root', 'TFESI = root',
    '경막외신경차단술 = epi', '경막외 신경차단 = epi', '경막외차단 = epi', '경막외 차단 = epi', '경막외주사 = epi', 'epidural = epi',
    '관절강내주사 = IA', '관절강내 주사 = IA', '관절강 내 주사 = IA', '관절내주사 = IA', '관절내 주사 = IA',
    '연골주사 = 아라간', '히알루론산 주사 = 아라간', '히알루론산주사 = 아라간',
    '통증유발점주사 = TPI', '통증유발점 주사 = TPI', 'trigger point injection = TPI', 'TPI = TPI',
  ].join('\n'),
  region: {
    cervical: 'C-spine, C spine, 경부통, 목통증, 목 통증',
    shoulder: '견부, 어깨관절',
    lumbar: 'L-spine, L spine, LS-spine, LBP, 요통, 요천추, 요추부',
    knee: '슬부, 무릎관절',
    ankle: '족근',
    hip: '골반',
    chest: '흉곽, 늑골',
  } as Record<string, string>,
  kind: {
    exam: 'FABER, Patrick, Lachman, drawer, Finkelstein, Thomas test, 이학적, 신경학적',
    img: '',
    rx: '약물치료, 물리치료, NSAID, 진통제, 소염제, 근이완제',
    dx: '골관절염, 관절염, 탈출증, 협착증, 건염, 건병증, 충돌증후군, 오십견, 유착성, 신경근병증, 근막통증',
    subj: '',
    plan: '',
  } as Record<string, string>,
}

const escRe = (s: unknown) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (w: string) => (/^[A-Za-z0-9 .\-/]+$/.test(w) ? `(?<![A-Za-z0-9])${escRe(w)}(?![A-Za-z0-9])` : escRe(w))
const splitWords = (s: string) => String(s || '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean)

const REGION_SRC: [string, string, RegExp][] = [
  ['shoulder', '견관절', /shoulder|shoudler|shouler|sholder|견관절|어깨|SSNB|\bSST\b|impinge|impingm|impingn|frozen|adhesive|rotator|supraspinatus|SLAP|견봉/i],
  ['cervical', '경추부', /\bC-?MBB|\bCPB\b|cervicalgia|cervical|경추|후경부|목이|목은|목을|목\s*주사|HNP\s*C\d|\bC[3-7]\s*-\s*[3-7]\b/i],
  ['lumbar', '요추부', /lumbar|요추|허리|stenosis|HNP\s*L\d|MBB\s*L\d|\bL[1-5]\s*-\s*[S1-5]|S1\s*root|\bepi\b|spondyl/i],
  ['knee', '슬관절', /\bknee\b|슬관절|무릎|MJLT|patella|chondromalacia|chondromlacia|chodromalacia|chondromalcia|meniscus|반월|아라간|KLG|\bPES\b/i],
  ['ankle', '족관절', /\bankle\b|족관절|발목|ATFL|CFL|\bLM\b|외과|distal fibula/i],
  ['elbow', '주관절', /elbow|주관절|팔꿈치|epicondyl|tennis|golfer|radia\s*t/i],
  ['wrist', '수근관절', /wrist|손목|수근|TFCC|ulnar impaction|de\s*quervain/i],
  ['hand', '수부', /\bhand\b|finger|손가락|PIPJ|MCPJ|DIPJ|trigger finger/i],
  ['hip', '고관절', /\bhip\b|고관절|엉덩이|trochanter|GTPS/i],
  ['chest', '늑골부', /\brib\b|늑골|늑간|ICNB|흉부|\bchest\b/i],
  ['foot', '족부', /\bfoot\b|족저|발바닥|plantar|heel|종골/i],
  ['upper', '상지', /액\s*,?\s*액하/],
]

/** 원본 REGION(applyDict 뒤) */
export const REGION: readonly [string, string, RegExp][] = REGION_SRC.map(([k, ko, re]) => {
  const extra = splitWords(CHDICT.region[k] ?? '')
  return [k, ko, extra.length ? new RegExp(`${re.source}|${extra.map(wordRe).join('|')}`, 'i') : re]
})

const DICT_PROC = CHDICT.proc
  .split('\n')
  .map((l) => l.split(/\s*=\s*/))
  .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
  .map(([a, b]) => ({ from: a.trim(), to: b.trim() }))
  .sort((x, y) => y.from.length - x.from.length)
  .map((p) => ({ ...p, re: new RegExp(wordRe(p.from), 'gi') }))

const DICT_KIND = ['img', 'exam', 'rx', 'dx', 'plan', 'subj']
  .map((k) => {
    const ws = splitWords(CHDICT.kind[k] ?? '')
    return ws.length ? { k, re: new RegExp(ws.map(wordRe).join('|'), 'i') } : null
  })
  .filter((x) => x !== null)

function dictKind(t: string): string | null {
  const h = DICT_KIND.find((x) => x.re.test(t))
  return h ? h.k : null
}

/** 원본 normLine: 차트 한 줄을 이 프로그램이 아는 표기로 맞춘다 */
export function normLine(raw: unknown): string {
  let t = String(raw || '')
  t = t.replace(/\(\s*(?:R|Rt|RT|rt|우|우측)\s*\)/g, ' Rt ').replace(/\(\s*(?:L|Lt|LT|lt|좌|좌측)\s*\)/g, ' Lt ')
    .replace(/\(\s*(?:B|both|Both|BOTH|양|양측)\s*\)/g, ' both ')
    .replace(/\b(Rt|Lt)\./g, '$1').replace(/\brt\b/g, 'Rt').replace(/\blt\b/g, 'Lt').replace(/\bBil\.?(?![a-z])/gi, 'both')
  t = t.replace(/\b([CL])(\d)\s*\/\s*(S1|\d)\b/g, '$1$2-$3')
  t = t.replace(/^\s*(x-?ray|xr|mri|ct|sono|us|초음파)\s*(?:상|\)|소견|findings?)\s*[:：]?\s*/i, '$1: ')
  DICT_PROC.forEach((p) => {
    t = t.replace(p.re, ` ${p.to} `)
  })
  return t.replace(/\s{2,}/g, ' ').trim()
}

export const PROC_TAGS: readonly [string, RegExp][] = [
  ['MBB', /MBB/i], ['root', /\broot\b/i], ['SSNB', /SSNB/i], ['ANB', /\bANB\b/i],
  ['FNB', /\bFNB\b/i], ['SNB', /\bSNB\b/i], ['아라간', /아라간/i], ['IA', /\bIA\b/i],
  ['PDNB', /PDNB/i], ['ICNB', /ICNB/i], ['CPB', /\bCPB\b/i], ['MRU', /\bMRU\b/i], ['액하', /액\s*,?\s*액하/],
]

export const RX_IMG = /^\s*(xr|x-?ray|us|sono|초음파|mri|ct)\s*[:：]/i
const RX_EXAM = /(neer|hawkin|jobe|empty\s*can|drop\s*arm|painful\s*arc|speed|yergason|spurling|SLR|lasegue|mcmurray|tinel|phalen|MJLT|\bTd\s*\(|\bsw\s*\(|\bROM\b|\bMMT\b|\bVAS\b|\bNRS\b|\bUB\s*\(|\brad\s*\(|\bFF\s*\d|\bIR\s*[LT]?\s*\d|\bER\s*\d|\bABD\s*\d|압통|가동범위)/i
export const RX_PROC = /(MBB|SSNB|\bANB\b|PDNB|ICNB|\bCPB\b|\bMRU\b|\bFNB\b|\bSNB\b|\bIA\b|\broot\b|\bepi\b|ESWT|\bTPI\b|trigger point|\bDNA\b|prolo|아라간|액하|액,\s*액하|신경차단|차단술)/i
const RX_PLAN = /(f\/u|재내원|주\s*뒤|주뒤|일\s*뒤|일뒤|내일|모레|다음\s*주|담주|[월화수목금토일]요일|\d\s*차\s*주사|예정|합니다|할\s*께요|할\s*게요|하겠|드릴|드립니다|경과관찰|경과 봅|고려|생각|가능성|하기로)/
const RX_RX = /^\s*(med|메드|약|PT|pt|물치|견인|s\/o|stitch|dressing|드레싱|M\s*splint|splint|PTD|POD|자보|도수|재활)\b/i
const RX_DX = /(HNP|stenosis|\bOA\b|impinge|impingm|impingn|fracture|\bfx\b|tear|tendinitis|tendinosis|bursitis|sprain|strain|contusion|syndrome|chondromalacia|neuralgia|cervicalgia|frozen|adhesive|avulsion|arthritis|myofascial|radiculopathy|epicondyl|plantar|trigger finger|열상|염좌|골절)/i

/** 원본 lineKind(사전 낱말을 보는 덧씌우기는 engine에 있다) */
export function lineKindOf(t: string, hint: string | null): string {
  if (hint) {
    if (RX_IMG.test(t) || dictKind(t) === 'img') return 'img'
    if (hint === 'subj') return 'subj'
    if (hint === 'exam') return 'exam'
    if (hint === 'dx') return 'dx'
    if (hint === 'plan') {
      if (RX_PLAN.test(t) && !RX_PROC.test(t)) return 'plan'
      if (RX_PROC.test(t)) return RX_PLAN.test(t) ? 'plan' : 'proc'
      if (RX_RX.test(t) || dictKind(t) === 'rx') return 'rx'
      return 'plan'
    }
  }
  if (dictKind(t) === 'img') return 'img'
  if (RX_IMG.test(t)) return 'img'
  if (RX_RX.test(t) && !RX_PROC.test(t)) return 'rx'
  if (RX_PLAN.test(t) && !RX_IMG.test(t)) return 'plan'
  if (RX_PROC.test(t)) return 'proc'
  const dk = dictKind(t)
  if (dk && dk !== 'img') return dk
  if (RX_EXAM.test(t)) return 'exam'
  if (RX_DX.test(t)) return 'dx'
  if (/^[A-Za-z]/.test(t)) return 'dx'
  return 'subj'
}

/** 원본 regionOf + 리뷰 안전 덧씌우기 */
export function regionOf(value: string): string | null {
  for (const [k, , re] of REGION) if (re.test(value)) return k
  const text = String(value ?? '')
  if (/\b(?:C-?MBB\b|MBB\s+C\s*\d)/i.test(text)) return 'cervical'
  if (/\b(?:L-?MBB\b|MBB\s+L\s*\d)/i.test(text)) return 'lumbar'
  if (/\bneck\s+pain\b|\bposterior\s+neck\b/i.test(text)) return 'cervical'
  return null
}

export function sideOf(t: string): string | null {
  if (/\b(both|Both|BOTH)\b|양측|양쪽|^\s*양\s|\s양\s/.test(t)) return '양측'
  if (/\bRt\b|\bright\b|우측|오른/i.test(t)) return '우측'
  if (/\bLt\b|\bleft\b|좌측|왼/i.test(t)) return '좌측'
  return null
}

/** 한 줄에 여러 부위 시술이 섞여 있음: "Rt SSNB ANB + C-MBB 4,5,6 Rt" */
function splitTop(t: string): string[] {
  const out: string[] = []
  let cur = ''
  let d = 0
  for (const ch of String(t)) {
    if (ch === '(' || ch === '[') d++
    else if (ch === ')' || ch === ']') d = Math.max(0, d - 1)
    if (ch === '+' && d === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

export function splitProc(t: string): { t: string; rg: string | null; sd: string | null }[] {
  const whole = regionOf(t)
  const wside = sideOf(t)
  const parts = splitTop(t)
  return parts
    .map((s) => ({ t: s, rg: regionOf(s) || null, sd: sideOf(s) || wside }))
    .map((s) => ({ ...s, rg: s.rg || (parts.length === 1 ? whole : null) }))
}

const IMGMAP: [RegExp, string][] = [
  [/\bNR\b/g, '추간판 간격 협소'],
  [/\bn-?s(\s+of\s+[A-Za-z가-힣]+)?/gi, '특이소견 없음'],
  [/\bNIC\b/g, '이전과 비교하여 변화 없음'],
  [/no\s*def\.?\s*fx\.?/gi, '명백한 골절선 관찰되지 않음'],
  [/no\s*def\.?\s*OA/gi, '명백한 퇴행성 변화 없음'],
  [/no\s*OA\s*progression/gi, '퇴행성 변화 진행 없음'],
  [/no\s*further\s*displac\w*/gi, '추가 전위 없음'],
  [/union\s*progression/gi, '골유합 진행 중'],
  [/almost\s*union/gi, '골유합 거의 완성'],
  [/callus\s*\(\+\)/gi, '가골 형성 관찰됨'],
  [/reduction\s*유지중/gi, '정복 상태 유지 중'],
  [/OA\s*change/gi, '퇴행성 변화'],
  [/ulnar\s*plus/gi, '척골 양성 변이'],
  [/multiple\s*stenosis/gi, '다분절 협착 소견'],
]

export function imgKo(s: string): string {
  let t = s.replace(RX_IMG, '').trim().replace(/^[,\s]+/, '')
  IMGMAP.forEach(([a, b]) => {
    t = t.replace(a, b)
  })
  return t.replace(/\s*\bof\b\s+[A-Za-z가-힣\s&,./]+$/i, '').trim()
}

/** KL grade: "OA knee both(KLG3/1)", "(KLG 1/1)", 오타 "(KLG3/.1)" 대응 */
export function klOf(t: string): string | null {
  const m = t.match(/KLG?\s*\(?\s*(\d)\s*\/\s*\.?\s*(\d)/i)
  if (m) return `KLG ${m[1]}/${m[2]}`
  const s = t.match(/KLG?\s*\(?\s*(\d)\b(?!\s*\/)/i)
  return s ? `KLG ${s[1]}` : null
}

export const RX_NONBEN = /(\bDNA\b|ESWT|체외충격파|충격파|prolo|프롤로|PDRN|도수|크라이오|cryo)/i

export function expandAek(t: string): string {
  return t.replace(/(both|Rt|Lt|양측|양쪽)\s*(?=액\s*[,，]?\s*액하)/gi, '$1 ')
    .replace(/액\s*[,，]?\s*액하/g, 'ANB, MRU')
    .replace(/\s{2,}/g, ' ').trim()
}

export const RX_ALIAS: Record<string, string> = { 아라간: 'IA', root: 'SNB' }
const alias = (name: string) => (Object.hasOwn(RX_ALIAS, name) ? RX_ALIAS[name] : name)

export function segProcNames(t: string): string[] {
  const out: string[] = []
  PROC_TAGS.forEach(([n, rex]) => {
    if (n !== '액하' && rex.test(t)) out.push(alias(n))
  })
  if (/아라간/.test(t)) out.push('IA')
  return [...new Set(out)]
}

export const PCODE = /^(SSNB|ANB|MRU|FNB|SNB|PDNB|ICNB|CPB|IA)$/i
export const SIDE_TOK = /^(both|Both|BOTH|Rt|RT|Lt|LT|양측|우측|좌측)$/

/** 원본 filterByRx(처방에 없는 시술 토큰을 걸러냄). 레벨 시술을 살리는 덧씌우기는 engine에 있다 */
export function filterByRxOriginal(t: string, rxNames: Set<string>): string {
  const names = segProcNames(t)
  if (!names.length) return ''
  if (names.some((n) => rxNames.has(n))) {
    const toks = t.trim().split(/\s+/)
    const isPair =
      toks.length >= 2 &&
      toks.length % 2 === 0 &&
      toks.filter((_, i) => i % 2 === 1).every((x) => PCODE.test(x)) &&
      toks.filter((_, i) => i % 2 === 0).every((x) => /^(both|Both|BOTH|Rt|RT|Lt|LT)$/.test(x))
    if (isPair) {
      const keep: string[] = []
      for (let i = 0; i < toks.length; i += 2) {
        const nm = alias(toks[i + 1]).toUpperCase()
        if ([...rxNames].some((r) => r.toUpperCase() === nm)) keep.push(toks[i], toks[i + 1])
      }
      return keep.join(' ')
    }
    return t
  }
  return ''
}

/** "both ANB, MRU" → "both ANB both MRU" : 좌우 표기를 시술마다 반복 */
export function distSide(t: string): string {
  let side: string | null = null
  let body = t
  let m = body.match(/^\s*(both|Both|BOTH|Rt|RT|Lt|LT)\s+/)
  if (m) {
    side = m[1]
    body = body.slice(m[0].length)
  } else {
    m = body.match(/\s+(both|Both|BOTH|Rt|RT|Lt|LT)\s*$/)
    if (m) {
      side = m[1]
      body = body.slice(0, m.index)
    }
  }
  if (!side) return t
  const toks = body.trim().split(/[\s,，]+/).filter(Boolean)
  if (toks.length < 2 || !toks.every((x) => PCODE.test(x))) return t
  return toks.map((c) => `${side} ${c}`).join(' ')
}

export function stripNonBen(t: string): string {
  return t.replace(/\s*\(\s*(DNA|PDRN|prolo|프롤로)\s*\d*\s*차?\s*\)/gi, '').replace(/\s{2,}/g, ' ').trim()
}

const DXKO: [RegExp, string][] = [
  [/impinge\w*\s*shou\w*|impingm\w*|impingn\w*/i, '견관절 충돌증후군'],
  [/frozen\s*shoulder|adhesive\s*capsulitis/i, '유착성 관절낭염'],
  [/rotator\s*cuff\s*tear/i, '회전근개 파열'],
  [/HNP\s*C[\d\-,S]*/i, '경추 추간판탈출증'],
  [/HNP\s*L[\d\-,S]*/i, '요추 추간판탈출증'],
  [/spinal\s*stenosis/i, '척추관협착증'],
  [/cervicalgia/i, '경부통'],
  [/PF\s*chondroml?al?ac\w*|chondromalacia\s*patella/i, '슬개대퇴 연골연화증'],
  [/OA\s*knee/i, '슬관절 골관절염'],
  [/OA\s*hand/i, '수부 골관절염'],
  [/patella\s*tendinitis/i, '슬개건염'],
  [/PES\s*tendi\w*/i, '거위발건염'],
  [/meniscus\s*tear/i, '반월상연골 파열'],
  [/fracture\s*rib|rib\s*fx/i, '늑골 골절'],
  [/tennis\s*elbow|lateral\s*epicondyl\w*/i, '외측상과염'],
  [/golfer\w*\s*elbow|medial\s*epicondyl\w*/i, '내측상과염'],
  [/radia\w*\s*T\s*elbow|radial\s*tunnel/i, '요골터널증후군'],
  [/ulnar\s*impaction/i, '척골충돌증후군'],
  [/ganglion\s*cyst/i, '결절종'],
  [/de\s*quervain|deq\b/i, '드퀘르뱅 건초염'],
  [/trigger\s*finger/i, '방아쇠수지'],
  [/TFCC/i, '삼각섬유연골복합체 손상'],
  [/arthralgia/i, '관절통'],
  [/contusion/i, '타박상'],
  [/sprain/i, '염좌'],
  [/ATFL[\w\s]*tear/i, '전거비인대 파열'],
  [/CFL[\w\s]*avulsion/i, '종비인대 견열골절'],
  [/myofascial/i, '근막통증증후군'],
  [/plantar\s*fasciitis/i, '족저근막염'],
  [/bursitis/i, '점액낭염'],
  [/tendinitis|tendinosis|tendintiis/i, '건염'],
]

export function dxKo(t: string): string | null {
  for (const [re, ko] of DXKO) if (re.test(t)) return ko
  return null
}

/** 증상 기간: "한달전부터", "2주전부터", "3일전" */
export function durOf(lines: string[]): string | null {
  for (const t of lines) {
    let m = t.match(/(\d+)\s*(년|개월|달|주|일)\s*(전|째|정도)/)
    if (m) return `${m[1]}${m[2] === '달' ? '개월' : m[2]} 전부터`
    m = t.match(/(한|두|세|네|몇)\s*(년|개월|달|주|일)\s*(전|째)/)
    if (m) return `${m[1]} ${m[2] === '개월' ? '달' : m[2]} 전부터`
  }
  return null
}

export function imgSrc(s: string): string {
  const m = s.match(RX_IMG)
  if (!m) return '영상'
  const k = m[1].toLowerCase()
  return /mri/.test(k) ? 'MRI' : /ct/.test(k) ? 'CT' : /us|sono|초음파/.test(k) ? '초음파' : 'X-ray'
}

/** 시술 줄의 한글 좌우는 영문으로, 부위 낱말은 빼기 */
const KO_RG_WORDS = /(^|\s)(?:요추부?|경추부?|흉추부?|요천추|무릎|어깨|슬관절|견관절|족관절|발목|손목|수근관절|팔꿈치|주관절|고관절|허리|목|부위|시행함?|실시)(?=\s|$|[,.])/g
export function cleanKo(t: string): string {
  if (!/[가-힣]/.test(t || '') || /아라간|액/.test(t)) return t
  return String(t).replace(/우측|오른쪽/g, 'Rt').replace(/좌측|왼쪽/g, 'Lt').replace(/양측|양쪽/g, 'both')
    .replace(KO_RG_WORDS, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim()
}

const SIDE_MAP: Record<string, string> = { rt: 'Rt', right: 'Rt', 우측: 'Rt', lt: 'Lt', left: 'Lt', 좌측: 'Lt', both: 'both', bilateral: 'both', 양측: 'both', 양쪽: 'both' }
export function sideKey(value: unknown): string {
  const keys = [...new Set((String(value || '').match(/\b(?:Rt|Lt|both|right|left|bilateral)\b|우측|좌측|양측|양쪽/gi) || []).map((w) => SIDE_MAP[w.toLowerCase()] || SIDE_MAP[w]))]
  return keys.length === 1 ? keys[0] : ''
}

/** 날짜 차이(날수). 원본 dayDiff는 YYYYMMDD, 우리는 YYYY-MM-DD다 */
export function dayDiff(a: string, b: string): number {
  const D = (x: string) => new Date(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)).getTime()
  return Math.round((D(b) - D(a)) / 86400000)
}

export const RG_EN: Record<string, string> = { knee: 'knee', shoulder: 'shoulder', ankle: 'ankle', elbow: 'elbow', wrist: 'wrist', hand: 'hand', hip: 'hip', foot: 'foot', chest: 'chest', lumbar: 'lumbar', cervical: 'neck', upper: 'arm' }
export const SIDE_EN: Record<string, string> = { 우측: 'Rt', 좌측: 'Lt', 양측: 'Both' }
export const FINGER_RE: readonly [RegExp, string][] = [
  [/\b(?:1st|first)\s*finger|\bthumb\b|엄지|무지|\bF1\b|1\s*지/i, 'thumb'],
  [/\b(?:2nd|second)\s*finger|\bindex\b|검지|\bF2\b|2\s*지/i, '2nd finger'],
  [/\b(?:3rd|third)\s*finger|\bmiddle\s*finger|중지|\bF3\b|3\s*지/i, '3rd finger'],
  [/\b(?:4th|fourth)\s*finger|\bring\s*finger|약지|환지|\bF4\b|4\s*지/i, '4th finger'],
  [/\b(?:5th|fifth)\s*finger|\blittle\s*finger|소지|\bF5\b|5\s*지/i, '5th finger'],
]

const NO_DEF_FX = /\bno\s*(?:def(?:inite)?\.?|definite)\s*(?:fx|fracture|골절)/i

/** 늑골 골절 — "우측 늑골 1개 골절" */
export function fxOf(items: readonly { t: string; raw?: string }[]): string {
  const all = items.map((i) => i.raw || i.t)
  if (all.some((t) => NO_DEF_FX.test(t))) return 'no def. fx'
  const ls = all.filter((t) => /골절|\bfx\b|fracture/i.test(t) && /늑골|\brib/i.test(t)).filter((t) => !/\(\s*-\s*\)|없음|\bno\b|r\/o/i.test(t))
  if (!ls.length) return ''
  const ko = ls.map((t) => t.match(/(?:우측|좌측|양측)?\s*늑골\s*\d+\s*개\s*골절/)).find(Boolean)
  if (ko) return ko[0].trim()
  const t = ls[0]
  const sd = sideOf(t)
  let n: number | null = null
  const cnt = t.match(/(\d+)\s*개/)
  if (cnt) n = +cnt[1]
  else {
    const rng = t.match(/(\d+)(?:st|nd|rd|th)?\s*[-~]\s*(\d+)(?:st|nd|rd|th)?/)
    if (rng && +rng[2] > +rng[1] && +rng[2] <= 12) n = +rng[2] - +rng[1] + 1
    else {
      const nums = t.match(/\d+(?:st|nd|rd|th)|#\s*\d+/gi) || []
      const list = t.match(/(\d+)(?:\s*,\s*\d+)+/)
      n = list ? list[0].split(',').length : nums.length || null
    }
  }
  return `${sd ? `${sd} ` : ''}늑골 ${n ? `${n}개 ` : ''}골절`
}

export const reEsc = (s: unknown) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const codeSet = (value: unknown) => new Set(String(value || '').toUpperCase().split(/[\s,]+/).filter(Boolean))
export const SIDE_STYLES: Record<string, Record<string, string>> = {
  upper: { rt: 'RT', lt: 'LT', both: 'BOTH' },
  dot: { rt: 'Rt.', lt: 'Lt.', both: 'Both' },
  bil: { rt: 'Rt', lt: 'Lt', both: 'Bil' },
  ko: { rt: '우측', lt: '좌측', both: '양측' },
  koShort: { rt: '우', lt: '좌', both: '양' },
}
