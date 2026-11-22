import type { Metadata } from 'next'
import { LocationScreen } from '@/components/location/LocationScreen'
import { guardPage } from '@/lib/auth/guard.server'

// /location 입지 분석 (spec location REQ-7901 · AC-7901.2·AC-7901.3, design.md 14절). 관리자만 연다:
// (app)/layout은 지금 경로를 모르고 앱 공통('/dashboard') 판정만 한다 → 그리기 전에 '/location'으로 문지기를 다시 부른다
// (gate.ts가 /admin과 같이 관리자 경로로 본다 — 관리자가 아닌 원장 /dashboard, 데스크 /sunap, 로그인 안 함 /login).
// 주소에서 읽는 것은 tab(안쪽 탭 일곱 가운데 하나)·c(후보 uuid) 둘이고, 모양이 맞을 때만 넘긴다(없는 후보는 화면이 버린다).
// 병원 id는 넘기지 않는다: 읽기·저장은 RLS·DB 기본값이 내 병원으로 한다. 병원 이름은 한 장 보고서 머리에만 쓴다

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '입지 분석' }

const TABS = ['scan', 'detail', 'listings', 'compare', 'prep', 'sources', 'report'] as const
type Tab = (typeof TABS)[number]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { tab?: string | string[]; c?: string | string[] }

const tabOf = (v: Params['tab']): Tab | undefined => (typeof v === 'string' && (TABS as readonly string[]).includes(v) ? (v as Tab) : undefined)
const idOf = (v: Params['c']): string | undefined => (typeof v === 'string' && UUID.test(v) ? v : undefined)

export default async function LocationPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await guardPage('/location')
  const { tab, c } = await searchParams
  const props = {
    ...(tabOf(tab) ? { tab: tabOf(tab) } : {}),
    ...(idOf(c) ? { candidateId: idOf(c) } : {}),
    ...(me.hospital ? { hospitalName: me.hospital.name } : {}),
  }
  // 'return <'로 시작한다: 문지기 뒤에서만 그린다(tabFrame.test AC-308.3과 같은 모양)
  return <LocationScreen {...props} />
}
