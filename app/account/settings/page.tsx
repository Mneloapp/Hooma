export default function AccountSettingsPage() {
  return (
    <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Settings</p>
      <h1 className="mt-3 text-4xl font-medium">Account settings</h1>
      <p className="mt-4 text-hooma-muted">Password and email preferences remain managed by Supabase Auth.</p>
    </div>
  );
}
