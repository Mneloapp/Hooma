import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartProvider } from "@/components/CartContext";
import { CartDrawer } from "@/components/CartDrawer";
import { LanguageProvider } from "@/components/LanguageProvider";

export const metadata: Metadata = {
  title: "Hooma | სასარგებლო ნივთები ყოველდღიურობისთვის",
  description: "შეკვეთით დამზადებული სასარგებლო ნივთები. მზადდება თბილისში 3 სამუშაო დღეში.",
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
          </CartProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
