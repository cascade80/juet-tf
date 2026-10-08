import type { Metadata } from "next";
import { Bebas_Neue, Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JUET TECHFEST — Ideas · People · Possibilities",
  description: "Official portal for JUET TECHFEST — Explore events, timeline, gallery, sponsors, and register now.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${outfit.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#050508] text-zinc-100 font-sans selection:bg-purple-600/40 selection:text-white">
        {children}
      </body>
    </html>
  );
}
