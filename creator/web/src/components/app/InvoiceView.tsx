import { date, money } from '@/lib/utils';

/** Printable GST invoice (use the browser's "Save as PDF") */
export function InvoiceView({ invoice: inv }: { invoice: any }) {
  return (
    <div id="invoice" className="space-y-6 text-sm">
      <div className="flex justify-between gap-6">
        <div>
          <p className="text-lg font-bold">{inv.seller.name}</p>
          {inv.seller.address && <p className="whitespace-pre-line text-muted-foreground">{inv.seller.address}</p>}
          {inv.seller.gstin && <p>GSTIN: {inv.seller.gstin}</p>}
          {inv.seller.email && <p>{inv.seller.email}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{inv.seller.gstin ? 'Tax invoice' : 'Invoice'}</p>
          <p>No. {inv.number}</p>
          <p>Date {date(inv.issuedAt)}</p>
        </div>
      </div>
      <div>
        <p className="font-semibold">Billed to</p>
        <p>{inv.buyer.name}</p>
        <p>{inv.buyer.email}</p>
        {inv.buyer.country && <p>{inv.buyer.country}{inv.buyer.stateCode ? ` (state ${inv.buyer.stateCode})` : ''}</p>}
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-b text-left"><th className="py-2">Item</th><th className="py-2 text-right">Amount</th></tr></thead>
        <tbody>
          {inv.lines.map((l: any, i: number) => (
            <tr key={i} className="border-b"><td className="py-2">{l.title}{l.discount ? <span className="block text-xs text-muted-foreground">Discount −{money(l.discount, inv.currency)}</span> : null}</td><td className="py-2 text-right">{money(l.total - l.taxAmount, inv.currency)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-64 space-y-1">
        <div className="flex justify-between"><span>Taxable value</span><span>{money(inv.subtotal, inv.currency)}</span></div>
        {inv.cgst > 0 && <div className="flex justify-between"><span>CGST</span><span>{money(inv.cgst, inv.currency)}</span></div>}
        {inv.sgst > 0 && <div className="flex justify-between"><span>SGST</span><span>{money(inv.sgst, inv.currency)}</span></div>}
        {inv.igst > 0 && <div className="flex justify-between"><span>IGST</span><span>{money(inv.igst, inv.currency)}</span></div>}
        <div className="flex justify-between border-t pt-1 font-bold"><span>Total</span><span>{money(inv.total, inv.currency)}</span></div>
      </div>
      <p className="text-xs text-muted-foreground">This is a computer-generated invoice.</p>
    </div>
  );
}
