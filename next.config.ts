import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres; it must stay a real Node require
  // rather than being traced and bundled into the server output.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Every link on the dashboard targets "/" with a different query string.
  // typedRoutes can only check the pathname, so it rejects those hrefs without
  // catching any real mistake. Re-enable once there are pathname routes worth
  // checking (e.g. /culturas/[cropId] in Phase 2).
  typedRoutes: false,
};

export default nextConfig;
