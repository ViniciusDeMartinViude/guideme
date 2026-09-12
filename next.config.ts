import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // grammY and the Anthropic SDK are plain Node packages; keep them out of the bundler.
  serverExternalPackages: ["grammy", "@anthropic-ai/sdk"],
};

export default nextConfig;
