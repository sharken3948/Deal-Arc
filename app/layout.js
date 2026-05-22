import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/app/contexts/WalletContext";
import WalletModal from "@/app/components/WalletModal";
import Providers from "@/app/components/Providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "DealARC — AI-Powered Escrow on ARC Testnet",
  description: "Secure USDC and NFT escrow powered by Turnkey and Claude AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">
        <Providers>
          <WalletProvider>
            <WalletModal />
            {children}
          </WalletProvider>
        </Providers>
      </body>
    </html>
  );
}
