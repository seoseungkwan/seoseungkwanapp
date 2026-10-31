import type { Metadata } from 'next'
import { IBM_Plex_Sans_KR } from 'next/font/google'
import './globals.css'

// 글꼴은 IBM Plex Sans KR 하나 (docs/UI_GUIDE.md, ADR-018). next/font가 빌드 때 받아 우리 쪽에서 낸다. 700은 앱·미리보기의 지금 탭이 쓴다
// 변수 이름은 --font-plex. Tailwind 테마 변수 --font-sans와 겹치지 않게 하고, globals.css가 --font-sans로 잇는다
const sans = IBM_Plex_Sans_KR({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex',
})

export const metadata: Metadata = {
  title: '병원 업무 도구',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={sans.variable}>
      <body>{children}</body>
    </html>
  )
}
