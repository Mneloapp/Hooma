"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { useCart } from "@/components/CartContext";
import { createOrderAction } from "@/app/auth/actions";

export function CheckoutForm() {
  const { items, clearCart } = useCart();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const hasPaymentPrice = useMemo(() => items.some((item) => typeof item.price === "number"), [items]);

  function submit(formData: FormData) {
    const payload = {
      guest_email: String(formData.get("guest_email") ?? ""),
      guest_phone: String(formData.get("guest_phone") ?? ""),
      full_name: String(formData.get("full_name") ?? ""),
      city: String(formData.get("city") ?? ""),
      address_line_1: String(formData.get("address_line_1") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      items,
    };
    const actionData = new FormData();
    actionData.set("payload", JSON.stringify(payload));
    startTransition(async () => {
      const result = await createOrderAction(actionData);
      setMessage(result.message);
      if (result.ok) clearCart();
    });
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
      <form action={submit} className="space-y-5 rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">Checkout</p>
          <h1 className="mt-3 text-3xl font-medium">Order request</h1>
          <p className="mt-3 text-hooma-muted">Online checkout coming soon. Contact us to order.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Full name<input name="full_name" required className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
          <label className="block text-sm font-medium">Phone<input name="guest_phone" required className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
          <label className="block text-sm font-medium">Email<input name="guest_email" type="email" required className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
          <label className="block text-sm font-medium">City<input name="city" required className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        </div>
        <label className="block text-sm font-medium">Delivery address<input name="address_line_1" required className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <label className="block text-sm font-medium">Notes<textarea name="notes" rows={4} className="mt-2 w-full rounded-[1.5rem] border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        {message ? <p className="rounded-2xl bg-hooma-panel p-4 text-sm text-hooma-text">{message}</p> : null}
        <Button className="w-full" disabled={!items.length || isPending}>{isPending ? "Sending..." : hasPaymentPrice ? "Place order" : "Request consultation"}</Button>
      </form>
      <aside className="h-fit rounded-[2rem] bg-white/75 p-6 shadow-soft lg:sticky lg:top-24">
        <h2 className="text-xl font-medium">Cart summary</h2>
        <div className="mt-5 space-y-4">
          {items.length ? items.map((item) => (
            <div key={`${item.product_id}-${item.variant_id}-${item.fabric}-${item.color}`} className="border-b border-hooma-text/10 pb-4 last:border-0">
              <div className="flex justify-between gap-4">
                <p className="font-medium">{item.product_name}</p>
                <p className="text-sm text-hooma-muted">x{item.quantity}</p>
              </div>
              <p className="mt-1 text-sm text-hooma-muted">{item.size_label} / {item.fabric} / {item.color}</p>
              <p className="mt-2 text-sm font-medium">{item.price ?? item.pricePlaceholder}</p>
            </div>
          )) : <p className="text-sm text-hooma-muted">Your cart is empty.</p>}
        </div>
      </aside>
    </div>
  );
}
