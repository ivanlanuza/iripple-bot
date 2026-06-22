/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["kokoro-js"],
  experimental: {
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
