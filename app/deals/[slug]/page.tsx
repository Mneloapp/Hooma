import { redirect } from "next/navigation";

export default async function LegacyDailyDealProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/product/${encodeURIComponent(slug)}`);
}
