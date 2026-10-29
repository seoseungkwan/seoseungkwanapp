import type { NextConfig } from 'next'
import { buildCsp } from './src/lib/csp'

// CSP·보안 헤더는 파일럿 그대로(plan.md §6-1). 모든 경로에 붙인다
const nextConfig: NextConfig = {
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
