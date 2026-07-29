import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const bundleId = process.env.HOOMA_IOS_BUNDLE_ID?.trim() || "ge.hooma.app";
  const details = teamId ? [{
    appIDs: [`${teamId}.${bundleId}`],
    components: [
      { "/": "/mobile/*", comment: "BOG results and mobile universal links" },
      { "/": "/auth/*", comment: "Authentication callbacks" },
    ],
  }] : [];
  return NextResponse.json(
    { applinks: { apps: [], details } },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json",
      },
    },
  );
}
