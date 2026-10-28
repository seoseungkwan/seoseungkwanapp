import type { Metadata } from 'next'
import { IBM_Plex_Sans_KR, Space_Grotesk } from 'next/font/google'
import './globals.css'

// 본문·제목은 IBM Plex Sans KR, 숫자·영문 소제목은 Space Grotesk (docs/UI_GUIDE.md). next/font가 빌드 때 받아 우리 쪽에서 낸다
const sans = IBM_Plex_Sans_KR({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})
const num = Space_Grotesk({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-num',
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
    <html lang="ko" className={`${sans.variable} ${num.variable}`}>
      <body>{children}</body>
    </html>
  )
}
