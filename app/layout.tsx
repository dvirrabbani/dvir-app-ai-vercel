import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YUV.AI | Yuval Avidani - AI Builder & Speaker",
  description: "Innovating AI & Development. Building next-generation AI solutions and empowering developers to create transformative experiences. AWS AI Superstar, GitHub Star, Founder of YUV.AI Community.",
  keywords: ["Yuval Avidani", "YUV.AI", "AI Builder", "AI Speaker", "Machine Learning", "Developer", "AWS AI Superstar", "GitHub Star"],
  authors: [{ name: "Yuval Avidani", url: "https://yuv.ai" }],
  icons: {
    icon: [
      { url: "/round-avatar.svg", type: "image/svg+xml" },
    ],
    apple: "/round-avatar.svg",
  },
  openGraph: {
    title: "YUV.AI | Yuval Avidani - AI Builder & Speaker",
    description: "Innovating AI & Development. Building next-generation AI solutions and empowering developers to create transformative experiences.",
    type: "website",
    url: "https://yuv.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "YUV.AI | Yuval Avidani - AI Builder & Speaker",
    description: "Innovating AI & Development. Building next-generation AI solutions and empowering developers.",
    creator: "@yuvai",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}