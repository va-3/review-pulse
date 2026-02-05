import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next from incorrectly inferring the monorepo/workspace root.
  // This also removes the dev warning about multiple lockfiles.
  outputFileTracingRoot: __dirname,
  // Optimize for containerized deployment (Railway)
  output: "standalone",
};

export default nextConfig;
