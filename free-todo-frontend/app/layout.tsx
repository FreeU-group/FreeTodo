import type { Metadata } from "next"
import "./globals.css"

interface RootLayoutProps {
  children: React.ReactNode
}

export const metadata: Metadata = {
  title: "Free Todo Canvas",
  description: "Canvas-style layout for calendar and board panels"
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        {children}
      </body>
    </html>
  )
}
