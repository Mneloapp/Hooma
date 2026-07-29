import { AdminProductCatalogPage, type AdminProductParams } from "@/app/admin/products/page";

export default async function AdminAuditedProductsPage({
  searchParams,
}: {
  searchParams: Promise<AdminProductParams>;
}) {
  return <AdminProductCatalogPage searchParams={searchParams} approvedOnly />;
}
