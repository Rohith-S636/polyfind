/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js 16 enables Turbopack by default. The extensionAlias webpack option
  // is not needed under Turbopack (it resolves .ts/.tsx natively), so we
  // declare an empty turbopack config to signal intentional compatibility and
  // suppress the "webpack config with no turbopack config" build error.
  turbopack: {},
  async rewrites() {
    const apiBase = process.env.POLYFIND_API_URL || "http://127.0.0.1:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
