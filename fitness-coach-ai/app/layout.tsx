import type { Metadata } from 'next';
import { Montserrat, Bebas_Neue } from 'next/font/google';
import './globals.css';
import Providers from './components/Providers';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['300', '400', '500', '600', '700', '800', '900'],
});

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  variable: '--font-bebas',
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Gerardi Performance - AI Coach',
  description: 'Your personal AI fitness coach trained on proven methodologies',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} ${bebasNeue.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
