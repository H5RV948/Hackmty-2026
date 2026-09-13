/**
 * Tipo de `createPortal`, lo unico que usamos de react-dom.
 *
 * El monorepo no trae `@types/react-dom`, y agregarlo implica instalar dentro
 * del contenedor, que es de las cosas que ya sabemos que rompen (AGENTS.md,
 * seccion 8: el volumen anonimo de node_modules se pierde al recrear). Sin
 * tipos, el import queda como `any` implicito y el modo estricto lo rechaza.
 *
 * Se declara solo la firma que se usa, con sus tipos reales de @types/react.
 * Si algun dia se instala @types/react-dom, este archivo sobra: borralo.
 */
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";

  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string | null,
  ): ReactPortal;
}
