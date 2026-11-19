export function normalizeCouponEmail(raw?: string | null): string | null {
  const email = raw?.trim().toLowerCase() ?? '';
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (email.length > 254) return null;
  return email;
}

/** Free and 100% off skip Paystack, so they must be locked to one email. */
export function isPersonalCoupon(
  offerType: string,
  discountPercent?: number | null,
): boolean {
  if (offerType === 'free') return true;
  return offerType === 'discount_percent' && discountPercent === 100;
}
