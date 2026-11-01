import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (banco local embutido) carrega WASM e usa o sistema de arquivos: não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
