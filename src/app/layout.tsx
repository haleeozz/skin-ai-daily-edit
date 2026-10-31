import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Skin AI — Your daily edit', description: 'Understand the observations in your skin photo. Build a considered, simple daily routine.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
