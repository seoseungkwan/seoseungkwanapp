import type { NextConfig } from 'next'
import { buildCsp } from './src/lib/csp'

// CSP·보안 헤더는 파일럿 그대로(plan.md §6-1). 모든 경로에 붙이고, /location만 CSP·Referrer를 넓힌다(specs/location AC-7916.2).
// /sunap만 구글 시트 틀(frame-src https://docs.google.com)을 더한 CSP를 쓴다(specs/google-link AC-8504.2, ADR-054)
const nextConfig: NextConfig = {
  // 붙임 PDF 읽기(unpdf, app/api/ai/notices/attachText.ts만 씀)는 PDF.js 묶음을 스스로 동적 import하고 import.meta.resolve를 쓴다.
  // 서버 묶음(webpack)에 넣지 않고 node_modules에서 그대로 불러온다(specs/notices design 14절)
  serverExternalPackages: ['unpdf'],
  // 매출 탭은 통계 매출 칸으로 옮겼다 → 옛 주소 /revenue는 /stats로 넘긴다(stats-revenue AC-4110.2).
  // 같은 origin의 고정 경로라 열린 넘기기가 아니다. 쿼리는 Next가 그대로 붙여 넘긴다
  async redirects() {
    return [{ source: '/revenue', destination: '/stats', permanent: false }]
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development'
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    // 입지 분석(/location·/location/…)만 카카오 지도 origin을 더한 CSP와, 카카오가 사이트를 알아보게 사이트 이름만 보내는 Referrer(ADR-044).
    // 전체 줄 뒤에 둔다 — Next는 같은 이름 머리를 뒤 줄로 덮는다. nosniff·DENY는 전체 줄 그대로
    const location = [
      { key: 'Content-Security-Policy', value: buildCsp(isDev, supabaseUrl, { kakao: true }) },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ]
    // 수납일지(/sunap·/sunap/…)만 구글 시트 틀을 띄운다 — CSP 머리 하나만 덮고 Referrer는 전체 줄 no-referrer 그대로(틀도 referrerPolicy no-referrer)
    const sunap = [{ key: 'Content-Security-Policy', value: buildCsp(isDev, supabaseUrl, { sheetFrame: true }) }]
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: buildCsp(isDev, supabaseUrl) },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      { source: '/location', headers: location },
      { source: '/location/:path*', headers: location },
      { source: '/sunap', headers: sunap },
      { source: '/sunap/:path*', headers: sunap },
    ]
  },
}

export default nextConfig
