// P3: เงินเป็นจำนวนเต็มหน่วยสตางค์เสมอ

export type Satang = number;

export function assertSatang(n: number): Satang {
  if (!Number.isSafeInteger(n)) throw new Error(`not an integer satang amount: ${n}`);
  return n;
}

export const bahtToSatang = (baht: number): Satang => assertSatang(Math.round(baht * 100));

/** 95000 → "950" · 14250 → "142.50" */
export function formatBaht(satang: Satang, opts: { symbol?: boolean } = {}): string {
  const baht = satang / 100;
  const s = baht.toLocaleString("th-TH", {
    minimumFractionDigits: satang % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return opts.symbol === false ? s : `${s}฿`;
}

/** สัดส่วนของยอด ปัดด้วย Math.round (§7.5) */
export const pct = (satang: Satang, percent: number): Satang => Math.round((satang * percent) / 100);
