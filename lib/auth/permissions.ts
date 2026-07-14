import type { UserRole } from "@/lib/supabase/types";

export type StaffRole = Exclude<UserRole, "customer">;
export type Permission =
  | "admin.access"
  | "catalog.manage"
  | "inventory.manage"
  | "orders.manage"
  | "quotes.manage"
  | "production.manage"
  | "customers.read"
  | "pricing.manage"
  | "team.manage";

export const staffRoles: StaffRole[] = ["owner", "admin", "catalog_manager", "production_operator", "support"];

export const assignableStaffRoles: Array<Exclude<StaffRole, "owner">> = [
  "admin",
  "catalog_manager",
  "production_operator",
  "support",
];

export const roleLabels: Record<UserRole, string> = {
  owner: "Owner",
  admin: "ადმინისტრატორი",
  catalog_manager: "კატალოგის მენეჯერი",
  production_operator: "წარმოების ოპერატორი",
  support: "მომხმარებლის მხარდაჭერა",
  customer: "მომხმარებელი",
};

const rolePermissions: Record<UserRole, Permission[]> = {
  owner: ["admin.access", "catalog.manage", "inventory.manage", "orders.manage", "quotes.manage", "production.manage", "customers.read", "pricing.manage", "team.manage"],
  admin: ["admin.access", "catalog.manage", "inventory.manage", "orders.manage", "quotes.manage", "production.manage", "customers.read", "pricing.manage"],
  catalog_manager: ["admin.access", "catalog.manage"],
  production_operator: ["admin.access", "inventory.manage", "orders.manage", "production.manage"],
  support: ["admin.access", "orders.manage", "quotes.manage", "customers.read"],
  customer: [],
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && value in rolePermissions;
}

export function isStaffRole(value: unknown): value is StaffRole {
  return isUserRole(value) && value !== "customer";
}

export function hasPermission(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

const routePermissions: Array<[string, Permission]> = [
  ["/admin/team", "team.manage"],
  ["/admin/settings", "pricing.manage"],
  ["/admin/imports", "catalog.manage"],
  ["/admin/products", "catalog.manage"],
  ["/admin/inventory", "inventory.manage"],
  ["/admin/production", "production.manage"],
  ["/admin/custom-orders", "quotes.manage"],
  ["/admin/orders", "orders.manage"],
  ["/admin/customers", "customers.read"],
];

export function canAccessAdminPath(role: UserRole, pathname: string) {
  if (!hasPermission(role, "admin.access")) return false;
  const match = routePermissions.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? hasPermission(role, match[1]) : pathname === "/admin";
}

export function defaultAdminPath(role: UserRole) {
  if (role === "owner" || role === "admin") return "/admin";
  if (hasPermission(role, "catalog.manage")) return "/admin/products";
  if (hasPermission(role, "production.manage")) return "/admin/production";
  if (hasPermission(role, "orders.manage")) return "/admin/orders";
  return "/admin";
}
