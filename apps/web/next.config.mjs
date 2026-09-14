/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@gharibo/shared"],
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
