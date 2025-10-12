import "@/styles/globals.css";
import { ThemeProvider } from "@/providers/theme-provider";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Inter, Fira_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import Script from "next/script";
import { createMetadata } from "@/lib/metadata";
import {
  APP_NAME,
  APP_DESCRIPTION,
  COMPANY_NAME,
} from "@/lib/config/constants";
import env from "@/env";

import NextTopLoader from "nextjs-toploader";
import { CookieConsent } from "@/components/cookie-consent";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const firaMono = Fira_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = createMetadata({
  title: {
    template: `%s | ${APP_NAME}`,
    default: `${APP_NAME} - ${APP_DESCRIPTION}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  authors: [{ name: COMPANY_NAME, url: env.NEXT_PUBLIC_APP_URL }],
  creator: COMPANY_NAME,
  publisher: COMPANY_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: env.NEXT_PUBLIC_APP_URL,
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
  // themeColor: [], // Will add later if specific theme colors are defined
  // manifest: "/manifest.json", // Will add later if PWA is implemented
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${firaMono.variable}`}
      suppressHydrationWarning
    >
      <head />
      <body suppressHydrationWarning>
        <NuqsAdapter>
          <ThemeProvider
            attribute={"class"}
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <NextTopLoader color="hsl(var(--primary))" showSpinner={false} />
            {children}
            <Toaster />
            <CookieConsent />
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
