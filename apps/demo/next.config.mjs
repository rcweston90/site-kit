/** @type {import('next').NextConfig} */
const nextConfig = {
  // Storage drivers load from node_modules at run time: pg for a hosted
  // Postgres, PGlite (with its WebAssembly files) for the embedded default.
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
  // Keep the demo self-contained: no telemetry-dependent features, no remote images.
  images: { unoptimized: true },
  // Don't write an AGENTS.md into the demo on `next dev`.
  agentRules: false,
  // No floating Next.js badge over the editor's toolbars in development.
  devIndicators: false,
};

export default nextConfig;
