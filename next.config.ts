import type { NextConfig } from "next";

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  async headers() {
    if (process.env.VERCEL_ENV !== "preview") return [];
    return [{
      source: "/:path*",
      headers: [{
        key: "X-Robots-Tag",
        value: "noindex, nofollow, noarchive",
      }],
    }];
  },
  images: {
    // Hooma serves catalog media directly from the source CDN/Supabase.
    // This keeps the storefront independent of Vercel image-transformation quotas.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "makerworld.bblmw.com" },
      { protocol: "https", hostname: "**.bblmw.com" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/product-media/**" },
    ],
  },
};

export default nextConfig;
