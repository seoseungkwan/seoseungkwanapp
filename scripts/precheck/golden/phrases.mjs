#!/usr/bin/env node
// 병원 문구 값 골든(TASK-14, AC-014.3). 원본 claim_hospital_settings의 defaults·validate·diff·migrateSideConfig를 돌려 적는다.
//   node scripts/precheck/golden/phrases.mjs --src "$YANGJI_SRC" [--out fixtures/precheck/golden]
// tools/claim_hospital_settings.js와 mx999_v22.html 안의 스크립트는 같은 글이다. 끝까지 돌린 판(html)으로 돌린다. 원본 칸만 넣는다: 약 칸은 원본에 없다(knownDiffs)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILE, SOURCE, args, lines, loadOriginal } from './original.mjs'

const KNOWN_DIFFS = [
  { where: 'procedureDrugs', why: '원본에 없는 칸(시술별 약, design.md 19-3). 원본 validate·defaults·diff 골든은 원본 칸만 보고, 이 칸은 phrases.test.ts가 따로 본다. validatePhrases는 이 칸이 없으면 거절하고(AC-014.8) defaultPhrases는 빈 칸을 준다' },
  { where: 'TPL.__codeHistory', why: '원본의 과거 코드 검토 기능을 옮기지 않았다. 그 칸이 있으면 원본이 그 기능을 못 불렀을 때와 같은 오류로 거절한다. 만드는 곳이 없어 실제로 오지 않는다' },
  { where: 'validatePhrases 오류 모양', why: '원본 throw를 답으로 바꿨다: 원본 apply는 migrate가 던지면 멈춘다. 우리는 { path: "설정", message }로 돌려준다. 글자는 같다' },
]

const out = args({ out: 'fixtures/precheck/golden' })
const O = loadOriginal(out.src)
const settings = O.ctx.NEW_MEDICORE_CLAIM_SETTINGS
if (!settings) throw new Error('원본 설정 엔진을 찾지 못함')
const json = (value) => JSON.parse(JSON.stringify(value))
const defaults = json(settings.defaults())
const migrate = O.ctx.NEW_MEDICORE_MIGRATE_CLAIM_SIDE_CONFIG

const fresh = () => json(defaults)
const withTpl = (patch) => {
  const value = fresh()
  Object.assign(value.TPL, patch)
  return value
}
const withCode = (code, row) => {
  const value = fresh()
  value.CODEMAP[code] = row
  return value
}
const catalog = { schema: 1, profileId: 'a'.repeat(32), institutionCode: '12345678', asOf: '2026-10-01', source: 'drbit-hospital', rowCount: 10 }

const VALIDATE = [
  ['기본값', fresh()],
  ['옛 규칙 1', withTpl({ sideRuleVersion: 1, sideByCode: { LA346: 'omit', LA347: 'keep' }, procedureTypes: { LA346: 'level' } })],
  ['규칙 칸 없음', (() => { const value = fresh(); delete value.TPL.sideRuleVersion; return value })()],
  ['고정 멘트', withTpl({ fixedPhrases: [{ token: '내말', text: '끝', on: true }, { token: '꺼짐', text: '끝', on: false }], main: '{내말} {시술}' })],
  ['코드 칸 모두', withCode('LOCAL-L', { n: '가상차단', k: 'proc', rg: null, standardCode: 'LA358', templateKey: 'MBB', add: true, memo: '{표기} {코드}', cartilage: false, cartilageMemo: '{회차} {코드}', steroid: false, pendingReview: false, bitKind: 'procedure', bitName: '가상', bitActive: true, displayName: '가상' })],
  ['병원 코드 출처', withTpl({ __catalog: catalog })],
  ['문구 칸 여러 값', withTpl({ sideStyle: 'ko', drugWrap: 'plain', drugQty: true, drugUnit: 'A', sideMode: 'chart', sideSpread: 'adjacent', cartilageSideLang: 'en', levelSep: 'repeat', lineJoin: 'oneLine', reasonPriority: 'both', intervalDays: 365, twoSiteRules: 'KK090 = LA274\nKK061', byRegion: { knee: '{부위} {시술}' }, byProc: { SSNB: '{시술} {코드}' }, rename: 'A > B', siteNames: { knee: 'K' }, __labels: { main: '이름' } })],
  // 형식
  ['null', null],
  ['배열', []],
  ['빈 {}', {}],
  ['TPL 없음', { CODEMAP: {}, CODEMAP_DEL: [] }],
  ['TPL이 글자', { TPL: 'x', CODEMAP: {}, CODEMAP_DEL: [] }],
  ['CODEMAP 없음', { TPL: fresh().TPL, CODEMAP_DEL: [] }],
  ['CODEMAP_DEL 없음', { TPL: fresh().TPL, CODEMAP: {} }],
  ['다른 칸', { ...fresh(), extra: 1 }],
  ['모르는 문구 칸', withTpl({ unknownField: 'x' })],
  ['위험한 칸 이름', { ...fresh(), TPL: { ...fresh().TPL, byProc: JSON.parse('{"__proto__":"x"}') } }],
  ['너무 깊음', withTpl({ byProc: { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } } })],
  // 문구 칸
  ['모르는 말', withTpl({ main: '{없는말}' })],
  ['중괄호 짝', withTpl({ main: '{시술' })],
  ['기호 너무 김', withTpl({ mark: 'x'.repeat(17) })],
  ['문구 글자 아님', withTpl({ cpb: 1 })],
  ['제어문자', withTpl({ snb: 'a\u0001b' })],
  ['ara 말', withTpl({ ara: '{회차} {KL1}' })],
  ['klg 말', withTpl({ klg: '{KL1} {회차}' })],
  ['sentence 말', withTpl({ sentence: '{시술목록} {코드}' })],
  ['고정 멘트 말', withTpl({ main: '{C-arm} {Sono} {시행함}' })],
  // 값 칸
  ['2부위 규칙', withTpl({ twoSiteRules: 'A = B = C\n%%' })],
  ['간격 0', withTpl({ intervalDays: 0 })],
  ['간격 소수', withTpl({ intervalDays: 1.5 })],
  ['겹칠 때', withTpl({ reasonPriority: 'x' })],
  ['좌우 모양', withTpl({ sideStyle: 'x' })],
  ['약 모양', withTpl({ drugWrap: 'x' })],
  ['단위 길이', withTpl({ drugUnit: 'x'.repeat(11) })],
  ['켜기 값', withTpl({ drugQty: 1, drugLocal: 'x', kneeSetSkipIa: 0, splitCpb: 'y', splitSnb: null })],
  ['코드 목록', withTpl({ mainCentralCodes: 'LA358, %%', intervalCodes: '%%', lidoCodes: '%%', mainPeripheralCodes: '%%' })],
  ['줄 나누기', withTpl({ splitEach: 'x' })],
  ['줄 나누기 없음', (() => { const value = fresh(); delete value.TPL.splitEach; return value })()],
  ['좌우 기본', withTpl({ sideMode: 'x', sideSpread: 'x', cartilageSideLang: 'x', levelSep: 'x', lineJoin: 'x' })],
  ['고정 멘트 많음', withTpl({ fixedPhrases: Array.from({ length: 31 }, (_, i) => ({ token: `t${i}`, text: 'x' })) })],
  ['고정 멘트 틀림', withTpl({ fixedPhrases: ['x', { token: 'a b', text: 'x' }, { token: '시술', text: 'x' }, { token: 'x', text: 1, on: 1 }, { token: 'x', text: 'y' }, { token: 'x', extra: 1 }] })],
  ['부위 표기', withTpl({ siteNames: { moon: 'x' } })],
  ['부위 표기 값', withTpl({ siteNames: { knee: 1 } })],
  ['약 이름', withTpl({ drugNames: { other: 'x' } })],
  ['약 이름 값', withTpl({ drugNames: { steroid: 1 }, drugUnlistedOther: 'x' })],
  ['좌우 규칙 3', withTpl({ sideRuleVersion: 3 })],
  ['코드별 좌우', withTpl({ sideByCode: { LA358: 'x', ' LA1': 'omit', la358: 'keep' } })],
  ['코드별 좌우 모양', withTpl({ sideByCode: [] })],
  ['표기 유형', withTpl({ procedureTypes: { LA358: 'x', ' LA1': 'side', la358: 'level' } })],
  ['표기 유형 모양', withTpl({ procedureTypes: [] })],
  ['코드 출처', withTpl({ __catalog: { ...catalog, schema: 2 } })],
  ['코드 출처 날짜', withTpl({ __catalog: { ...catalog, asOf: '2026-13-01' } })],
  ['묶음 칸', withTpl({ byRegion: { moon: 'x' }, byProc: { ' a': 'x', A: 'x', a: 'x' }, __labels: { a: 'x'.repeat(121) } })],
  ['묶음 모양', withTpl({ byRegion: [], byProc: 1 })],
  ['표기 바꾸기', withTpl({ rename: 'a > b > c\n> x' })],
  // 코드 칸
  ['코드 이름 틀림', withCode(' LA1', { n: 'x', k: 'proc', rg: null })],
  ['코드 대소문자 겹침', withCode('la358', { n: 'x', k: 'proc', rg: null })],
  ['코드 줄 모양', withCode('X1', 'x')],
  ['코드 줄 모르는 칸', withCode('X1', { n: 'x', k: 'proc', rg: null, extra: 1 })],
  ['코드 줄 값', withCode('X1', { n: '', k: 'x', rg: 'moon', add: 1, cartilage: 1, steroid: 1, carm: 1, bitKind: 'x', standardCode: '%%', bitActive: 1, templateKey: 1, displayName: 1, bitName: 1, memo: '{없는말}', cartilageMemo: '{없는말}' })],
  ['지운 코드', { ...fresh(), CODEMAP_DEL: ['%%'] }],
].map(([name, input]) => {
  let errors
  let value = null
  try {
    const migrated = migrate(input)
    errors = settings.validate(migrated)
    if (!errors.length) value = migrated
  } catch (error) {
    errors = [{ path: '설정', message: error.message }]
  }
  return { name, input, errors: json(errors), value: value && json(value) }
})

const MIGRATE = [
  ['옛 규칙 1', { TPL: { sideRuleVersion: 1, sideByCode: { LA346: 'omit', LA347: 'keep', LA348: 'quantity' }, procedureTypes: { LA346: 'level' } } }],
  ['규칙 칸 없음', { TPL: { main: 'x' } }],
  ['이미 2', { TPL: { sideRuleVersion: 2, sideByCode: { LA346: 'keep' }, procedureTypes: { LA346: 'level' } } }],
  ['TPL 없음', { CODEMAP: {} }],
  ['이력 안의 옛 규칙', { TPL: { sideRuleVersion: 2 }, HOSPITAL_MEMO: { history: [{ id: 'a', settings: { TPL: { sideRuleVersion: 1 } } }, 'x'] } }],
  ['형식', null],
  ['배열', []],
  ['TPL 글자', { TPL: 'x' }],
  ['규칙 3', { TPL: { sideRuleVersion: 3 } }],
  ['코드별 좌우 모양', { TPL: { sideRuleVersion: 1, sideByCode: [] } }],
  ['코드별 좌우 값', { TPL: { sideRuleVersion: 1, sideByCode: { LA1: 'x' } } }],
  ['코드 겹침', { TPL: { sideRuleVersion: 1, sideByCode: { LA1: 'omit', la1: 'omit' } } }],
  ['코드 글자', { TPL: { sideRuleVersion: 1, sideByCode: { ' LA1': 'omit' } } }],
].map(([name, input]) => {
  try {
    return { name, input, out: json(migrate(input)) }
  } catch (error) {
    return { name, input, error: error.message }
  }
})

const DIFF = [
  ['같음', fresh(), fresh()],
  ['문구', fresh(), withTpl({ mark: '※', main: '{시술} x' })],
  ['칸 생김', fresh(), withTpl({ sideStyle: 'ko', sideMode: 'chart', sideSpread: 'adjacent', cartilageSideLang: 'en', levelSep: 'dash', lineJoin: 'oneLine', drugUnlistedOther: false })],
  ['칸 없어짐', withTpl({ sideStyle: 'ko', sideMode: 'chart', sideSpread: 'x', cartilageSideLang: 'x', levelSep: 'x', lineJoin: 'x', drugUnlistedOther: true }), fresh()],
  ['좌우 규칙', withTpl({ sideRuleVersion: 1 }), fresh()],
  ['코드별', withTpl({ sideByCode: { LA1: 'omit', LA2: 'quantity', LA3: 'keep', LA4: 'x' }, procedureTypes: { LA1: 'side', LA2: 'level', LA3: 'x' } }), fresh()],
  ['코드 줄', fresh(), withCode('LA247', { n: 'x', k: 'proc', rg: 'knee' })],
  ['코드 생김', fresh(), withCode('X1', { n: 'x', k: 'drug', rg: null })],
  ['지운 코드', fresh(), { ...fresh(), CODEMAP_DEL: ['LA247'] }],
  ['이름표 있는 칸들', fresh(), withTpl({ intervalDays: 9, drugQty: true, byRegion: { knee: 'x' }, siteNames: { knee: 'K' }, drugNames: { steroid: 'x', cartilage: 'y' }, fixedPhrases: [{ token: 'a', text: 'b' }] })],
].map(([name, before, after]) => ({ name, before, after, out: json(settings.diff(before, after)) }))

mkdirSync(out.out, { recursive: true })
writeFileSync(
  join(out.out, 'phrases-engine.json'),
  `${lines({ source: SOURCE, file: FILE, fileSha256: O.fileSha256, entry: 'new-medicore-claim-hospital-settings(tools/claim_hospital_settings.js) defaults·validate·diff·migrateSideConfig', fake: '', knownDiffs: KNOWN_DIFFS, defaults, validate: VALIDATE, migrate: MIGRATE, diff: DIFF })}\n`,
)
console.log('phrases-engine.json')
