import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '병원 업무 도구',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
