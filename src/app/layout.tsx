import type { Metadata, Viewport } from "next";
import { Outfit, Shippori_Mincho_B1 } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"] });
const shippori = Shippori_Mincho_B1({ variable: "--font-shippori", subsets: ["latin"], weight: ["600", "800"] });

export const metadata: Metadata = {
  title: { default: "Raijin Sushi · Peça online", template: "%s · Raijin Sushi" },
  description: "Sushi, temaki e pokes em Ivoti. Peça online e acompanhe em tempo real.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Raijin", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f3ece1", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} ${shippori.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
