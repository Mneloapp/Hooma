import type { MetadataRoute } from "next";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/shop", "/shop/", "/product/"],
      disallow: [
        "/admin",
        "/admin/",
        "/api",
        "/api/",
        "/auth",
        "/auth/",
        "/login",
        "/signup",
        "/logout",
        "/account",
        "/account/",
        "/cart",
        "/checkout",
        "/notifications",
        "/search",
        "/_vercel/",
        "/product/*?preview=",
        "/shop?q=",
        "/shop?*q=",
        "/shop/*?q=",
        "/shop/*?*q=",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
