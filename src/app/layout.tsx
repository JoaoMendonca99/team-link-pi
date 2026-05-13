import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const TEAM_LINK_DESCRIPTION =
  "Plataforma para publicação, descoberta e formação de equipes em projetos colaborativos";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://team-link.vercel.app"),
  title: {
    default: "Team Link",
    template: "%s | Team Link",
  },
  description: TEAM_LINK_DESCRIPTION,
  keywords:
    "Team Link, colaboração, projetos, equipes, estudantes, descoberta, inovação",
  authors: [{ name: "Team Link" }],
  openGraph: {
    title: "Team Link",
    description: TEAM_LINK_DESCRIPTION,
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Team Link",
    description: TEAM_LINK_DESCRIPTION,
  },
  robots: "index, follow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Team Link",
    description: TEAM_LINK_DESCRIPTION,
    url: "https://team-link.vercel.app",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://team-link.vercel.app/explorar?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
