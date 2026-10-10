import type { NextConfig } from "next";

// Recipe saves carry up to 128 MiB of photos (RECIPE_LIMITS.requestBytes) plus multipart framing.
const RECIPE_SAVE_BODY_LIMIT = "129mb";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Signed recipe photos come from the storage host of the Neon recipe-app-dev branch (checked against a real signed URL).
    // The signature lives in the query string, so `search` stays open; the path starts with the bucket, which is not narrowed.
    remotePatterns: [{ protocol: "https", hostname: "br-raspy-waterfall-b4necsu5.storage.c-6.us-east-2.aws.neon.tech", pathname: "/**" }],
  },
  experimental: {
    // Server Action POSTs pass through proxy.ts, which would otherwise buffer (and truncate) bodies at 10 MB.
    proxyClientMaxBodySize: RECIPE_SAVE_BODY_LIMIT,
    serverActions: { bodySizeLimit: RECIPE_SAVE_BODY_LIMIT },
  },
};

export default nextConfig;
