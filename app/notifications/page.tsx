import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { LocalizedText } from "@/components/LocalizedText";
import { createClient, getProfile } from "@/lib/supabase/server";
import {
  markAllNotificationsReadAction,
  openNotificationAction,
} from "./actions";

export const dynamic = "force-dynamic";

type Notification = {
  id: string;
  title_ka: string;
  title_en: string;
  body_ka: string;
  body_en: string;
  href: string;
  read_at: string | null;
  created_at: string;
};

export default async function NotificationsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/notifications");

  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("notifications")
    .select("id,title_ka,title_en,body_ka,body_en,href,read_at,created_at")
    .eq("recipient_profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = (data ?? []) as Notification[];
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const backHref = profile.role === "customer" ? "/account/orders" : "/admin/orders";

  return (
    <main className="min-h-screen bg-[#fff8f3] px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link className="text-sm font-semibold text-slate-500 hover:text-slate-800" href={backHref}>
              <LocalizedText ka="← უკან დაბრუნება" en="← Go back" />
            </Link>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white">
                <Bell className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-black text-slate-900">
                  <LocalizedText ka="შეტყობინებები" en="Notifications" />
                </h1>
                <p className="text-sm text-slate-500">
                  <LocalizedText
                    ka={`წაუკითხავი: ${unreadCount}`}
                    en={`Unread: ${unreadCount}`}
                  />
                </p>
              </div>
            </div>
          </div>

          {unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                type="submit"
              >
                <CheckCheck className="h-4 w-4" />
                <LocalizedText ka="ყველას წაკითხვა" en="Mark all read" />
              </button>
            </form>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700">
            <LocalizedText
              ka="შეტყობინებები დროებით ვერ ჩაიტვირთა. სცადეთ მოგვიანებით."
              en="Notifications could not be loaded. Please try again later."
            />
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Bell className="mx-auto h-9 w-9 text-slate-300" />
            <h2 className="mt-4 text-lg font-extrabold text-slate-800">
              <LocalizedText ka="შეტყობინებები ჯერ არ გაქვთ" en="No notifications yet" />
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              <LocalizedText
                ka="ახალი შეკვეთები და სტატუსის ცვლილებები აქ გამოჩნდება."
                en="New orders and status updates will appear here."
              />
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <form action={openNotificationAction} key={notification.id}>
                <input name="notification_id" type="hidden" value={notification.id} />
                <button
                  className={`group flex w-full items-start gap-4 rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    notification.read_at
                      ? "border-slate-200 bg-white"
                      : "border-orange-200 bg-orange-50"
                  }`}
                  type="submit"
                >
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      notification.read_at ? "bg-slate-200" : "bg-orange-500"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-extrabold text-slate-900">
                      <LocalizedText ka={notification.title_ka} en={notification.title_en} />
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                      <LocalizedText ka={notification.body_ka} en={notification.body_en} />
                    </span>
                    <span className="mt-2 block text-xs font-medium text-slate-400">
                      {new Intl.DateTimeFormat("ka-GE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Tbilisi",
                      }).format(new Date(notification.created_at))}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-slate-600" />
                </button>
              </form>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
