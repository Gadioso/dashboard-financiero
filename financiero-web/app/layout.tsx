import type { Metadata } from "next";
import { Figtree, Newsreader } from "next/font/google";
import "./globals.css";

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
  description: "Virafi te ayuda a ver tu dinero con claridad y rumbo.",
  applicationName: "Virafi",
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "Virafi",
    title: "Virafi — Tu dinero, con claridad y rumbo",
    description: "Cuentas, metas, patrimonio y mercados convertidos en un plan financiero y próximos pasos claros.",
  },
  twitter: {
    card: "summary",
    title: "Virafi — Tu dinero, con claridad y rumbo",
    description: "Una visión financiera conectada para personas y negocios en Latinoamérica.",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`h-full antialiased ${figtree.variable} ${newsreader.variable}`}>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
