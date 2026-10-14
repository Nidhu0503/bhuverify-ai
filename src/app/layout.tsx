import type { Metadata } from 'next';
import { READING_PREFERENCES_BOOTSTRAP } from '@/lib/accessibility';
import { THEME_BOOTSTRAP } from '@/lib/theme';
import './globals.css';
import '@/components/learning-center.css';
import './reading-layout.css';
import './theme.css';
export const metadata: Metadata = {
  title: 'BhuVerify AI Prototype',
  description: 'No-login Bihar document comparison prototype with browser-saved cases and server-side Gemini. Extraction live-tested; live case Q&A remains unverified after provider service errors. No Firebase or official-record verification.',
  openGraph: {
    title: 'BhuVerify AI Prototype',
    description: 'No-login Bihar document comparison prototype with browser-saved cases and server-side Gemini. Extraction live-tested; live case Q&A remains unverified after provider service errors. No Firebase or official-record verification.',
  },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: READING_PREFERENCES_BOOTSTRAP + '\n' + THEME_BOOTSTRAP }} /></head><body>{children}</body></html>;
}
