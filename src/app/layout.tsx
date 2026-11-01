import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lousa Digital de Estudos",
  description: "Mural infinito com post-its, subdivisões, revisão espaçada e caderno de erros. Funciona offline e sincroniza com a nuvem quando disponível.",
  applicationName: "Lousa Digital de Estudos",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: "#f5f3ec" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
