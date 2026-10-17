import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // changelog.md and data/ are read at runtime by server components
  outputFileTracingIncludes: { "/**": ["./changelog.md", "./data/**/*", "./config/**/*"] },
};

export default nextConfig;
