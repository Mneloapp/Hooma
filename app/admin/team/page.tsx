import { AddStaffForm } from "@/components/admin/AddStaffForm";
import { changeStaffRoleAction, toggleStaffAccessAction } from "./actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignableStaffRoles, roleLabels } from "@/lib/auth/permissions";
import type { Profile } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function TeamPage() {
  const actor = await requirePermission("team.manage");
  if (!actor) redirect("/login?next=/admin/team");
  const admin = createAdminClient() as any;
  const { data } = admin
    ? await admin.from("profiles").select("id,email,full_name,role,is_active,last_login_at,created_at").neq("role", "customer").order("created_at")
    : { data: [] };
  const staff = (data ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Access control</p><h1 className="mt-3 text-4xl font-semibold">გუნდი და უფლებები</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">ამ გვერდს მხოლოდ Owner ხედავს. ახალი ანგარიში ყოველთვის მომხმარებელია; სამუშაო როლის მინიჭება და გაუქმება მხოლოდ აქედან ხდება.</p></div>
      <AddStaffForm />
      <div className="overflow-hidden rounded-[1.5rem] bg-white/75 shadow-soft">
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-hooma-panel text-xs uppercase tracking-[0.14em] text-hooma-muted"><tr><th className="px-5 py-4">თანამშრომელი</th><th className="px-5 py-4">როლი</th><th className="px-5 py-4">ბოლო შესვლა</th><th className="px-5 py-4">წვდომა</th></tr></thead>
          <tbody className="divide-y divide-hooma-text/10">{staff.length ? staff.map((member) => <tr key={member.id}>
            <td className="px-5 py-4"><span className="font-medium">{member.full_name || "სახელი არ არის მითითებული"}</span><span className="block text-xs text-hooma-muted">{member.email}</span></td>
            <td className="px-5 py-4">{member.role === "owner" ? <span className="rounded-full bg-hooma-text px-3 py-1 text-xs text-white">Owner</span> : <form action={changeStaffRoleAction} className="flex items-center gap-2"><input type="hidden" name="profile_id" value={member.id} /><select name="role" defaultValue={member.role} className="rounded-full border border-hooma-text/10 bg-white px-3 py-2">{assignableStaffRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select><button className="rounded-full border border-hooma-text/10 px-3 py-2 text-xs font-semibold">შენახვა</button></form>}</td>
            <td className="px-5 py-4 text-hooma-muted">{member.last_login_at ? new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(member.last_login_at)) : "ჯერ არ შესულა"}</td>
            <td className="px-5 py-4">{member.role === "owner" ? <span className="text-xs text-hooma-muted">მუდმივად აქტიური</span> : <form action={toggleStaffAccessAction}><input type="hidden" name="profile_id" value={member.id} /><input type="hidden" name="is_active" value={String(!member.is_active)} /><button className={`rounded-full px-4 py-2 text-xs font-semibold ${member.is_active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{member.is_active ? "აქტიურია · გათიშვა" : "გათიშულია · ჩართვა"}</button></form>}</td>
          </tr>) : <tr><td colSpan={4} className="px-5 py-10 text-center text-hooma-muted">Migration-ის გაშვების შემდეგ Owner და თანამშრომლები აქ გამოჩნდება.</td></tr>}</tbody>
        </table></div>
      </div>
      <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>უსაფრთხოების წესი:</strong> Owner-ის როლი UI-დან არ ენიჭება და არ ითიშება. პირველი Owner ერთხელ იქმნება Supabase SQL Editor-იდან CEO-ს ანგარიშზე.</div>
    </div>
  );
}
