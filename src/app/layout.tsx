/* src/app/layout.tsx */
import type { Metadata } from 'next';
import { Newsreader, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import 'katex/dist/katex.min.css';
import AppLayout from '../components/AppLayout';
import { HikmaProvider } from '../context/HikmaContext';
import { AuthProvider } from '../context/AuthContext';

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  display: 'swap',
  style: ['normal', 'italic'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Maktaba — A Living Library of Curated Knowledge',
  description: 'In the spirit of Bayt al-Hikma, a personal knowledge base and AI research companion.',
  keywords: 'knowledge base, personal library, research, study, notes, computer science, mathematics, humanities',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AuthProvider>
          <HikmaProvider>
            <AppLayout>{children}</AppLayout>
          </HikmaProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
