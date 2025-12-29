import './globals.css';

export const metadata = {
  title: 'Next.js Electron Test',
  description: 'Test transparent window',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        style={{ backgroundColor: 'transparent', background: 'transparent' }}
      >
        {children}
      </body>
    </html>
  );
}

