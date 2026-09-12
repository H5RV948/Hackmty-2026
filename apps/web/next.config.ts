import type { NextConfig } from "next";

const config: NextConfig = {
  // Los paquetes del workspace se compilan desde TS sin build previo.
  transpilePackages: ["@banorte/a2ui"],
  experimental: { externalDir: true },
};

export default config;
