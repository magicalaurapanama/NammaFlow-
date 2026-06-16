/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@orr-pulse/shared'],
};

export default nextConfig;
