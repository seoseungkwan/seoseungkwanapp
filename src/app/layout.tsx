import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// 글꼴은 Pretendard 하나 (ADR-019, specs/b2b-redesign REQ-203). pretendard@1.3.9 정적 subset 세 굵기를 고치지 않고 우리 쪽에서 낸다(src/app/fonts/, OFL.txt)
// 변수 이름은 --font-pretendard. Tailwind 테마 변수 --font-sans와 겹치지 않게 하고, globals.css가 --font-sans로 잇는다
const pretendard = localFont({
  src: [
    { path: './fonts/Pretendard-Regular.subset.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Pretendard-Medium.subset.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Pretendard-SemiBold.subset.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-pretendard',
})

// 브라우저 탭 이름 (ui-90 REQ-402): 화면마다 "<화면 이름> · 병원 업무 도구". 앱 화면은 (app)/layout이 뒤를 의원 이름으로 바꾼다
export const metadata: Metadata = {
  title: { template: '%s · 병원 업무 도구', default: '병원 업무 도구' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>{children}</body>
    </html>
  )
}
