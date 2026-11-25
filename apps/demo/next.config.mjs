/** @type {import('next').NextConfig} */
const nextConfig = {
  // Postgres is optional and loaded only when DATABASE_URL is set.
  serverExternalPackages: ['pg'],
  // Keep the demo self-contained: no telemetry-dependent features, no remote images.
  images: { unoptimized: true },
  // Don't write an AGENTS.md into the demo on `next dev`.
  agentRules: false,
  // No floating Next.js badge over the editor's toolbars in development.
  devIndicators: false,
};

export default nextConfig;
