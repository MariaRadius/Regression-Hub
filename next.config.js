/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['mongodb'],
  // jspdf v4 and jspdf-autotable v5 are ESM-only — transpile so webpack can bundle them
  transpilePackages: ['jspdf', 'jspdf-autotable'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // jsPDF tries to require('canvas') in Node environments; stub it on the client
      config.resolve.alias = { ...config.resolve.alias, canvas: false };
    }
    return config;
  },
};

module.exports = nextConfig;
