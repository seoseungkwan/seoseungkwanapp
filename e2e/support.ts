// Playwright 접착: worker 범위 fixture `accounts`. E2E 시험은 '@playwright/test' 대신 여기서 test·expect를 가져온다.
// 역할마다 한 번 로그인해(Supabase 토큰 요청 제한) 실행 내내 다시 쓰고, 페이지를 열기 전에 세션 쿠키를 브라우저에 넣는다.
// 단위 시험 없음 — TASK-7~9 E2E가 쓰면서 확인된다. 세션 쿠키 만들기·옮기기는 lib/session.ts(단위 시험 있음)
// CRITICAL: 이메일·uid·토큰·쿠키·응답 내용은 메시지·console에 내보내지 않는다
import { test as base, expect, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { APP_HOST } from './config'
import { readE2eEnv, startProblemMessage, type E2eEnv, type Role } from './lib/env'
import { accountProblem, passwordSession, signInCookies, type AccountState, type CookieToSet } from './lib/session'

export type Accounts = {
  // 처음이면 로그인 + 계정 상태 확인(다르면 던짐). 캐시한 세션 쿠키를 context에 넣는다
  signIn(context: BrowserContext, role: Role): Promise<void>
  // 같은 세션의 supabase-js 클라이언트(RLS 확인용)
  client(role: Role): Promise<SupabaseClient>
  // 비교용 — 출력 금지
  userId(role: Role): Promise<string>
  // 비교용 — 출력 금지
  email(role: Role): string
  // 앱 [로그아웃](전역 signOut)으로 끊긴 세션을 캐시에서 버린다. 다음 signIn이 다시 로그인한다
  forget(role: Role): void
  // 공개 열쇠만 쓴 클라이언트(로그인 안 함)
  anon(): SupabaseClient
}

type Session = { client: SupabaseClient; userId: string; cookies: CookieToSet[] }

// 값이 없으면 건너뛰지 않고 실패한다(skip은 "0 failed"로 통과처럼 보인다). 문제 목록에는 이름만 있다
function readEnvOrThrow(): E2eEnv {
  const result = readE2eEnv(process.env)
  if (!result.ok) throw new Error(startProblemMessage(result.problems))
  return result.value
}

// PostgREST·Postgres 오류 코드(42P01·PGRST116 등)만 담는다. 오류 문구에는 값이 들어갈 수 있다
const SAFE_CODE = /^[A-Za-z0-9_]{1,16}$/

// 앱(lib/auth/hospital.server.ts)처럼 내 병원 줄·관리자 줄만 읽는다(RLS 아래, 쓰지 않음)
async function readState(role: Role, session: Session): Promise<AccountState> {
  const [hospital, admin] = await Promise.all([
    session.client
      .from('hospitals')
      .select('status')
      .eq('owner_id', session.userId)
      .maybeSingle<{ status: NonNullable<AccountState['hospitalStatus']> }>(),
    session.client.from('admins').select('user_id').eq('user_id', session.userId).maybeSingle<{ user_id: string }>(),
  ])
  const error = hospital.error ?? admin.error
  if (error !== null) {
    const code = typeof error.code === 'string' && SAFE_CODE.test(error.code) ? error.code : '오류 코드 없음'
    throw new Error(
      `${role} 시험 계정의 병원·관리자 줄을 읽지 못했어요(${code}) — Supabase SQL 편집기에서 마이그레이션을 적용했는지 확인해 주세요`,
    )
  }
  return { hospitalStatus: hospital.data?.status ?? null, isAdmin: admin.data !== null }
}

async function quietSignOut(session: Session): Promise<void> {
  try {
    // 이 세션만 끊는다(같은 계정의 다른 세션은 그대로)
    await session.client.auth.signOut({ scope: 'local' })
  } catch {
    // 끝 정리라 실패해도 조용히(값 출력 없음)
  }
}

async function login(env: E2eEnv, role: Role): Promise<Session> {
  const session = await passwordSession({ env, role })
  let problem: string | null
  try {
    problem = accountProblem(role, await readState(role, session))
  } catch (error) {
    await quietSignOut(session)
    throw error
  }
  if (problem !== null) {
    await quietSignOut(session)
    throw new Error(problem)
  }
  return session
}

export const test = base.extend<object, { accounts: Accounts }>({
  accounts: [
    // Playwright는 첫 인자의 객체 구조 분해로 fixture 의존을 읽는다(의존 없음 = 빈 패턴).
    // 두 번째 인자 이름은 `use` 대신 `provide`(react-hooks 린트가 `use`를 훅으로 오해한다)
    async ({}, provide) => {
      const env = readEnvOrThrow()
      const sessions = new Map<Role, Promise<Session>>()
      let anonClient: SupabaseClient | undefined

      const session = (role: Role): Promise<Session> => {
        const cached = sessions.get(role)
        if (cached !== undefined) return cached
        const started = login(env, role)
        sessions.set(role, started)
        // 실패한 로그인은 캐시에 두지 않는다(다음 시험이 다시 시도한다)
        started.catch(() => {
          if (sessions.get(role) === started) sessions.delete(role)
        })
        return started
      }

      const accounts: Accounts = {
        async signIn(context, role) {
          const { cookies } = await session(role)
          // 세션 쿠키 + 움직임 쿠키(app-active). 움직임 쿠키가 없으면 middleware가 로그인을 끊는다(ADR-023)
          await context.addCookies(signInCookies(cookies, APP_HOST, Math.floor(Date.now() / 1000)))
        },
        async client(role) {
          return (await session(role)).client
        },
        async userId(role) {
          return (await session(role)).userId
        },
        email(role) {
          return env.accounts[role].email
        },
        forget(role) {
          sessions.delete(role)
        },
        anon() {
          anonClient ??= createClient(env.supabaseUrl, env.anonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          })
          return anonClient
        },
      }

      await provide(accounts)

      // worker 끝: 캐시한 세션마다 이 세션만 끊는다. 로그인에 실패한 역할은 건너뛴다
      const open = await Promise.allSettled([...sessions.values()])
      await Promise.all(open.map((r) => (r.status === 'fulfilled' ? quietSignOut(r.value) : undefined)))
    },
    // auto: 이 test를 쓰는 모든 시험이 값 검사를 거친다(accounts를 안 쓰는 시험도 값이 없으면 실패)
    { scope: 'worker', auto: true },
  ],
})

export { expect }
