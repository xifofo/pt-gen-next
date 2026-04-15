import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  async rewrites() {
    return {
      beforeFiles: [
        // Compatible with original pt-gen-cfworker: API requests at /
        { source: "/", destination: "/api", has: [{ type: "query", key: "url" }] },
        { source: "/", destination: "/api", has: [{ type: "query", key: "site" }] },
        { source: "/", destination: "/api", has: [{ type: "query", key: "search" }] },
        { source: "/", destination: "/api", has: [{ type: "query", key: "source" }] },
        { source: "/", destination: "/api", has: [{ type: "query", key: "apikey" }] },
        { source: "/", destination: "/api", has: [{ type: "query", key: "key" }] },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
