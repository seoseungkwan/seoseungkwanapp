import type { NextConfig } from 'next'
import { buildCsp } from './src/lib/csp'

// CSP·보안 헤더는 파일럿 그대로(plan.md §6-1). 모든 경로에 붙인다
const nextConfig: NextConfig = {
  // 매출 탭은 통계 매출 칸으로 옮겼다 → 옛 주소 /revenue는 /stats로 넘긴다(stats-revenue AC-4110.2).
  // 같은 origin의 고정 경로라 열린 넘기기가 아니다. 쿼리는 Next가 그대로 붙여 넘긴다
  async redirects() {
    return [{ source: '/revenue', destination: '/stats', permanent: false }]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: buildCsp(process.env.NODE_ENV === 'development', process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default nextConfig
