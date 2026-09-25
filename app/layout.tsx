import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: '赛事赛程',
  description: '双败淘汰制赛程展示与管理',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-base text-fg">
        <header className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight hover:text-wb">
              赛事赛程
            </Link>
            <Link href="/admin/" className="text-sm text-muted hover:text-fg">
              管理
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
