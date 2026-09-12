import type { Metadata } from "next";
import "./globals.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "driver.js/dist/driver.css";

export const metadata: Metadata = {
  title: "Asesor financiero",
  description: "Interfaz que el agente construye en tiempo real",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
