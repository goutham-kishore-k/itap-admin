import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'iTAP', template: '%s | iTAP' },
  description: 'iTAP Technologies – HR & Admin Platform',
  icons: {
    icon: '/images/itap-logo.png',
    apple: '/images/itap-logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
