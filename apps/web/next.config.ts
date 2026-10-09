import type { NextConfig } from "next";

// Recipe saves carry up to 128 MiB of photos (RECIPE_LIMITS.requestBytes) plus multipart framing.
const RECIPE_SAVE_BODY_LIMIT = "129mb";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Server Action POSTs pass through proxy.ts, which would otherwise buffer (and truncate) bodies at 10 MB.
    proxyClientMaxBodySize: RECIPE_SAVE_BODY_LIMIT,
    serverActions: { bodySizeLimit: RECIPE_SAVE_BODY_LIMIT },
  },
};

export default nextConfig;
