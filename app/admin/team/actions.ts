"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { assignableStaffRoles, type StaffRole } from "@/lib/auth/permissions";

export type TeamActionState = { ok?: boolean; message?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const getString = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function isAssignableRole(value: string): value is Exclude<StaffRole, "owner"> {
  return assignableStaffRoles.includes(value as Exclude<StaffRole, "owner">);
}

export async function addStaffByEmailAction(_state: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const actor = await requirePermission("team.manage");
  const admin = createAdminClient() as any;
  if (!actor || !admin) return { message: "Owner-ის სესია ან Supabase service role ვერ მოიძებნა." };

  const email = getString(formData, "email").toLowerCase();
  const role = getString(formData, "role");
  if (!email || !isAssignableRole(role)) return { message: "მიუთითე სწორი ელფოსტა და როლი." };

  const { data: target, error: lookupError } = await admin.from("profiles").select("id,email,role,is_active").ilike("email", email).maybeSingle();
  if (lookupError) return { message: lookupError.message };
  if (!target) return { message: "ამ ელფოსტით ანგარიში ჯერ არ არსებობს. თანამშრომელმა ჯერ Google-ით ან ელფოსტით უნდა შექმნას ანგარიში." };
  if (target.role === "owner") return { message: "Owner-ის როლი ამ გვერდიდან არ იცვლება." };

  const { error } = await admin.rpc("assign_staff_role", { target_profile_id: target.id, requested_role: role, actor_profile_id: actor.id });
  if (error) return { message: error.message };
  revalidatePath("/admin/team");
  return { ok: true, message: "თანამშრომლის როლი მინიჭებულია." };
}

export async function changeStaffRoleAction(formData: FormData) {
  const actor = await requirePermission("team.manage");
  const admin = createAdminClient() as any;
  if (!actor || !admin) return;

  const profileId = getString(formData, "profile_id");
  const role = getString(formData, "role");
  if (!uuidPattern.test(profileId) || !isAssignableRole(role) || profileId === actor.id) return;

  const { data: target } = await admin.from("profiles").select("id,role").eq("id", profileId).maybeSingle();
  if (!target || target.role === "owner") return;
  await admin.rpc("assign_staff_role", { target_profile_id: profileId, requested_role: role, actor_profile_id: actor.id });
  revalidatePath("/admin/team");
}

export async function toggleStaffAccessAction(formData: FormData) {
  const actor = await requirePermission("team.manage");
  const admin = createAdminClient() as any;
  if (!actor || !admin) return;

  const profileId = getString(formData, "profile_id");
  const nextActive = getString(formData, "is_active") === "true";
  if (!uuidPattern.test(profileId) || profileId === actor.id) return;

  const { data: target } = await admin.from("profiles").select("id,role").eq("id", profileId).maybeSingle();
  if (!target || target.role === "owner") return;
  await admin.rpc("set_staff_access", { target_profile_id: profileId, requested_active: nextActive, actor_profile_id: actor.id });
  revalidatePath("/admin/team");
}
