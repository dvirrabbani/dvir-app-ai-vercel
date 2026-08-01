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
  title: "DVIR.AI | Dvir Rabbani - AI Builder & Speaker",
  description: "Innovating AI & Development. Building next-generation AI solutions and empowering developers to create transformative experiences. AWS AI Superstar, GitHub Star, Founder of DVIR.AI Community.",
  keywords: ["Dvir Rabbani", "DVIR.AI", "AI Builder", "AI Speaker", "Machine Learning", "Developer", "AWS AI Superstar", "GitHub Star"],
  authors: [{ name: "Dvir Rabbani", url: "https://yuv.ai" }],
  icons: {
    icon: [
      { url: "/robot-avatar.svg", type: "image/svg+xml" },
    ],
    apple: "/robot-avatar.svg",
  },
  openGraph: {
    title: "DVIR.AI | Dvir Rabbani - AI Builder & Speaker",
    description: "Innovating AI & Development. Building next-generation AI solutions and empowering developers to create transformative experiences.",
    type: "website",
    url: "https://yuv.ai",
  },
  twitter: {
    card: "summary_large_image",
    title: "DVIR.AI | Dvir Rabbani - AI Builder & Speaker",
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