import type { Metadata } from 'next'
import { Literata, Public_Sans } from 'next/font/google'
import './globals.css'

const serif = Literata({ subsets: ['latin'], variable: '--font-serif' })
const sans = Public_Sans({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Preksha Foundation',
  description: 'Trainer, centre and certificate management for Preksha Foundation',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
