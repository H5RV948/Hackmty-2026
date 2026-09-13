import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "driver.js/dist/driver.css";

/**
 * Tipografia de la marca.
 *
 * Banorte usa una sans geometrica (Gotham en su manual de identidad). Gotham es
 * comercial de Hoefler & Co., asi que no se puede empaquetar en el repo.
 * Montserrat es su sustituta libre habitual: mismas formas geometricas, mismo
 * peso visual en titulares.
 *
 * Si el equipo consigue los archivos reales de la marca, el cambio es local a
 * este bloque: `next/font/local` apuntando a los .woff2 y se conserva el resto.
 *
 * next/font descarga y auto-hospeda la fuente en build; no hay request a
 * Google en tiempo de ejecucion. La variable se consume en globals.css.
 */
const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "Asesor financiero",
  description: "Interfaz que el agente construye en tiempo real",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
