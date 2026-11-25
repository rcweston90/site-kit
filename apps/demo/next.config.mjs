/** @type {import('next').NextConfig} */
const nextConfig = {
  // Postgres is optional and loaded only when DATABASE_URL is set.
  serverExternalPackages: ['pg'],
  // Keep the demo self-contained: no telemetry-dependent features, no remote images.
  images: { unoptimized: true },
};

export default nextConfig;
