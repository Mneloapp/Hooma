"use client";

import { useActionState } from "react";
import { addStaffByEmailAction } from "@/app/admin/team/actions";
import { assignableStaffRoles, roleLabels } from "@/lib/auth/permissions";

export function AddStaffForm() {
  const [state, action, pending] = useActionState(addStaffByEmailAction, {});

  return (
    <form action={action} className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft">
      <h2 className="text-xl font-semibold">თანამშრომლის დამატება</h2>
      <p className="mt-2 text-sm leading-6 text-hooma-muted">თანამშრომელმა ჯერ უნდა შექმნას Hooma ანგარიში. შემდეგ აქ მიუთითე ზუსტად იგივე ელფოსტა და მიანიჭე სამუშაო როლი.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_240px_auto]">
        <label className="text-sm font-medium">ანგარიშის ელფოსტა<input name="email" type="email" required placeholder="employee@gmail.com" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <label className="text-sm font-medium">როლი<select name="role" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent">{assignableStaffRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
        <button disabled={pending} className="self-end rounded-full bg-hooma-text px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "ინახება..." : "როლის მინიჭება"}</button>
      </div>
      {state.message ? <p className={`mt-4 rounded-xl p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p> : null}
    </form>
  );
}
