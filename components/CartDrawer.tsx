"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "./Button";
import { useCart } from "./CartContext";
import { useLanguage } from "./LanguageProvider";
import { MAX_CART_LINE_QUANTITY } from "@/lib/cart-storage";

export function CartDrawer() {
  const {
    items,
    isOpen,
    closeCart,
    updateQuantity,
    removeItem,
    hasPendingPaymentOrders,
    keyFor,
  } = useCart();
  const { language } = useLanguage();
  const georgian = language === "ka";
  const [announcement, setAnnouncement] = useState({ id: 0, text: "" });
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeCartRef = useRef(closeCart);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingDeleteFocusRef = useRef<string | null>(null);
  closeCartRef.current = closeCart;
  const pricesComplete = items.length > 0 && items.every(
    (item) => typeof item.price === "number" && Number.isFinite(item.price),
  );
  const subtotal = pricesComplete
    ? items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
    : 0;
  const money = new Intl.NumberFormat(georgian ? "ka-GE" : "en-GB", {
    style: "currency",
    currency: "GEL",
    currencyDisplay: "narrowSymbol",
  });

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCartRef.current();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      previousFocus?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    const pendingKey = pendingDeleteFocusRef.current;
    if (!pendingKey) return;
    pendingDeleteFocusRef.current = null;
    const focusFrame = window.requestAnimationFrame(() => {
      const nextRemoveButton = removeButtonRefs.current.get(pendingKey);
      if (nextRemoveButton) nextRemoveButton.focus();
      else closeButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [items]);

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <button type="button" tabIndex={-1} aria-hidden="true" className={`absolute inset-0 bg-black/25 transition ${isOpen ? "opacity-100" : "opacity-0"}`} onClick={closeCart} />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        tabIndex={-1}
        className={`absolute right-0 top-0 h-dvh w-full max-w-md overflow-y-auto overscroll-contain bg-hooma-background p-6 pb-10 shadow-soft transition duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 id="cart-drawer-title" className="text-xl font-semibold">{georgian ? "კალათა" : "Cart"}</h2>
          <button ref={closeButtonRef} type="button" aria-label={georgian ? "კალათის დახურვა" : "Close cart"} onClick={closeCart} className="grid min-h-11 min-w-11 place-items-center rounded-full hover:bg-hooma-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent">
            <X size={20} />
          </button>
        </div>
        <p key={announcement.id} className="sr-only" role="status" aria-live="polite">{announcement.text}</p>
        {hasPendingPaymentOrders ? (
          <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
            <p className="font-semibold">{georgian ? "გადახდის სტატუსი ჯერ კიდევ მოწმდება" : "A payment status is still being checked"}</p>
            <p className="mt-1">{georgian ? "კალათიდან პროდუქტის წაშლა ბანკში უკვე შექმნილ გადახდას ან შეკვეთას არ აუქმებს. ხელახლა გადახდამდე გადაამოწმე მისი სტატუსი." : "Removing an item here does not cancel a payment or order already created at the bank. Check its status before paying again."}</p>
          </div>
        ) : null}
        <div className="mt-8 space-y-5">
          {items.length === 0 ? <p className="text-sm text-hooma-muted">{georgian ? "კალათა ცარიელია." : "Your cart is empty."}</p> : null}
          {items.map((item, index) => {
            const itemKey = keyFor(item);
            const itemName = georgian ? item.name : item.product_name;
            const configuration = [item.size_label, item.material, item.color]
              .filter(Boolean)
              .join(", ");
            const accessibleName = `${itemName} — ${configuration}`;
            return (
            <div key={itemKey} className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 border-b border-hooma-text/10 pb-5 sm:grid-cols-[88px_minmax(0,1fr)]">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-hooma-panel">
                <Image src={item.image} alt={itemName} fill className="object-cover" sizes="(min-width: 640px) 88px, 72px" />
              </div>
              <div className="min-w-0">
                <div className="flex justify-between gap-3">
                  <h3 className="min-w-0 break-words font-medium">{itemName}</h3>
                  <span className="shrink-0 text-sm text-hooma-muted">{typeof item.price === "number" ? money.format(item.price * item.quantity) : item.pricePlaceholder}</span>
                  </div>
                  <p className="mt-1 text-xs text-hooma-muted">{item.size_label} / {item.material} / {item.color}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
                    <button type="button" aria-label={georgian ? `${accessibleName} — რაოდენობის შემცირება` : `Decrease quantity for ${accessibleName}`} disabled={item.quantity <= 1} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-hooma-text/15 transition hover:bg-hooma-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent disabled:cursor-not-allowed disabled:opacity-35" onClick={() => updateQuantity(itemKey, item.quantity - 1)}>−</button>
                    <span className="text-sm">{item.quantity}</span>
                    <button type="button" aria-label={georgian ? `${accessibleName} — რაოდენობის გაზრდა` : `Increase quantity for ${accessibleName}`} disabled={item.quantity >= MAX_CART_LINE_QUANTITY} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-hooma-text/15 transition hover:bg-hooma-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent disabled:cursor-not-allowed disabled:opacity-35" onClick={() => updateQuantity(itemKey, item.quantity + 1)}>+</button>
                    <button
                      ref={(node) => {
                        if (node) removeButtonRefs.current.set(itemKey, node);
                        else removeButtonRefs.current.delete(itemKey);
                      }}
                      type="button"
                      aria-label={georgian ? `${accessibleName} — კალათიდან წაშლა` : `Remove ${accessibleName} from cart`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 sm:ml-auto"
                      onClick={() => {
                        pendingDeleteFocusRef.current = items[index + 1]
                          ? keyFor(items[index + 1])
                          : items[index - 1]
                            ? keyFor(items[index - 1])
                            : "__cart-close__";
                        removeItem(itemKey);
                      setAnnouncement((current) => ({
                        id: current.id + 1,
                        text: georgian
                          ? `${accessibleName} წაიშალა კალათიდან.`
                          : `${accessibleName} was removed from the cart.`,
                      }));
                      }}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      {georgian ? "წაშლა" : "Remove"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {items.length ? (
          <div className="mt-6 rounded-2xl border border-hooma-text/10 bg-white/70 p-4 text-sm">
            <div className="flex justify-between gap-4"><span className="text-hooma-muted">{georgian ? "პროდუქტები" : "Products"}</span><strong>{pricesComplete ? money.format(subtotal) : "—"}</strong></div>
            <p className="mt-3 text-xs leading-5 text-hooma-muted">{georgian ? "მიწოდება Checkout-ზე ითვლება: Hooma+ წევრისთვის ან მინიმუმ 100₾ პროდუქტის ჯამზე — უფასო. პირველი 10 პროდუქტის ერთეულის ბენეფიტისთვის მთელი კალათა დარჩენილ ბალანსში უნდა ჩაეტიოს; სხვა შემთხვევაში მიწოდება 5₾-ია." : "Delivery is calculated at checkout: free with Hooma+ or when products total at least ₾100. For the first-10 product-unit benefit, the whole cart must fit the remaining balance; otherwise delivery is ₾5."}</p>
            <Link href="/hooma-plus" onClick={closeCart} className="mt-3 inline-flex text-xs font-semibold text-hooma-accent hover:underline">{georgian ? "Hooma+ პირობები" : "Hooma+ details"}</Link>
          </div>
        ) : null}
        {items.length ? (
          <Button href="/checkout" className="mt-8 w-full" onClick={closeCart}>
            {georgian ? "შეკვეთის გაგრძელება" : "Continue to checkout"}
          </Button>
        ) : (
          <Button href="/shop" variant="secondary" className="mt-8 w-full" onClick={closeCart}>
            {georgian ? "პროდუქტების ნახვა" : "Browse products"}
          </Button>
        )}
      </aside>
    </div>
  );
}
