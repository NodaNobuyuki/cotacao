import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres; it must stay a real Node require
  // rather than being traced and bundled into the server output.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Every href in this app -- on the dashboard and on /culturas/[cropId] -- is
  // a computed string (buildHref(...), buildCropHref(...)), never a JSX
  // literal. typedRoutes only validates literal href="..." attributes, so it
  // rejects these regardless of correctness and can't catch a real mistake
  // either way. Not a "not yet"; there is nothing here for it to check.
  typedRoutes: false,
};

export default nextConfig;
