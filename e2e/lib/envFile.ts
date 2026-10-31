// .env.local 넣기 도우미(npm run e2e:env)의 속 (순수 + 주입). 실행 파일 e2e/setup-env.ts가 진짜 입력·파일을 이어 붙인다.
// CRITICAL: 넣은 값은 출력·질문·오류 메시지에 한 글자도 담지 않는다. 이름·넣음/그대로·글자 수·역할 표시 여부만 보인다
import { chmodSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { E2E_ENV_NAMES, ROLES, ROLE_TAG, readE2eEnv, type Role } from './env'

export type EnvValueCheck = 'ok' | 'quote' | 'newline' | 'space'
export type EnvSetupDeps = {
  ask(name: string): Promise<string>
  read(): string | null
  write(text: string): void
  print(line: string): void
}
// afterCr: 답이 덩어리 끝의 \r로 끝났다 → 다음 질문의 첫 hiddenKeys에 넘긴다
export type HiddenKeysResult = { value: string; end: 'enter' | 'cancel' | null; afterCr: boolean }
type EnvValues = Record<string, string | undefined>

// readE2eEnv(e2e/lib/env.ts)와 같은 규칙 — 안내 글에만 쓴다(검사는 readE2eEnv가 한다)
const MIN_PASSWORD = 16
const MIN_NEW_EMAIL = 40
const ROLE_LABEL: Record<Role, string> = { admin: '관리자', approved: '승인됨', pending: '승인 대기', new: '신청 전' }
const EMAIL_ROLE = new Map<string, Role>(ROLES.map((role) => [`E2E_${role.toUpperCase()}_EMAIL`, role]))
const PASSWORD_ROLE = new Map<string, Role>(ROLES.map((role) => [`E2E_${role.toUpperCase()}_PASSWORD`, role]))

// 글자 수는 코드 포인트로 센다(한글·이모지도 한 글자)
const length = (s: string) => Array.from(s).length

// `NAME=`·`export NAME=`·`  NAME = …` 줄의 이름. 주석(#)·빈 줄은 잡지 않는다
const LINE_NAME = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/

// 같은 이름 줄은 모두 NAME='값'으로 바꾸고(Node는 뒤 줄이 이긴다), 없는 이름은 끝에 더한다. 다른 줄·주석·순서·줄 끝(CRLF)은 그대로
export function upsertEnvText(text: string, updates: Record<string, string>): string {
  const names = Object.keys(updates)
  if (names.length === 0) return text
  for (const name of names) {
    // 값은 따옴표로 감쌀 수 있을 때만 받는다(오류에 값은 담지 않는다)
    if (checkEnvValue(updates[name]) !== 'ok') throw new Error(`${name}: 저장할 수 없는 값`)
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const line = (name: string) => `${name}='${updates[name]}'`
  const replaced = new Set<string>()
  let out = text
    .split('\n')
    .map((current) => {
      const name = LINE_NAME.exec(current)?.[1]
      if (name === undefined || !Object.hasOwn(updates, name)) return current
      replaced.add(name)
      return line(name) + (current.endsWith('\r') ? '\r' : '')
    })
    .join('\n')
  const added = names.filter((name) => !replaced.has(name))
  if (added.length === 0) return out
  if (out !== '' && !out.endsWith('\n')) out += eol
  return out + added.map((name) => line(name) + eol).join('')
}

// NAME='값'으로 감쌀 수 있는 값인지. 작은따옴표·줄바꿈은 감쌀 수 없고, 앞뒤 빈칸은 붙여 넣다 잘못 든 것으로 본다
export function checkEnvValue(value: string): EnvValueCheck {
  if (value.includes("'")) return 'quote'
  if (/[\r\n]/.test(value)) return 'newline'
  if (value !== value.trim()) return 'space'
  return 'ok'
}

// value가 null이면 넣지 않은 이름(wasEmpty: 원래도 비어 있었음)
export function valueSummary(name: string, value: string | null, wasEmpty = false): string {
  if (value === null) return `${name}: ${wasEmpty ? '비어 있음' : '그대로'}`
  const role = EMAIL_ROLE.get(name)
  if (role === undefined) return `${name}: 넣음 (${length(value)}자)`
  // readE2eEnv·e2e-accounts.sql과 같이 @ 앞부분만 본다
  const at = value.indexOf('@')
  const tagged = at >= 0 && value.slice(0, at).includes(ROLE_TAG[role])
  return `${name}: 넣음 (${length(value)}자, ${ROLE_TAG[role]} 표시 ${tagged ? '있음' : '없음'})`
}

// 숨김 입력(raw 모드)으로 받은 글자 덩어리를 처리한다. 화면에는 아무것도 내지 않는다.
// Enter에서 끝나고 그 뒤 글자는 버린다(여러 줄을 붙여 넣어도 다음 질문의 답이 되지 않게). Ctrl+C·Ctrl+D는 멈춤.
// afterCr: 앞 답이 덩어리 끝의 \r로 끝났음 → 이 덩어리 맨 앞 \n은 그 Enter(\r\n)의 나머지라 버린다(폰 SSH 앱이 나눠 보낼 때)
export function hiddenKeys(value: string, chunk: string, afterCr = false): HiddenKeysResult {
  let next = value
  const chars = Array.from(afterCr && chunk.startsWith('\n') ? chunk.slice(1) : chunk)
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === '\u0003' || ch === '\u0004') return { value: '', end: 'cancel', afterCr: false }
    if (ch === '\r' || ch === '\n') return { value: next, end: 'enter', afterCr: ch === '\r' && i === chars.length - 1 }
    if (ch === '\u007f' || ch === '\b') next = Array.from(next).slice(0, -1).join('')
    else if (ch === '\u0015') next = ''
    else if (ch === '\u001b') i = escapeEnd(chars, i)
    else if (ch >= ' ') next += ch
  }
  return { value: next, end: null, afterCr: false }
}

// ESC로 시작하는 순서(방향키 `ESC [ 1 ; 5 C`, `ESC O D`, Alt+글자 `ESC x`)의 마지막 칸 위치
function escapeEnd(chars: string[], at: number): number {
  const next = chars[at + 1]
  if (next === '[') {
    let i = at + 2
    while (i < chars.length && chars[i] >= ' ' && chars[i] <= '?') i++
    return i < chars.length && chars[i] >= '@' && chars[i] <= '~' ? i : i - 1
  }
  if (next === 'O') return Math.min(at + 2, chars.length - 1)
  if (next !== undefined && next >= ' ') return at + 1
  return at
}

// 옆에 임시 파일(권한 600)을 쓰고 바꿔 끼운다 → 이미 있던 파일도 600이 되고, 중간에 멈춰도 반쯤 쓴 파일이 남지 않는다
export function writePrivateFile(path: string, text: string): void {
  const temp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(temp, text, { mode: 0o600, flag: 'wx' })
    chmodSync(temp, 0o600) // umask와 상관없이
    renameSync(temp, path)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

const AGAIN = '다시 넣어 주세요(그대로 두려면 아무것도 치지 말고 Enter)'
const REASON: Record<Exclude<EnvValueCheck, 'ok'>, string> = {
  quote: "작은따옴표(')가 들어 있어 저장할 수 없어요",
  newline: '줄바꿈이 들어 있어 저장할 수 없어요',
  space: '앞이나 뒤에 빈칸이 있어 저장할 수 없어요',
}

function helpFor(name: string): string {
  if (name === 'NEXT_PUBLIC_SUPABASE_URL') {
    return '프로젝트 주소(https://<ref>.supabase.co) — Supabase 대시보드 Project Settings(또는 위쪽 Connect)에 있어요'
  }
  if (name === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
    return '공개 열쇠(sb_publishable_…, 없으면 legacy anon) — Project Settings → API Keys. secret·service_role 열쇠는 넣지 마세요'
  }
  const emailRole = EMAIL_ROLE.get(name)
  if (emailRole !== undefined) {
    const long = emailRole === 'new' ? `, ${MIN_NEW_EMAIL}자 이상` : ''
    return `${ROLE_LABEL[emailRole]} 시험 계정 이메일 — @ 앞에 ${ROLE_TAG[emailRole]} 표시${long}`
  }
  const passwordRole = PASSWORD_ROLE.get(name)
  if (passwordRole !== undefined) {
    return `${ROLE_LABEL[passwordRole]} 시험 계정(${ROLE_TAG[passwordRole]}) 비밀번호 — ${MIN_PASSWORD}자 이상`
  }
  return name
}

const isEmpty = (value: string | undefined) => (value ?? '').trim() === ''

// readE2eEnv와 같은 규칙으로 이 이름 하나만 본다(주소 모양·비밀 열쇠·역할 표시·글자 수). 여러 이름을 함께 보는 검사
// (이메일 겹침)는 끝의 readE2eEnv가 한다. 돌려주는 것은 문제의 "무엇이 틀렸나"만(값 없음). 고치는 법("npm run e2e:env로
// 다시 넣기")은 지금 묻는 중이라 뺀다
function ruleProblem(name: string, value: string): string | null {
  const result = readE2eEnv({ [name]: value })
  if (result.ok) return null
  const prefix = `${name}: `
  const reasons = result.problems.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length).split(' — ')[0])
  return reasons.length === 0 ? null : reasons.join(' / ')
}

// 바꾼 글을 다시 읽었을 때 넣은 이름은 넣은 값, 다른 이름은 원래 값인지(여러 줄 값처럼 줄 단위로 못 고치는 모양을 잡는다)
function sameValues(expected: EnvValues, actual: EnvValues): boolean {
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)])
  return [...names].every((name) => expected[name] === actual[name])
}

export async function runEnvSetup(deps: EnvSetupDeps): Promise<number> {
  const { ask, print } = deps
  let file: string | null
  try {
    file = deps.read()
  } catch {
    // 오류 내용에는 경로·값이 섞일 수 있어 담지 않는다
    print('.env.local을 읽지 못했어요(파일 권한 등) — Claude에게 알려 주세요')
    return 1
  }
  const before = file ?? ''
  const current: EnvValues = parseEnv(before)
  const total = E2E_ENV_NAMES.length

  print(`.env.local에 E2E 값 ${total}개를 차례로 넣어요.`)
  print('- 치거나 붙여 넣은 글자는 화면에 보이지 않아요. 넣은 뒤 Enter를 누르세요')
  print('- 지금 값을 그대로 두려면 아무것도 치지 말고 Enter')
  print(`- 저장은 ${total}개를 다 물은 뒤 한 번에 해요. 중간에 Ctrl+C로 멈추면 아무것도 바뀌지 않아요`)

  const updates: Record<string, string> = {}
  for (const [index, name] of E2E_ENV_NAMES.entries()) {
    print('')
    print(`[${index + 1}/${total}] ${name} — ${helpFor(name)}`)
    print(isEmpty(current[name]) ? '  지금: 비어 있음' : '  지금: 값 있음(Enter만 누르면 그대로)')
    for (;;) {
      const answer = await ask(name)
      if (answer === '') break
      // CRITICAL: 공개 열쇠 칸의 비밀 열쇠처럼 규칙에 맞지 않는 값은 updates에 넣지 않는다(파일에 한 번도 쓰이지 않게)
      const check = checkEnvValue(answer)
      const reason = check === 'ok' ? ruleProblem(name, answer) : REASON[check]
      if (reason === null) {
        updates[name] = answer
        break
      }
      print(`  저장하지 않았어요: ${reason} — ${AGAIN}`)
    }
  }

  const next = upsertEnvText(before, updates)
  const after: EnvValues = parseEnv(next)
  print('')
  if (!sameValues({ ...current, ...updates }, after)) {
    print('.env.local 모양(여러 줄 값 등) 때문에 다른 값까지 바뀔 수 있어 저장하지 않았어요 — Claude에게 알려 주세요')
    return 1
  }
  if (file !== null || Object.keys(updates).length > 0) {
    try {
      deps.write(next)
    } catch {
      print('.env.local에 저장하지 못했어요(파일 권한·저장 공간) — 다시 실행하거나 Claude에게 알려 주세요')
      return 1
    }
    print('저장했어요: .env.local (권한 600 — 이 컴퓨터 계정만 읽고 쓸 수 있어요)')
  } else {
    print('넣은 값이 없어 .env.local을 만들지 않았어요')
  }

  print('')
  print('결과 (값은 보이지 않아요):')
  for (const name of E2E_ENV_NAMES) {
    print(valueSummary(name, Object.hasOwn(updates, name) ? updates[name] : null, isEmpty(current[name])))
  }

  print('')
  const result = readE2eEnv(after)
  if (result.ok) {
    print('남은 문제 없음 — Claude 창으로 돌아가 "값 넣었어요"라고 알려 주세요')
    return 0
  }
  print('남은 문제:')
  for (const problem of result.problems) print(`- ${problem}`)
  print('고칠 값만 다시 넣으려면 `npm run e2e:env`를 다시 실행하고, 맞는 값은 Enter로 넘기세요')
  return 1
}
