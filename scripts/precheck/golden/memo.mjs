#!/usr/bin/env node
// 청구메모 글 골든(TASK-14, AC-014.1·014.2·014.4·014.5·014.6·014.7·014.12). 가짜 자료를 원본에 넣어 돌린 결과를 적는다.
//   node scripts/precheck/golden/memo.mjs --src "$YANGJI_SRC" [--fake fixtures/precheck/fake] [--out fixtures/precheck/golden]
// 표 줄 → 원본 전역 값은 원본 함수로 만든다: 83 → build · 47 → parseRx. 그 뒤 applyRx·computeIntervals를 원본 흐름대로 돌린다. 우리 코드는 한 줄도 돌지 않는다
// 사전은 원본 기본 CODEMAP이다(병원 모드를 켜지 않는다). 처방 목록(catalog)은 보지 않는다: 메모는 설정의 CODEMAP만 읽는다(AC-014.7)
// 만드는 것: memo-text.json · memo-full-default.json · memo-full-v1-v18.json · memo-full-dx-check.json · memo-full-settings.json · memo-dictionary.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILE, SOURCE, args, lines, loadOriginal } from './original.mjs'

const AMBIGUOUS = '시술 종류가 둘 이상인 날의 주사약(design.md 19-4, AC-014.10, 2026-11-01 사용자 결정): 원본은 약을 줄에 그대로 쓰거나(기본 사전) 비우고 검토로 돌린다(ambiguousDrug). 우리는 어느 시술 약인지 모르므로 넣지 않고 [약 확인: 약 이름]을 남긴다. 모든 시술에서 빼기면 뺀다'
const CARTILAGE = '시술 종류가 둘 이상인 날의 연골주사 줄(design.md 19-4, AC-014.10, 2026-11-01 사용자 결정): 원본 cartilageLine은 이런 날에도 연골주사 줄을 쓴다. 우리는 쓰지 않고 [약 확인: 약 이름]을 남긴다. K-L grade 줄은 약 글이 아니라 그대로 둔다'
const IA_REGION = 'IA 줄 부위(memo-settings AC-3001.1, 2026-11-08 사용자 결정): 원본 iaLines는 어깨·무릎만 부위로 읽어 발목·고관절·팔꿈치·손목 IA를 [부위 확인]으로 쓴다. 우리는 관절 부위(어깨·무릎·발목·팔꿈치·손목·고관절·손·발)를 영어 이름으로 쓴다. 가짜 자료의 IA는 어깨·무릎뿐이라 글이 같다'
const ARA_ETC_IA = '연골주사 날의 일반 약(memo-settings AC-3001.2·3001.3): 원본은 연골주사 날 연골주사 줄만 써서 넣기인 트리암·덱사가 표시 없이 사라진다. 우리는 아라간이 아닌 IA 차트 줄이 있으면 그 부위로 일반 IA 줄(iaEtc)을 하나 더 쓰고(KK090 수량은 연골주사와 나눠 양측 근거로 보지 않는다), 없으면 [약 확인: 약 이름]을 남긴다. 가짜 자료의 연골주사 날에는 일반 약이 없어 글이 같다'
const KNOWN_DIFFS = [
  { where: 'ambiguousDrug', why: AMBIGUOUS },
  { where: 'cartilageLine', why: CARTILAGE },
  { where: 'iaRegion', why: IA_REGION },
  { where: 'araEtcIa', why: ARA_ETC_IA },
  { where: 'drugTxt·iaLines 약 고르기', why: '원본은 약 이름 글자(리도카인·ARA_RE)·코드 표(DRUG_EN)·TPL.drugLocal로 고른다. 우리는 procedureDrugs만 본다(AC-014.7·014.9). 우리 병원 값은 같은 글이 나오게 채웠다(시술 종류가 하나인 날은 이 골든이 같음을 본다)' },
  { where: '넣기인데 틀에 {약제}가 없을 때', why: '원본은 {약제}가 없는 틀이면 약을 쓰지 않는다. 우리는 넣기를 고른 약을 첫 시술 줄의 {시술} 바로 뒤에 쓴다(AC-014.9 고른 자리에 넣는다). 연골주사 날만 원본처럼 {약제}가 없으면 쓰지 않는다. 우리 병원 값은 {약제}가 있는 틀의 시술만 넣기라 글이 같다. 원본에 없는 자리 afterEnding·ownLine(◈약: 이름)도 원본 결과와 견줄 수 없어 drugs.test.ts가 본다' },
  { where: '연골주사약 안 정함', why: '원본에는 없는 설정이다. 시술 종류가 하나인 날에도 안 정했으면 연골주사 줄 대신 [약 확인]을 남긴다(AC-014.9: 안 정한 약은 넣거나 빼지 않고 표시를 남긴다. 연골주사약도 같다). 빼기는 약 이름만 빼는 값이고 연골주사 줄은 시술 줄이라 원본처럼 쓴다(clinic-memo-samples.md 보기 1: 연골주사약 처음 값이 빼기여도 그 줄이 있다). 우리 병원 값은 KK090에서 넣기라 원본과 같다' },
  { where: '연골주사약 빼기와 틀의 {약제}', why: '원본 cartilageVars는 늘 {약제}에 약 이름을 채운다. 우리는 빼기인 연골주사약이면 줄은 쓰고 {약제}만 비운다(AC-014.9: 빼기인 약은 뺀다). 우리 병원 값은 기본 틀에 {약제}가 없어 글이 같다. 원본에 없는 값이라 원본 결과와 견줄 수 없어 drugs.test.ts가 본다' },
  { where: 'isCartilageDrug A49', why: '원본은 A49라는 코드 글자로도 연골주사약을 알아본다. 병원 값이라 뺐다(AC-014.7). 기본 사전의 A49 이름이 아라간이라 결과는 같다. 사전에서 A49 이름을 바꾼 병원만 CODEMAP.cartilage로 정해야 한다' },
  { where: '병원 모드(TPL.__catalog)', why: '옮기지 않았다: cm의 대기 줄·약 이름 역할, 병원 모드 drugTxt·iaKind·iaLines·noteLines·rxLines. 메모는 설정 CODEMAP으로만 돈다. __catalog를 넣는 곳이 아직 없다(가입 질문 명세 때 다시 본다)' },
  { where: '옛 좌우 규칙(sideRuleVersion 1)', why: '메모 엔진에는 옮기지 않았다. validatePhrases가 먼저 2로 바꾸므로 오지 않는다(AC-014.3)' },
  { where: '차팅 사전(CHDICT) 고치기', why: '원본은 병원이 고칠 수 있다. 그 칸이 requirements.md에 없어 원본 기본값으로 고정했다' },
  { where: '상세 모드·AI·부위별 고친 메모(edits[부위])', why: '원본 LEVEL은 늘 0이라 상세 문장은 돌지 않는다. 고친 메모는 진료 전체 글 하나로만 받는다(원본 payloadOf)' },
]

/**
 * 일부러 원본과 다른 진료(우리 병원 설정 기준). ours는 약 규칙 표(design.md 19-4)대로 손으로 적은 글이다.
 * 여기 없는 진료는 원본과 글자까지 같아야 한다. 있는데 같으면 golden.test.ts가 실패한다
 */
const REASON_2 = '환자 스케쥴상 주1회 내원 밖에 안되어 당일 주사치료 2부위 시행함. 환자 증상 호소 심해 치료 요하는 상태임'
const DIFF_CASES = {
  'claim-month-memo.json': [
    { id: 'k01', where: 'ambiguousDrug', ours: `◈SSNB\n\n◈IA injection of - shoulder\n[약 확인: 트리암]\n\n${REASON_2}` },
    { id: 'k02', where: 'cartilageLine', ours: `◈SSNB\n[약 확인: 아라간]\n\n${REASON_2}` },
    { id: 'k03', where: 'ambiguousDrug', ours: '◈FNB\n◈SNB\n[약 확인: 트리암]' },
    { id: 'k04', where: 'cartilageLine', ours: `◈SSNB\n[약 확인: 아라간]\n\n${REASON_2}` },
    { id: 'k05', where: 'ambiguousDrug', ours: `◈MBB L4,5 Rt\n◈3rd finger 건초내주사 시행\n[약 확인: 덱사]\n\n${REASON_2}` },
  ],
  'claim-month-rules-v1-v18.json': [],
  'claim-month-dx-check.json': [],
}

const PART_KEYS = ['rg', 'ko', 'side', 'headTxt', 'examTxt', 'procTxt', 'procList', 'cpbTxt', 'snbSide', 'snbSeg', 'dropped', 'klTxt', 'araV', 'rxQty', 'icnbSide', 'kl1', 'kl2', 'dxKo', 'dur', 'imgTxt']

const table = (columns, rows) => [columns, ...rows.map((row) => columns.map((c) => row[c] ?? ''))]
const S83 = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const S47 = ['처방코드', '처방명칭', '차트번호', '처방일자', '급여구분', '수량']
const dashed = (date) => (date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date)
const BLANK_DICTIONARY = { schema: 1, aliases: [], omissions: { dropRootEpi: false, dropShoulderAnbWithCervicalMbb: false }, repeatRules: [], closedWeekdays: [], closedDates: [], copyColumns: ['name'] }

const options = args({ fake: 'fixtures/precheck/fake', out: 'fixtures/precheck/golden' })
const O = loadOriginal(options.src)
const { ctx, run } = O
const readFake = (file) => JSON.parse(readFileSync(join(options.fake, file), 'utf-8'))

/** 원본 흐름: 처방 표 → 증상 표(analyze) → applyRx → computeIntervals. 설정은 원본 기본값 위에 patch를 얹는다 */
function load(json, { tpl = {}, codemap = {}, dictionary = null } = {}) {
  ctx.__S83 = table(S83, json.s83)
  ctx.__S47 = table(S47, json.s47)
  ctx.__tpl = JSON.stringify(tpl)
  ctx.__codemap = JSON.stringify(codemap)
  ctx.__setDictionary(dictionary ? { ...BLANK_DICTIONARY, ...dictionary } : BLANK_DICTIONARY)
  run(`TPL=JSON.parse(JSON.stringify(TPL_DEF));Object.assign(TPL,JSON.parse(__tpl));
    CODEMAP=JSON.parse(JSON.stringify(CODEMAP_DEF));Object.assign(CODEMAP,JSON.parse(__codemap));
    Object.keys(edits).forEach(k=>delete edits[k]);
    RXDATA=parseRx(__S47,true).data;VISITS=build(__S83,true);applyRx(false);computeIntervals();`)
}

const eachVisit = (body) => JSON.parse(run(`JSON.stringify(VISITS.map(${body}))`))

function readParts() {
  ctx.__partKeys = PART_KEYS
  return eachVisit(`v=>({id:v.id,memos:v.memos.map(m=>({rg:m.rg,parts:Object.fromEntries(__partKeys.map(k=>[k,m[k]===undefined?null:m[k]])),text:memoText(v,m)}))})`)
}

function readFull() {
  return eachVisit(`v=>({id:v.id,fullText:fullText(v),memos:v.memos.map(m=>m.rg),rxLines:rxLines(v),iaLines:iaLines(v),noteLines:noteLines(v),patientLines:patientLines(v),
    rxAdd:(v.rxAdd||[]).map(a=>({name:a.name,rg:a.rg??null,code:a.code,qty:a.qty??null})),rxNames:v.rxNames?[...v.rxNames]:null,rxQty:v.rxQty?{...v.rxQty}:null,
    shortItv:v.shortItv?{nm:v.shortItv.nm,code:v.shortItv.code,d:v.shortItv.d,prev:v.shortItv.prev,src:v.shortItv.src,lim:v.shortItv.lim,steroid:v.shortItv.steroid,exact:v.shortItv.exact}:null})`).map((v) => ({
    ...v,
    shortItv: v.shortItv ? { ...v.shortItv, prev: dashed(v.shortItv.prev) } : null,
  }))
}

const write = (name, value) => {
  writeFileSync(join(options.out, name), `${lines(value)}\n`)
  console.log(name)
}
const head = (entry, fake) => ({ source: SOURCE, file: FILE, fileSha256: O.fileSha256, entry, fake, knownDiffs: KNOWN_DIFFS })

mkdirSync(options.out, { recursive: true })

// ── 부위 메모 문장·말 채우기 ─────────────────────────────

const FILL = [
  ['{좌우} {시술}', { 좌우: 'Rt', 시술: 'SSNB' }],
  ['{한글방향} {영문방향}', { 좌우: 'both' }],
  ['{한글방향} {영문방향}', { 좌우: '우측' }],
  ['{한글방향} {영문방향}', { 좌우: 'left' }],
  ['{한글방향}{영문방향}', { 좌우: 'Rt Lt' }],
  ['{레벨}', { 레벨: '4,5' }],
  ['{부위} {시술} {약제}', { 부위: 'knee', 시술: 'IA', 약제: '(triam)' }],
  ['{KLG} {검사} {기간} {진단} {영상}', { KLG: '(KLG 3/3)', 검사: ', Neer(+)', 기간: '2주 전부터', 진단: '건염', 영상: ' X-ray상 이상 없음.' }],
  ['{레벨} {부위} {약제} {KLG} {검사} {기간} {진단} {영상}', {}],
  ['{회차}회차 {KL1}/{KL2} {투여량} {코드} {처방명} {표기} {골절}', {}],
  ['{회차}회차 {KL1}/{KL2} {투여량} {코드} {처방명} {표기} {골절}', { 회차: '2', KL1: '3', KL2: '1', 투여량: 1.5, 코드: 'KK090', 처방명: '가상', 표기: 'IA', 골절: 'x' }],
  ['{모르는말} {시술}', { 시술: 'MBB' }],
  ['{모르는말}', {}],
  ['{C-arm} {Sono} {시행함}', {}],
  ['{시술}  ,  .  (  ) 끝', { 시술: 'MBB' }],
  ['{시술} , . ( ) 끝', { 시술: 'MBB' }],
  ['{시술} ( {약제} ), .', { 시술: 'MBB' }],
  ['값 없음', {}],
  ['', {}],
  ['{시술}{시술}', { 시술: null }],
]

const UNRESOLVED = ['', '◈MBB L4,5 both', '[부위 확인] aspiration', 'MBB [좌우 미확인]', '[회차 미정]', '[처방 누락] 있음', '{항목} 남음', '[약 확인: 트리암]', '[참고] 끝', '[확인]', '{}', '{ }', '[확인\n]', '{a\nb}', '[]', '[ 확인 ]', '끝 ]확인[']

const memoFake = readFake('claim-month-memo.json')
load(memoFake)
const fill = FILL.map(([tpl, vars]) => ({ tpl, vars, out: O.call('fill', tpl, vars) }))
run(`__probe={id:'probe'}`)
const unresolved = UNRESOLVED.map((memo) => {
  ctx.__memo = memo
  return { memo, out: run(`edits[allKey(__probe)]=__memo;NEW_MEDICORE_CLAIM_REVIEW_SAFETY.unfinished(__probe)`) }
})
run(`delete edits[allKey(__probe)]`)
const SAVED = [
  ['m26', '◈SSNB'],
  ['m26', '◈SSNB\n\n환자 스케쥴상 주1회 내원 밖에 안되어 당일 주사치료 2부위 시행함. 환자 증상 호소 심해 치료 요하는 상태임'],
  ['m26', '◈SSNB 환자  스케쥴상  주1회 내원 밖에 안되어 당일 주사치료 2부위 시행함.  환자 증상 호소 심해 치료 요하는 상태임 끝'],
  ['m61', '◈고친 글'],
  ['m61', '◈고친 글\n환자 스케쥴상 다른 날 내원이 어려워 금일 주사시행.'],
  ['m05', '◈고친 글'],
  ['m87', '◈고친 글'],
]
const saved = SAVED.map(([id, memo]) => {
  ctx.__id = id
  ctx.__memo = memo
  const missing = JSON.parse(run(`(()=>{const v=VISITS.find(x=>x.id===__id);edits[allKey(v)]=__memo;const out=savedMemoMissing(v);delete edits[allKey(v)];return JSON.stringify(out);})()`))
  return { id, saved: memo, missing }
})
write('memo-text.json', { ...head('buildMemo·compose·fill·memoText·savedMemoMissing·unresolved(스크립트를 끝까지 돌린 뒤)', 'claim-month-memo.json'), fill, visits: readParts(), unresolved, saved })

// ── fullText: 원본 기본 문구 ─────────────────────────────

const PARTS = (() => {
  const set = (patch) => {
    ctx.__tpl = JSON.stringify(patch)
    run('TPL=JSON.parse(JSON.stringify(TPL_DEF));Object.assign(TPL,JSON.parse(__tpl));')
  }
  const formatLevels = []
  for (const levelSep of ['comma', 'dash', 'repeat']) {
    set({ levelSep })
    for (const input of ['◈MBB L4,5,S1 both', '◈MBB C 4,5,6 Rt\n◈SSNB 1,2', 'L4, 5 그냥 글', '◈MBB T10,11 both', '◈SNRB(root) L4,S1', '◈ICNB 3,4']) {
      ctx.__input = input
      formatLevels.push({ levelSep, input, out: run('NEW_MEDICORE_CLAIM_REVIEW_SAFETY.formatLevels(__input)') })
    }
  }
  const styleSides = []
  for (const sideStyle of ['Rt', 'upper', 'dot', 'bil', 'ko', 'koShort']) {
    set({ sideStyle })
    for (const input of ['◈MBB L4,5 both', '◈Rt. SSNB, Lt ANB', 'BOTH shoulder', 'RtLt 붙음', '우측 그대로']) styleSides.push({ sideStyle, input, out: O.call('styleSides', input) })
  }
  const oneLine = []
  for (const mark of ['◈', '', '※']) {
    set({ mark })
    for (const input of ['◈MBB\n◈SSNB', '※MBB\n\n사유 문장.', 'MBB', '', '사유 하나.\n사유 둘。']) oneLine.push({ mark, input, out: O.call('oneLineMemo', input) })
  }
  const lineKey = []
  for (const mark of ['◈', '', '※']) {
    set({ mark })
    for (const input of ['◈ MBB  L4,5.', 'mbb l4,5', '※ MBB', ' ◈ ※ Mbb。', '']) lineKey.push({ mark, input, out: run(`lineKey(${JSON.stringify(input)})`) })
  }
  const gapify = ['◈MBB\n\n사유', ''].map((input) => ({ input, out: O.call('gapify', input) }))
  return { formatLevels, styleSides, oneLine, lineKey, gapify }
})()

const fullEntry = 'fullText·fullTextBody·rxLines·iaLines·noteLines·patientLines·applyRx·computeIntervals(스크립트를 끝까지 돌린 뒤)'
function fullGolden(file) {
  const json = readFake(file)
  load(json)
  const visits = readFull()
  const byId = new Map(visits.map((v) => [v.id, v.fullText]))
  const knownDiffCases = DIFF_CASES[file].map((c) => ({ ...c, original: byId.get(c.id) }))
  return { ...head(fullEntry, file), visits, knownDiffCases, parts: PARTS }
}
write('memo-full-default.json', fullGolden('claim-month-memo.json'))
write('memo-full-v1-v18.json', fullGolden('claim-month-rules-v1-v18.json'))
write('memo-full-dx-check.json', fullGolden('claim-month-dx-check.json'))

// ── 설정을 바꾼 글 ─────────────────────────────────────

const SKIP_DRUGS = DIFF_CASES['claim-month-memo.json'].map((c) => c.id)
const ALL_INCLUDE = (() => {
  const procs = ['LA247', 'LA248', 'LA251', 'LA272', 'LA274', 'LA321', 'LA346', 'LA347', 'LA354', 'LA357', 'LA358', 'KK090', 'KK061', 'KK062', 'LA232']
  const include = { use: 'include', place: 'afterProc' }
  return Object.fromEntries(procs.map((proc) => [proc, {
    리도카인: { use: 'exclude' },
    아라간: proc === 'KK090' ? include : { use: 'exclude' },
    덱사: { ...include, label: 'dexa' },
    트리암: { ...include, label: 'triam' },
    조영제: include,
  }]))
})()
const INJECTION_OFF = (() => {
  const off = { use: 'exclude' }
  return Object.fromEntries(Object.keys(ALL_INCLUDE).map((proc) => [proc, { 리도카인: off, 아라간: proc === 'KK090' ? { use: 'include', place: 'afterProc' } : off, 덱사: off, 트리암: off, 조영제: off }]))
})()
const LOCAL_CODES = {
  'LOCAL-L': { n: 'LOCALBLOCK', k: 'proc', rg: null, standardCode: 'LA358', pendingReview: false, add: true },
  'LOCAL-CUSTOM': { n: 'CUSTOMBLOCK', k: 'proc', rg: null, standardCode: 'LA346', pendingReview: false, add: true },
}

const SCENARIOS = [
  { name: 'mark-empty', acs: 'AC-014.5', tpl: { mark: '' } },
  { name: 'mark-other', acs: 'AC-014.5', tpl: { mark: '※' } },
  { name: 'side-upper', acs: 'AC-014.5', tpl: { sideStyle: 'upper' } },
  { name: 'side-dot', acs: 'AC-014.5', tpl: { sideStyle: 'dot' } },
  { name: 'side-bil', acs: 'AC-014.5', tpl: { sideStyle: 'bil' } },
  { name: 'side-ko', acs: 'AC-014.5', tpl: { sideStyle: 'ko' } },
  { name: 'side-ko-short', acs: 'AC-014.5', tpl: { sideStyle: 'koShort' } },
  { name: 'one-line', acs: 'AC-014.5', tpl: { lineJoin: 'oneLine' } },
  { name: 'sentence', acs: 'AC-014.5', tpl: { sentence: '{C-arm} {좌우} {시술} {레벨} {부위} {KLG} {시행함}.' } },
  { name: 'sentence-list', acs: 'AC-014.5', tpl: { sentence: '{시술목록} {시행함}', lineJoin: 'oneLine' } },
  { name: 'level-dash', acs: 'AC-014.5', tpl: { levelSep: 'dash' } },
  { name: 'level-repeat', acs: 'AC-014.5', tpl: { levelSep: 'repeat' } },
  { name: 'main-central', acs: 'AC-014.2', tpl: { mainCentral: '{C-arm} {시술} {시행함}', mainPeripheral: '{Sono} {시술} {시행함}', cpb: '{좌우} {시술} 시행', snb: '{좌우} {시술} 시행함.' } },
  { name: 'main-old', acs: 'AC-014.2', tpl: { main: '{시술} 시행', mainCentral: null, mainPeripheral: null } },
  { name: 'tokens', acs: 'AC-014.2', tpl: { mainPeripheral: '{한글방향} {영문방향} {시술} {코드} {처방명} {레벨} {부위}', mainCentral: '{시술} / {레벨} / {코드}' } },
  { name: 'by-proc-region', acs: 'AC-014.2', tpl: { byProc: { SSNB: '{한글방향} {시술} 시행', MBB: 'X {시술}' }, byRegion: { knee: '{부위} {시술}', lumbar: '{부위}: {시술}' } } },
  { name: 'fixed-site', acs: 'AC-014.2', tpl: { fixedPhrases: [{ token: 'C-arm', text: '투시 하에', on: false }, { token: '내말', text: '끝', on: true }], siteNames: { knee: '무릎', shoulder: '어깨' }, mainCentral: '{C-arm} {시술} {내말}', iaEtc: '{내말} {부위}{약제}' } },
  { name: 'rename', acs: 'AC-014.5', tpl: { rename: 'C-MBB > MBB C\nANB > Axillary\nFNB → Femoral' } },
  { name: 'side-code', acs: 'AC-014.5', tpl: { sideByCode: { LA346: 'keep', LA347: 'omit', LA358: 'omit', LA248: 'omit' }, sideMode: 'chart' } },
  { name: 'side-spread', acs: 'AC-014.5', tpl: { sideSpread: 'adjacent', splitEach: false, sideMode: 'chart' } },
  { name: 'split-off', acs: 'AC-014.5', tpl: { splitCpb: false, splitSnb: false } },
  { name: 'reasons-both', acs: 'AC-014.5', tpl: { reasonPriority: 'both' } },
  { name: 'reasons-interval', acs: 'AC-014.5', tpl: { reasonPriority: 'interval' } },
  { name: 'reasons-off', acs: 'AC-014.5', tpl: { ia2: '', itv: '' } },
  { name: 'reasons-rules', acs: 'AC-014.6', tpl: { intervalCodes: 'LA247, LA358', intervalDays: 3, twoSiteRules: 'LA247 = LA346\nKK090', itv: '간격 사유 {C-arm}.', ia2: '두 부위.' } },
  { name: 'interval-long', acs: 'AC-014.6', tpl: { intervalDays: 30 } },
  { name: 'cartilage-words', acs: 'AC-014.2', tpl: { ara: '{좌우} knee {회차}회차 {약제} {코드}', klg: 'K-L {KL1}/{KL2}', cartilageSideLang: 'en' } },
  { name: 'cartilage-side-off', acs: 'AC-014.2', tpl: { sideByCode: { KK090: 'omit' }, klg: '' } },
  { name: 'ia-off', acs: 'AC-014.2', tpl: { iaEtc: '', ts: '', icnb: '' }, procedureDrugs: INJECTION_OFF },
  { name: 'ia-words', acs: 'AC-014.2', tpl: { iaEtc: '{Sono} {부위} IA{약제} {투여량}', ts: '{부위} TS{약제}', icnb: 'ICNB {좌우} 2 level', kneeSetSkipIa: false } },
  { name: 'drug-words', acs: 'AC-014.9', tpl: { drugQty: true, drugUnit: 'A', drugWrap: 'plain' } },
  { name: 'drug-all-lines', acs: 'AC-014.9', tpl: { mainCentral: '{시술}{약제}', mainPeripheral: '{시술}{약제}' }, procedureDrugs: ALL_INCLUDE },
  { name: 'code-names', acs: 'AC-014.7', codemap: { LA247: { n: 'SSB', k: 'proc', rg: 'shoulder' }, KK062: { n: 'TS주사', k: 'proc', rg: null, add: false }, LA346: { n: 'ANB', k: 'proc', rg: null, add: false } } },
  { name: 'code-own', acs: 'AC-014.7', codemap: { ...LOCAL_CODES, A49: { n: '아라간', k: 'drug', rg: 'knee', cartilageMemo: '개별 {약제} {코드} {좌우} {부위} {회차}차' }, HA280: { n: '관절조영술', k: 'note', rg: null, memo: '조영 {투여량} {코드} {표기}' }, E6611: { n: '도수근력검사', k: 'proc', rg: null, memo: '근력 {부위} {투여량}' } } },
  { name: 'code-template-key', acs: 'AC-014.7', tpl: { byProc: { 'nerve-x': '템플릿 {시술}' } }, codemap: { LA247: { n: 'SSNB', k: 'proc', rg: 'shoulder', templateKey: 'nerve-x' } } },
  { name: 'code-pending', acs: 'AC-014.7', codemap: { LA247: { n: 'SSNB', k: 'proc', rg: 'shoulder', pendingReview: true } } },
  { name: 'dictionary-alias', acs: 'AC-014.6', dictionary: { aliases: [{ id: 'a1', kind: 'procedure', term: 'ESWT', target: 'MBB' }, { id: 'a2', kind: 'site', term: 'LBP', target: 'lumbar' }, { id: 'a3', kind: 'cancel', term: '이번엔보류', target: '취소' }], omissions: { dropRootEpi: false, dropShoulderAnbWithCervicalMbb: false } } },
  { name: 'dictionary-root-epi', acs: 'AC-014.6', dictionary: { aliases: [], omissions: { dropRootEpi: true, dropShoulderAnbWithCervicalMbb: false } } },
  { name: 'dictionary-anb', acs: 'AC-014.6', dictionary: { aliases: [], omissions: { dropRootEpi: false, dropShoulderAnbWithCervicalMbb: true } } },
]

const scenarios = SCENARIOS.map((scenario) => {
  load(memoFake, scenario)
  const visits = eachVisit(`v=>({id:v.id,fullText:fullText(v),memos:v.memos.map(m=>m.rg)})`).filter((v) => !SKIP_DRUGS.includes(v.id))
  return { ...scenario, skip: SKIP_DRUGS, visits }
})
write('memo-full-settings.json', { ...head(`${fullEntry}. 원본 기본값 위에 TPL·CODEMAP 칸을 얹었다. 약 칸은 우리 병원 값(또는 사례의 procedureDrugs)이다`, 'claim-month-memo.json'), scenarios })

// ── 문구 사전 ──────────────────────────────────────────

const ALIASES = {
  aliases: [
    { id: 'a1', kind: 'procedure', term: '견갑상차단', target: 'SSNB' },
    { id: 'a2', kind: 'procedure', term: 'SS', target: 'SSNB' },
    { id: 'a3', kind: 'procedure', term: 'SSNB', target: '바꾸면안됨' },
    { id: 'a4', kind: 'site', term: '우견', target: 'Rt shoulder' },
    { id: 'a5', kind: 'hold', term: '보류', target: '이번엔보류' },
    { id: 'a6', kind: 'cancel', term: 'Cancel', target: '취소' },
    { id: 'a7', kind: 'site', term: '견', target: 'shoulder' },
  ],
  omissions: { dropRootEpi: false, dropShoulderAnbWithCervicalMbb: false },
}
const NORMALIZE_INPUT = ['Rt 견갑상차단', 'SS block', 'BSS block', 'SS_ block', 'ss', '우견 SS', 'cancel', 'CANCEL now', 'recancel', '우견보류', '', '바꿀 말 없음']
const normalize = []
ctx.__setDictionary({ ...BLANK_DICTIONARY, ...ALIASES })
for (const input of NORMALIZE_INPUT) {
  for (const kind of [null, 'procedure', 'site']) {
    ctx.__input = input
    ctx.__kind = kind
    normalize.push({ dictionary: ALIASES, kind, input, out: run('NEW_MEDICORE_DICTIONARY.normalize(__input,__kind)') })
  }
}
const terms = ['procedure', 'site', 'hold', 'cancel', 'conditional'].map((kind) => {
  ctx.__kind = kind
  return { dictionary: ALIASES, kind, out: JSON.parse(run('JSON.stringify(NEW_MEDICORE_DICTIONARY.terms(__kind))')) }
})
ctx.__setDictionary(BLANK_DICTIONARY)
const blank = { aliases: [], omissions: BLANK_DICTIONARY.omissions }
ctx.__input = 'Rt 견갑상차단'
normalize.push({ dictionary: blank, kind: null, input: 'Rt 견갑상차단', out: run('NEW_MEDICORE_DICTIONARY.normalize(__input)') })
write('memo-dictionary.json', { ...head('NEW_MEDICORE_DICTIONARY normalize·terms·omissions', 'claim-month-memo.json'), normalize, terms })
