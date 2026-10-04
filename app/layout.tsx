import type { Metadata } from "next";
import "./globals.css";
import { ForgeProvider } from "../components/ForgeProvider";

export const metadata: Metadata = {
  title: "FORGE — Build momentum",
  description: "A focused, gamified productivity alpha.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ForgeProvider>{children}</ForgeProvider>
      </body>
    </html>
  );
}
