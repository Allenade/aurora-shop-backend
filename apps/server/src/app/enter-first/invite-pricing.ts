import type { QuoteLine } from '../course/course-pricing';
import type {
  InviteOfferType,
  InviteTrackScope,
} from './entities/enter-first-invite.entity';

export type PricingType = 'full' | 'discount' | 'free';

export type InviteForPricing = {
  offerType: InviteOfferType;
  discountPercent?: number | null;
  discountAmount?: number | null;
  trackScope: InviteTrackScope;
  trackSlugs: string[];
};

export type PricedInviteResult = {
  amount: number;
  currency: string;
  lines: QuoteLine[];
  listAmount: number;
  pricingType: PricingType;
  discountLabel: string | null;
};

function scopedSlugs(
  invite: InviteForPricing,
  selected: string[],
): Set<string> {
  if (invite.trackScope === 'all') return new Set(selected);
  const allowed = new Set(
    (invite.trackSlugs ?? []).map((slug) => slug.trim()).filter(Boolean),
  );
  return new Set(selected.filter((slug) => allowed.has(slug)));
}

/**
 * Apply invite rules to an already-validated course quote.
 * Price is never taken from the client — only from quote lines + invite.
 */
export function applyInviteToQuote(
  quote: { amount: number; currency: string; lines: QuoteLine[] },
  invite: InviteForPricing,
): PricedInviteResult {
  const listAmount = quote.amount;
  const selected = quote.lines.map((line) => line.slug);
  const covered = scopedSlugs(invite, selected);

  if (invite.offerType === 'free') {
    const lines = quote.lines.map((line) =>
      covered.has(line.slug)
        ? { ...line, price: 0, isFree: true }
        : { ...line },
    );
    const amount = lines.reduce((sum, line) => sum + line.price, 0);
    const allFree = amount === 0;
    return {
      amount,
      currency: quote.currency,
      lines,
      listAmount,
      pricingType: allFree ? 'free' : amount < listAmount ? 'discount' : 'full',
      discountLabel: allFree
        ? covered.size === selected.length
          ? 'All tracks free'
          : 'Selected tracks free'
        : 'Partial free invite',
    };
  }

  if (invite.offerType === 'discount_percent') {
    const percent = Math.min(100, Math.max(0, invite.discountPercent ?? 0));
    const lines = quote.lines.map((line) => {
      if (!covered.has(line.slug) || line.price <= 0) return { ...line };
      const next = Math.round(line.price * (1 - percent / 100));
      return {
        ...line,
        price: Math.max(0, next),
        isFree: next <= 0 ? true : line.isFree,
      };
    });
    const amount = lines.reduce((sum, line) => sum + line.price, 0);
    return {
      amount,
      currency: quote.currency,
      lines,
      listAmount,
      pricingType:
        amount <= 0 ? 'free' : amount < listAmount ? 'discount' : 'full',
      discountLabel: `${percent}% off`,
    };
  }

  // discount_fixed — subtract from the covered subtotal, leave other lines intact
  const fixed = Math.max(0, invite.discountAmount ?? 0);
  let remaining = fixed;
  const lines = quote.lines.map((line) => {
    if (!covered.has(line.slug) || line.price <= 0 || remaining <= 0) {
      return { ...line };
    }
    const cut = Math.min(line.price, remaining);
    remaining -= cut;
    const next = line.price - cut;
    return {
      ...line,
      price: next,
      isFree: next <= 0 ? true : line.isFree,
    };
  });
  const amount = lines.reduce((sum, line) => sum + line.price, 0);
  return {
    amount,
    currency: quote.currency,
    lines,
    listAmount,
    pricingType:
      amount <= 0 ? 'free' : amount < listAmount ? 'discount' : 'full',
    discountLabel: `₦${fixed.toLocaleString('en-NG')} off`,
  };
}
