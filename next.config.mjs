/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: process.env.NEXTAUTH_URL
        ? [new URL(process.env.NEXTAUTH_URL).host, 'localhost:3000']
        : ['localhost:3000'],
    },
  },
  // react-simple-maps y sus deps d3 usan ESM puro → Next.js debe transpilarlos
  transpilePackages: [
    'react-simple-maps',
    'd3-array',
    'd3-interpolate',
  ],
}

export default nextConfig
