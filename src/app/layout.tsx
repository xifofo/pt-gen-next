import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const serif = DM_Serif_Display({
  weight: "400",
  variable: "--font-serif",
  subsets: ["latin"],
});

const sans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PT-Gen Next",
  description: "Media description generator for Private Trackers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
