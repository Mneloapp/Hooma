import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
