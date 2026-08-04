import type { Metadata } from "next";
import { Figtree, Newsreader } from "next/font/google";
import "./globals.css";
import LocaleProvider from '@/app/Components/LocaleProvider';

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://virafi.com"),
  title: {
    default: "Virafi",
    template: "%s | Virafi",
  },
  description: "Tu CFO personal revisa tus finanzas todos los días y te guía hasta cumplir tus metas.",
  applicationName: "Virafi",
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "Virafi",
    title: "Virafi — Tu CFO personal, todos los días",
    description: "Un CFO proactivo que revisa tus números, detecta desvíos y te guía hasta cumplir tus metas financieras.",
  },
  twitter: {
    card: "summary",
    title: "Virafi — Tu CFO personal, todos los días",
    description: "Revisión diaria, decisiones concretas y seguimiento proactivo para cumplir tus metas financieras.",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX" translate="no" className={`notranslate h-full antialiased ${figtree.variable} ${newsreader.variable}`}>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
