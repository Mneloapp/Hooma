import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "makerworld.bblmw.com" },
      { protocol: "https", hostname: "**.bblmw.com" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/product-media/**" },
    ],
  },
};

export default nextConfig;
