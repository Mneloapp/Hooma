import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartProvider } from "@/components/CartContext";
import { CartDrawer } from "@/components/CartDrawer";
import { LanguageProvider } from "@/components/LanguageProvider";
import { HoomaAssistant } from "@/components/assistant/HoomaAssistant";
import { WebAnalytics } from "@/components/WebAnalytics";
import { DEFAULT_DESCRIPTION, DEFAULT_SOCIAL_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "Hooma — პრაქტიკული ნივთები ყოველდღიურობისთვის",
    template: "%s | Hooma",
  },
  description: DEFAULT_DESCRIPTION,
  icons: {
    icon: "/brand/hooma-symbol.png",
  },
  openGraph: {
    type: "website",
    locale: "ka_GE",
    siteName: SITE_NAME,
    title: "Hooma — პრაქტიკული ნივთები ყოველდღიურობისთვის",
    description: DEFAULT_DESCRIPTION,
    images: [{ url: DEFAULT_SOCIAL_IMAGE, alt: "Hooma", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hooma — პრაქტიკული ნივთები ყოველდღიურობისთვის",
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_SOCIAL_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ka">
      <body className="font-sans antialiased">
        <LanguageProvider>
          <CartProvider>
            <Header />
            <main>{children}</main>
            <Footer />
            <CartDrawer />
            <HoomaAssistant />
            <WebAnalytics />
          </CartProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
