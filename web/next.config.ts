import type { NextConfig } from "next";
import nextBundleAnalyzer from "@next/bundle-analyzer";

const remotePatterns = [
  {
    protocol: "https" as const,
    hostname: "images.unsplash.com",
  },
  {
    protocol: "https" as const,
    hostname: "unsplash.com",
  },
];

const nextConfig: NextConfig = {
  experimental: {},
  images: {
    remotePatterns,
  },
};

// Only enable bundle analyzer when process.env.ANALYZE is 'true'
if (process.env.ANALYZE === "true") {
  const withBundleAnalyzer = nextBundleAnalyzer({
    enabled: true,
  });
  module.exports = withBundleAnalyzer(nextConfig);
} else {
  module.exports = nextConfig;
}
