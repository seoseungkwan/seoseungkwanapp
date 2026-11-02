import { readdirSync, readFileSync } from 'node:fs'
import { join, matchesGlob } from 'node:path'
import { describe, expect, it } from 'vitest'

// b2b 개편 합치기 맞춤 (REQ-034, specs/precheck design.md 18절). 청구 몫만 본다: 파일을 글자로 읽는다.
// 같은 규칙을 src/ 전체에서 보는 b2b 가드 시험(theme·classes·fonts·comments, e2e/config)은 고치지 않고 따로 돈다
const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// 시험 파일 밖 소스(.ts·.tsx) 전부(상대 경로)
function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sources(rel)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : []
  })
}

// ---------- AC-034.3: 청구 화면 폴더는 b2b 옛 이름·굵기 규칙을 지킨다 ----------

const CLAIM_DIR = 'src/components/claim'
const SETUP_FILES = ['SetupScreen.tsx', 'SetupAlert.tsx', 'StepGuide.tsx', 'ClaimEntry.tsx'].map((f) => `${CLAIM_DIR}/setup/${f}`)

// b2b src/app/theme.test.ts(AC-221.1)의 옛 Tailwind 이름 정규식과 같은 목록
const OLD_CLASS =
  /(?<![\w-])(?:text-(?:table|tab|panel|logo|title-sm|kpi-sm|kpi)|rounded-(?:card|chip)|(?:bg|text|border(?:-[trblxyse])?|outline|ring(?:-offset)?|fill|stroke|divide|decoration|accent|caret|shadow|placeholder|from|via|to)-(?:ok-soft|ok|danger-soft|danger|warn))(?:\/\d+)?(?![\w-])/g
// b2b src/app/fonts.test.ts(AC-203.3)의 굵기 규칙: 400·500·600 밖의 굵기 클래스(+ 숫자를 바로 적은 굵기)
const BAD_WEIGHT = /(?<![\w-])font-(?:extrabold|bold|black|extralight|light|thin|\[(?!(?:400|500|600)\])[^\]]*\])(?![\w-])/g
// ui 참조(ui.chip…)와 classes에서 불러오는 이름
const UI_REF = /(?<![\w.$])ui\.[A-Za-z]/g
const CLASSES_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"][^'"]*\/ui\/classes['"]/g

const oldNames = (text: string) => [...(text.match(OLD_CLASS) ?? []), ...(text.match(BAD_WEIGHT) ?? []), ...(text.match(UI_REF) ?? [])]
const classesImports = (text: string) => [...text.matchAll(CLASSES_IMPORT)].map((m) => m[1].split(',').map((n) => n.trim()).filter(Boolean))

describe('AC-034.3: 청구 화면 폴더(시험 밖)는 ds만 쓰고 옛 이름·400~600 밖 굵기가 없다', () => {
  it('AC-034.3: 검사 규칙 자체가 잡아야 할 것을 잡고, 새 이름은 잡지 않는다', () => {
    for (const bad of [
      'rounded-card',
      'rounded-chip',
      'text-table',
      'text-tab',
      'text-panel',
      'max-md:text-title-sm',
      'text-danger',
      'bg-danger-soft',
      'border-danger',
      'text-ok',
      'bg-ok-soft',
      'text-warn',
      'font-bold',
      'md:font-extrabold',
      'font-black',
      'font-light',
      'font-[700]',
      'className={ui.chip.done}',
      '`${ui.button.primary} no-underline`',
    ]) {
      expect(oldNames(bad), bad).not.toEqual([])
    }
    for (const ok of [
      'rounded-control',
      'text-small',
      'text-body',
      'text-subtitle',
      'text-title',
      'text-negative',
      'bg-negative-soft',
      'text-warning',
      'font-semibold font-medium font-normal',
      'font-[600]',
      'className={ds.chip.neutral}',
      'gui.x',
    ]) {
      expect(oldNames(ok), ok).toEqual([])
    }
    expect(classesImports("import { ds } from '@/components/ui/classes'")).toEqual([['ds']])
    expect(classesImports("import { ds, ui } from '@/components/ui/classes'")).toEqual([['ds', 'ui']])
  })

  it('AC-034.3: 시험 파일 밖 src/components/claim/**에 ui 참조·옛 Tailwind 이름·400·500·600 밖 굵기가 없다(빈 검사가 아니다: 설치 화면 네 파일이 목록에 있다)', () => {
    const files = sources(CLAIM_DIR)
    expect(files).toEqual(expect.arrayContaining(SETUP_FILES))
    expect(files.flatMap((rel) => oldNames(read(rel)).map((name) => `${rel}: ${name}`))).toEqual([])
  })

  it('AC-034.3: classes에서는 ds만 불러온다 — 설치 화면 네 파일은 ds를 불러오고 ui는 불러오지 않는다', () => {
    const files = sources(CLAIM_DIR)
    for (const rel of files) for (const names of classesImports(read(rel))) expect(names, rel).toEqual(['ds'])
    for (const rel of SETUP_FILES) expect(classesImports(read(rel)), rel).toEqual([['ds']])
  })
})

// ---------- AC-034.4: ADR 번호 ----------

// "ADR-016~019"·"ADR-003·004·016·017"·"ADR-016·020~022"를 번호 목록으로 펼친다
const ADR_REF = /ADR-(\d{3})((?:[~·]\d{2,3})*)/g
function adrNumbers(text: string): number[] {
  return [...text.matchAll(ADR_REF)].flatMap((m) => {
    const out = [Number(m[1])]
    for (const part of m[2].matchAll(/([~·])(\d{2,3})/g)) {
      const n = Number(part[2])
      if (part[1] === '~') for (let k = out[out.length - 1] + 1; k <= n; k++) out.push(k)
      else out.push(n)
    }
    return out
  })
}
const OLD_CLAIM = [17, 18, 19]
const citesOld = (text: string) => adrNumbers(text).some((n) => OLD_CLAIM.includes(n))
const CLAIM_WORD = /청구|도우미|비트|lib\/bridge/

const ADR_TITLE = /^### ADR-(\d{3}): (.+)$/gm
const adrDoc = () => read('docs/ADR.md')
const titles = () => [...adrDoc().matchAll(ADR_TITLE)].map((m) => [Number(m[1]), m[2]] as const)
// 그 번호 ADR 절(제목 줄부터 다음 제목 앞까지)
function adrSection(no: number): string {
  const doc = adrDoc()
  const head = new RegExp(`^### ADR-${String(no).padStart(3, '0')}: `, 'm').exec(doc)
  if (head === null) return ''
  const rest = doc.slice(head.index + 1)
  const next = rest.search(/^### ADR-/m)
  return next === -1 ? doc.slice(head.index) : doc.slice(head.index, head.index + 1 + next)
}

const CLAIM_ONLY_FILES = () => [
  'eslint.config.mjs',
  'src/lib/bridge/extensionId.ts',
  'src/lib/csp.test.ts',
  ...readdirSync(join(ROOT, 'phases'))
    .filter((d) => d.startsWith('precheck-'))
    .flatMap((d) => readdirSync(join(ROOT, 'phases', d)).filter((f) => f.endsWith('.md')).map((f) => `phases/${d}/${f}`)),
]
const MIXED_DOCS = ['CLAUDE.md', 'docs/ARCHITECTURE.md', 'plan.md']

describe('AC-034.4: 합친 뒤 ADR 번호', () => {
  it('AC-034.4: 범위·나열 글 펼치기 자체가 맞다', () => {
    expect(adrNumbers('ADR-016~019')).toEqual([16, 17, 18, 19])
    expect(adrNumbers('ADR-016~018')).toEqual([16, 17, 18])
    expect(adrNumbers('(ADR-017·018)')).toEqual([17, 18])
    expect(adrNumbers('ADR-003·004·016·020~022')).toEqual([3, 4, 16, 20, 21, 22])
    expect(adrNumbers('ADR-017·AC-004.1')).toEqual([17])
    expect(adrNumbers('ADR-014·ADR-015')).toEqual([14, 15])
    expect(citesOld('ADR-016·020~022')).toBe(false)
    expect(citesOld('ADR-016~019')).toBe(true)
  })

  it('AC-034.4: docs/ADR.md 제목 번호는 한 번씩이고 오름차순이다', () => {
    const numbers = titles().map(([n]) => n)
    expect(numbers.length).toBeGreaterThan(20)
    expect(new Set(numbers).size).toBe(numbers.length)
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers)
  })

  it('AC-034.4: ADR-016은 청구, ADR-017~019는 main이 가져온 b2b 쪽 것, 청구의 옛 017·018·019는 ADR-020·021·022다(제목 그대로)', () => {
    const byNo = Object.fromEntries(titles())
    expect([16, 17, 18, 19, 20, 21, 22].map((n) => [n, byNo[n]])).toEqual([
      [16, '청구 사전점검은 크롬 확장 + 네이티브 메시징 도우미(C#/.NET)로 비트와 연결한다'],
      [17, 'E2E는 `@playwright/test` + 실제 Supabase 시험 계정 (ADR-015의 "`@playwright/test`는 넣지 않는다"를 E2E에서 바꿈)'],
      [18, '랜딩 개편 — 제품 화면 미리보기, 앱 토큰, 강조색 하나 (ADR-012를 대체, ADR-014는 그대로)'],
      [19, '디자인 토큰 한 곳 + Pretendard (ADR-014·015·018의 토큰·글꼴 줄을 바꿈)'],
      [20, '비트 환자 자료 통로는 확장 → 통로 코드(`lib/bridge`) → Worker, 통로 코드도 환자 자료 구역'],
      [21, '청구 기능의 서버 자료는 건수 표와 설정 표뿐, 서버 경로는 늘리지 않는다'],
      [22, 'plan.md §10의 "청구·삭감 관리"·"청구메모 exe"를 다시 꺼낸다'],
    ])
  })

  it('AC-034.4: 청구 ADR(016·020~022) 본문은 옛 번호 017·018·019를 인용하지 않고, ADR-015의 상태 줄은 main 쪽 것이다', () => {
    for (const no of [16, 20, 21, 22]) {
      const body = adrSection(no).split('\n').slice(1).join('\n')
      expect(body.length, `ADR-0${no}`).toBeGreaterThan(0)
      expect(citesOld(body), `ADR-0${no}`).toBe(false)
    }
    // ADR-022 본문이 가리키는 도우미 결정은 ADR-016 그대로
    expect(adrSection(22)).toContain('도우미(ADR-016)')
    const adr015 = adrSection(15)
    expect(adr015).toContain('**상태**: E2E는 ADR-017이 바꾼다(2026-10-29)')
    expect(adr015).toContain('**상태**(2026-10-30): 토큰·글꼴 줄은 ADR-019 / specs/b2b-redesign이 대체한다')
  })

  it('AC-034.4: 맨 위 안내 줄의 청구 범위는 "ADR-016·020~022", 철학의 §10 줄은 ADR-022를 가리킨다', () => {
    const lines = adrDoc().split('\n')
    const intro = lines.find((l) => l.startsWith('> 2026-10-28에 정한 것')) ?? ''
    expect(intro).toContain('(ADR-016·020~022는 2026-10-30 청구 사전점검)')
    const tenth = lines.filter((l) => l.includes('2차로 미룬 것(§10)'))
    expect(tenth).toHaveLength(1)
    expect(tenth[0]).toContain('사용자가 다시 꺼낸 것만 넣는다(ADR-022)')
    expect(citesOld(tenth[0])).toBe(false)
  })

  it('AC-034.4: 청구만 쓰는 파일(eslint.config.mjs·extensionId.ts·csp.test.ts·phases/precheck-*/*.md)에 ADR-017·018·019 인용이 없다(범위·나열 펼침)', () => {
    const files = CLAIM_ONLY_FILES()
    expect(files).toEqual(expect.arrayContaining(['phases/precheck-1-helper/step0.md', 'phases/precheck-7-backup/step0.md']))
    const found = files.flatMap((rel) =>
      read(rel)
        .split('\n')
        .filter(citesOld)
        .map((line) => `${rel}: ${line.trim().slice(0, 80)}`),
    )
    expect(found).toEqual([])
    // 빈 검사가 아니다: 이 파일들은 청구 ADR을 새 번호로 인용한다
    expect(files.some((rel) => adrNumbers(read(rel)).includes(20))).toBe(true)
  })

  it('AC-034.4: 섞인 문서(CLAUDE.md·docs/ARCHITECTURE.md·plan.md)에서 ADR-017·018·019를 가리키는 줄은 b2b 쪽 인용이다(청구·도우미·비트·lib/bridge 낱말 없음)', () => {
    const found = MIXED_DOCS.flatMap((rel) =>
      read(rel)
        .split('\n')
        .filter((line) => citesOld(line) && CLAIM_WORD.test(line))
        .map((line) => `${rel}: ${line.trim().slice(0, 80)}`),
    )
    expect(found).toEqual([])
    // CLAUDE.md CRITICAL 두 줄은 청구 ADR을 새 번호로 가리킨다
    const claude = read('CLAUDE.md').split('\n')
    expect(claude.find((l) => l.includes('비트 자료는 도우미 → 확장 → `lib/bridge` → Worker로만'))).toContain('ADR-021')
    expect(claude.find((l) => l.includes('`lib/bridge`·`workers`는 환자 자료 구역이다'))).toContain('(ADR-020)')
  })
})

// ---------- AC-034.5: 설정 파일은 두 쪽이 다 산다 ----------

const pkg = () => JSON.parse(read('package.json'))
const EXT_BUILD = String.raw`node -e "require('fs').rmSync('extension/dist',{recursive:true,force:true})" && tsc -p extension/tsconfig.json && node -e "const fs=require('fs'),d='extension/dist/';fs.copyFileSync('extension/manifest.json',d+'manifest.json');fs.writeFileSync(d+'commands.js','export default '+fs.readFileSync('src/lib/bridge/commands.json','utf8').trim()+'\n');const r=d+'relay.js',s=fs.readFileSync(r,'utf8'),t=s.replace('../../src/lib/bridge/commands.json','./commands.js');if(t===s)throw new Error('relay.js에서 commands.json import를 찾지 못했다');fs.writeFileSync(r,t)"`

describe('AC-034.5: 합친 뒤 설정 파일', () => {
  it('AC-034.5: package.json scripts에 main 쪽 e2e·e2e:env와 청구 ext:build가 값 그대로 있다', () => {
    const { scripts } = pkg()
    expect(scripts.e2e).toBe('tsx e2e/preflight.ts && next build && playwright test')
    expect(scripts['e2e:env']).toBe('tsx e2e/setup-env.ts')
    expect(scripts['ext:build']).toBe(EXT_BUILD)
    expect(scripts.test).toBe('vitest run')
  })

  it('AC-034.5: 패키지는 두 쪽 것 그대로(@playwright/test 1.64.1·@types/chrome 0.3.7)이고 package-lock.json 뿌리가 package.json과 같다', () => {
    const { dependencies, devDependencies } = pkg()
    expect(devDependencies['@playwright/test']).toBe('1.64.1')
    expect(devDependencies['@types/chrome']).toBe('0.3.7')
    const root = JSON.parse(read('package-lock.json')).packages['']
    expect(root.dependencies).toEqual(dependencies)
    expect(root.devDependencies).toEqual(devDependencies)
  })

  it('AC-034.5: vitest.config.ts include는 두 쪽 합이고 e2e/**/*.spec.ts는 잡지 않는다', async () => {
    const config = (await import('../vitest.config')).default
    const include = config.test?.include ?? []
    expect([...include].sort()).toEqual(
      [
        'src/**/*.test.{ts,tsx}',
        'fixtures/**/*.test.ts',
        'supabase/**/*.test.ts',
        'e2e/**/*.test.ts',
        'helper/tests/*.test.ts',
        'extension/**/*.test.ts',
        'scripts/**/*.test.ts',
      ].sort(),
    )
    const caught = (file: string) => include.some((pattern) => matchesGlob(file, pattern))
    for (const file of [
      'src/b2b-merge.test.ts',
      'src/components/shell/shell.test.tsx',
      'fixtures/precheck/import-tables.test.ts',
      'supabase/rls.test.ts',
      'e2e/config.test.ts',
      'helper/tests/protocol.dotnet.test.ts',
      'extension/src/manifest.test.ts',
    ]) {
      expect(caught(file), file).toBe(true)
    }
    expect(caught('e2e/auth-flow.spec.ts')).toBe(false)
    expect(caught('e2e/lib/session.spec.ts')).toBe(false)
    // 위 주석도 두 쪽 것을 합친다
    const text = read('vitest.config.ts')
    expect(text).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m)
    expect(text).toContain('e2e/**/*.spec.ts는 Playwright 시험이라 여기서 잡지 않는다')
    expect(text).toContain('helper/tests/*.test.ts(도우미 C# 시험 감싸개)')
  })

  it('AC-034.5: CLAUDE.md 기술 줄에 b2b 스타일링 줄(:root 한 곳·Pretendard, ADR-019)과 청구 줄(ADR-016)이 둘 다 있다', () => {
    const doc = read('CLAUDE.md')
    expect(doc).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m)
    const tech = doc.slice(doc.indexOf('## 기술 스택'), doc.indexOf('## 아키텍처 규칙')).split('\n')
    const styling = tech.filter((l) => l.startsWith('- 스타일링:'))
    expect(styling).toHaveLength(1)
    for (const part of ['`src/app/globals.css` `:root` 한 곳(ADR-019)', 'Pretendard']) expect(styling[0]).toContain(part)
    const claim = tech.filter((l) => l.startsWith('- 청구 사전점검(ADR-016):'))
    expect(claim).toHaveLength(1)
    expect(claim[0]).toContain('크롬 확장 Manifest V3')
  })
})
