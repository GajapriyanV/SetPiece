import type { Metadata } from "next";
import { Oswald, Roboto_Mono, Familjen_Grotesk } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/layout/TopNav";
import HeroCursor from "@/components/landing/HeroCursor";

const oswald = Oswald({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-oswald",
});

const robotoMono = Roboto_Mono({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});

const familjenGrotesk = Familjen_Grotesk({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "SetPiece — Where Football Arguments Get Settled",
  description:
    "Live voice debates on football topics. Two speakers argue, the audience votes, and Elo ratings update in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${oswald.variable} ${robotoMono.variable} ${familjenGrotesk.variable}`}
      >
        <HeroCursor />
        <TopNav />
        {children}
      </body>
    </html>
  );
}
