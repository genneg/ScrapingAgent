import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SwingRadar Data Import',
  description: 'AI-powered festival data extraction and import system',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
