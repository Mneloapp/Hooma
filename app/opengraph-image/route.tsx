import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const logo = await readFile(path.join(process.cwd(), "public", "brand", "hooma-logo.png"));
  const logoSource = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 84px", color: "#24324A", background: "linear-gradient(135deg, #FFF8F2 0%, #FFECE4 52%, #DDEBFF 100%)", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSource} alt="Hooma" width="414" height="347" style={{ objectFit: "contain" }} />
        <div style={{ width: 96, height: 12, borderRadius: 999, background: "#CF4328" }} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ width: 88, height: 88, borderRadius: 28, background: "#CF4328" }} />
          <div style={{ width: 88, height: 88, borderRadius: 44, background: "#FFC857" }} />
          <div style={{ width: 88, height: 88, borderRadius: 28, background: "#24324A" }} />
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>hooma.ge</div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}
