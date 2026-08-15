import { permanentRedirect } from "next/navigation";

export default async function ProductAliasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/product/${encodeURIComponent(slug)}`);
}
