// E2E 값 읽기·시작 전 검사 (순수 + fetch 주입). 실행 파일(e2e/preflight.ts)이 이어 붙인다.
// CRITICAL: 문제 목록·메시지에는 이름과 무엇이 틀렸는지만 적는다. 넣은 값·응답 내용·오류 내용은 한 글자도 담지 않는다
import { supabaseOrigin } from '../../src/lib/supabase/env'

export type Role = 'admin' | 'approved' | 'pending' | 'new'

// 관리자·승인됨·승인 대기·신청 전
export const ROLES: readonly Role[] = ['admin', 'approved', 'pending', 'new']

// 이메일 앞부분(@ 앞)에 있어야 하는 표시. supabase/e2e-accounts.sql이 같은 글자로 계정을 찾는다
export const ROLE_TAG: Record<Role, string> = {
  admin: 'e2e-admin',
  approved: 'e2e-approved',
  pending: 'e2e-pending',
  new: 'e2e-new',
}

const URL_NAME = 'NEXT_PUBLIC_SUPABASE_URL'
const KEY_NAME = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
const emailName = (role: Role) => `E2E_${role.toUpperCase()}_EMAIL`
const passwordName = (role: Role) => `E2E_${role.toUpperCase()}_PASSWORD`

// npm run e2e:env가 이 순서로 묻는다
export const E2E_ENV_NAMES: readonly string[] = [
  URL_NAME,
  KEY_NAME,
  ...ROLES.flatMap((role) => [emailName(role), passwordName(role)]),
]

export type Account = { email: string; password: string }
export type E2eEnv = { supabaseUrl: string; anonKey: string; accounts: Record<Role, Account> }

const MIN_PASSWORD = 16
const MIN_NEW_EMAIL = 40
// E2E는 실제 프로젝트에만 붙는다: https://<ref>.supabase.co (포트·더 깊은 호스트 없음)
const PROJECT_ORIGIN = /^https:\/\/[a-z0-9]+\.supabase\.co$/
const FIX_VALUES = '따로 연 터미널에서 `npm run e2e:env`로 다시 넣어 주세요'

// 글자 수는 코드 포인트로 센다(한글·이모지도 한 글자)
const length = (s: string) => Array.from(s).length

// 공개 열쇠 칸에 비밀 열쇠(새 sb_secret_… 또는 legacy service_role JWT)가 들어왔는지
function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  const parts = key.split('.')
  if (parts.length !== 3) return false
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload === 'object' && payload !== null && (payload as { role?: unknown }).role === 'service_role'
  } catch {
    return false
  }
}

export function readE2eEnv(
  env: Record<string, string | undefined>,
): { ok: true; value: E2eEnv } | { ok: false; problems: string[] } {
  const problems: string[] = []
  // 비밀번호는 글자 그대로, 나머지는 앞뒤 빈칸을 뗀다. 빈칸만 있으면 빈 값
  const read = (name: string, trim: boolean): string | null => {
    const raw = env[name] ?? ''
    if (raw.trim() === '') {
      problems.push(`${name}: 비었어요 — ${FIX_VALUES}`)
      return null
    }
    return trim ? raw.trim() : raw
  }

  const rawUrl = read(URL_NAME, true)
  const origin = rawUrl === null ? null : supabaseOrigin(rawUrl)
  if (rawUrl !== null && (origin === null || !PROJECT_ORIGIN.test(origin))) {
    problems.push(`${URL_NAME}: 실제 Supabase 프로젝트 주소(https://<ref>.supabase.co)가 아니에요 — ${FIX_VALUES}`)
  }

  const anonKey = read(KEY_NAME, true)
  if (anonKey !== null && isSecretKey(anonKey)) {
    problems.push(
      `${KEY_NAME}: 비밀 열쇠(secret·service_role)예요. 공개 열쇠(sb_publishable_…, 없으면 legacy anon)만 넣어 주세요 — ${FIX_VALUES}`,
    )
  }

  const accounts: Partial<Record<Role, Account>> = {}
  for (const role of ROLES) {
    const email = read(emailName(role), true)
    if (email !== null) {
      // SQL의 split_part(email, '@', 1)과 같은 앞부분
      const local = email.includes('@') ? email.slice(0, email.indexOf('@')) : null
      if (local === null || !local.includes(ROLE_TAG[role])) {
        problems.push(`${emailName(role)}: 이메일 앞부분(@ 앞)에 \`${ROLE_TAG[role]}\` 표시가 없어요 — ${FIX_VALUES}`)
      }
      if (role === 'new' && length(email) < MIN_NEW_EMAIL) {
        problems.push(`${emailName(role)}: ${MIN_NEW_EMAIL}자 이상이어야 해요(긴 이메일 줄바꿈 확인용) — ${FIX_VALUES}`)
      }
    }
    const password = read(passwordName(role), false)
    if (password !== null && length(password) < MIN_PASSWORD) {
      problems.push(`${passwordName(role)}: ${MIN_PASSWORD}자 이상이어야 해요 — ${FIX_VALUES}`)
    }
    if (email !== null && password !== null) accounts[role] = { email, password }
  }

  // 이메일 4개는 서로 달라야 한다(대소문자 무시)
  const seen = new Map<string, Role>()
  for (const role of ROLES) {
    const email = accounts[role]?.email.toLowerCase()
    if (email === undefined) continue
    const first = seen.get(email)
    if (first === undefined) seen.set(email, role)
    else problems.push(`${emailName(first)}·${emailName(role)}: 같은 이메일이에요. 역할마다 다른 계정을 넣어 주세요 — ${FIX_VALUES}`)
  }

  if (problems.length > 0 || origin === null || anonKey === null) return { ok: false, problems }
  return { ok: true, value: { supabaseUrl: origin, anonKey, accounts: accounts as Record<Role, Account> } }
}

const SETTINGS_PAGE = 'Supabase → Authentication → Sign In / Providers'
// /auth/v1/settings에서 보는 칸. 응답의 다른 칸·모르는 새 칸은 보지 않는다
const SETTINGS_FIELDS = ['external.email', 'external.anonymous_users', 'disable_signup', 'mailer_autoconfirm'] as const

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function shapeProblem(fields: readonly string[]): string {
  return `Supabase 설정을 읽지 못했어요(/auth/v1/settings 응답 모양이 달라요: ${fields.join('·')} 칸) — 칸 이름이 바뀌었을 수 있으니 Claude에게 알려 주세요`
}

export function authSettingsProblems(settings: unknown): string[] {
  if (!isObject(settings)) return [shapeProblem(SETTINGS_FIELDS)]
  const external = settings.external
  if (!isObject(external)) return [shapeProblem(SETTINGS_FIELDS)]
  const flag: Record<(typeof SETTINGS_FIELDS)[number], unknown> = {
    'external.email': external.email,
    'external.anonymous_users': external.anonymous_users,
    disable_signup: settings.disable_signup,
    mailer_autoconfirm: settings.mailer_autoconfirm,
  }
  const missing = SETTINGS_FIELDS.filter((field) => typeof flag[field] !== 'boolean')
  if (missing.length > 0) return [shapeProblem(missing)]

  const problems: string[] = []
  if (flag['external.email'] === false) {
    problems.push(`Supabase 설정: 이메일 로그인이 꺼져 있어요 — ${SETTINGS_PAGE} → Email을 켜 주세요`)
  }
  if (flag.mailer_autoconfirm === true) {
    problems.push(`Supabase 설정: 이메일 확인이 꺼져 있어요(자동 확인) — ${SETTINGS_PAGE} → Email → Confirm email을 켜 주세요`)
  }
  if (flag['external.anonymous_users'] === true) {
    problems.push(`Supabase 설정: 익명 로그인이 켜져 있어요 — ${SETTINGS_PAGE} → Allow anonymous sign-ins(Anonymous)를 꺼 주세요`)
  }
  if (flag.disable_signup === true) {
    problems.push(
      `Supabase 설정: 새 가입이 꺼져 있어요(구글 새 사용자가 못 들어와요) — ${SETTINGS_PAGE} → Allow new users to sign up을 켜 주세요`,
    )
  }
  return problems
}

const TIMEOUT_MS = 10_000
const RESTART = 'Supabase 대시보드에서 프로젝트가 멈췄으면(Paused) 다시 켜(Restore project) 주세요'

export async function checkSupabase(env: E2eEnv, fetchFn: typeof fetch): Promise<string[]> {
  let response: Response
  try {
    response = await fetchFn(`${env.supabaseUrl}/auth/v1/settings`, {
      method: 'GET',
      headers: { apikey: env.anonKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // 오류 내용에는 주소가 들어 있을 수 있어 담지 않는다
    return [`Supabase가 응답하지 않아요(멈춤·주소 틀림) — ${RESTART}. 주소가 맞는지도 ${URL_NAME}에서 확인해 주세요(npm run e2e:env)`]
  }
  if (response.status === 401 || response.status === 403) {
    return [`Supabase가 열쇠를 받지 않아요(HTTP ${response.status}) — ${KEY_NAME}를 따로 연 터미널에서 npm run e2e:env로 다시 넣어 주세요`]
  }
  if (!response.ok) {
    return [`Supabase 응답이 HTTP ${response.status}예요 — ${RESTART}. 주소가 맞는지도 ${URL_NAME}에서 확인해 주세요(npm run e2e:env)`]
  }
  let settings: unknown
  try {
    settings = await response.json()
  } catch {
    settings = undefined
  }
  return authSettingsProblems(settings)
}

export function startProblemMessage(problems: string[]): string {
  return [
    'E2E를 시작하지 못했어요. 빌드와 시험은 돌리지 않았어요.',
    '',
    '문제:',
    ...problems.map((p) => `- ${p}`),
    '',
    '고치는 법:',
    '- 값 문제: Claude 창이 아닌 따로 연 터미널에서 `npm run e2e:env`로 .env.local 값을 다시 넣어 주세요',
    `- Supabase가 응답하지 않음: ${RESTART}`,
    `- 설정 문제: ${SETTINGS_PAGE}에서 위에 적힌 설정 이름을 맞춰 주세요`,
  ].join('\n')
}
