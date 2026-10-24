import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Lock, PlayCircle, ShieldCheck, Star } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSeo } from '@/lib/seo';
import { visitorId } from '@/lib/theme';
import { loadRazorpay, openRazorpay } from '@/lib/razorpay';
import { money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { PRODUCT_TYPES } from '@/pages/app/Products';
import { affiliateCode, useStore } from './StoreApp';

const STATES: [string, string][] = [['', 'Select state'], ['07', 'Delhi'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['33', 'Tamil Nadu'], ['36', 'Telangana'], ['24', 'Gujarat'], ['09', 'Uttar Pradesh'], ['19', 'West Bengal'], ['08', 'Rajasthan'], ['23', 'Madhya Pradesh'], ['22', 'Chhattisgarh'], ['32', 'Kerala'], ['06', 'Haryana'], ['03', 'Punjab'], ['21', 'Odisha'], ['10', 'Bihar'], ['37', 'Andhra Pradesh'], ['18', 'Assam'], ['30', 'Goa'], ['05', 'Uttarakhand'], ['02', 'Himachal Pradesh'], ['01', 'Jammu & Kashmir'], ['20', 'Jharkhand'], ['04', 'Chandigarh'], ['34', 'Puducherry']];

function Description({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-muted-foreground">
      {text.split('\n').map((line, i) =>
        line.trim().startsWith('•') ? <p key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />{line.replace(/^\s*•\s*/, '')}</p> : line.trim() ? <p key={i}>{line}</p> : <br key={i} />,
      )}
    </div>
  );
}

function LessonPreview({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['preview', id], queryFn: () => api.get(`/learn/lessons/${id}`), retry: false });
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={q.data?.lesson.title ?? 'Preview'} wide>
      {q.isPending ? <Skeleton className="aspect-video" /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="space-y-4">
          {q.data.lesson.media?.kind === 'VIDEO' && <video src={q.data.lesson.media.url} controls controlsList="nodownload" className="aspect-video w-full rounded-lg bg-black" />}
          {q.data.lesson.embedUrl && <iframe src={q.data.lesson.embedUrl} title="Preview" className="aspect-video w-full rounded-lg" sandbox="allow-scripts allow-same-origin allow-presentation" />}
          {q.data.lesson.body && <p className="whitespace-pre-wrap text-sm">{q.data.lesson.body}</p>}
        </div>
      )}
    </Modal>
  );
}

function Checkout({ product, owned }: { product: any; owned: boolean }) {
  const { store } = useStore();
  const { user } = useAuth();
  const nav = useNavigate();
  const [priceId, setPriceId] = useState(product.prices[0]?.id ?? '');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<string | undefined>();
  const [buyer, setBuyer] = useState({ name: user?.name ?? '', phone: user?.phone ?? '', country: store.currency === 'INR' ? 'IN' : 'US', state: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const price = product.prices.find((p: any) => p.id === priceId);
  const quote = useQuery({
    queryKey: ['quote', priceId, applied, buyer.country],
    queryFn: () => api.post(`/store/${store.slug}/checkout/quote`, { priceId, couponCode: applied, country: buyer.country }),
    enabled: !!priceId,
    retry: false,
  });
  useEffect(() => {
    if (quote.isError && applied) {
      toast.error(errorMessage(quote.error));
      setApplied(undefined);
    }
  }, [quote.isError, quote.error, applied]);
  useEffect(() => {
    if (user) setBuyer((b) => ({ ...b, name: b.name || user.name }));
  }, [user]);

  if (!product.prices.length) return <p className="text-sm text-muted-foreground">Not available for purchase right now.</p>;
  if (owned)
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
        <p className="font-medium">You already have access</p>
        <Button asChild className="w-full"><Link to="/learn">Go to my library</Link></Button>
      </div>
    );

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return nav(`/signup?next=${encodeURIComponent(location.pathname)}`);
    setBusy(true);
    try {
      const r = await api.post(`/store/${store.slug}/checkout`, {
        priceId,
        couponCode: applied,
        buyer: { name: buyer.name, phone: buyer.phone || undefined, country: buyer.country, state: buyer.country === 'IN' && buyer.state ? buyer.state : undefined },
        affiliateCode: affiliateCode(store.slug),
        visitorId: visitorId(),
        marketingConsent: consent,
      });
      if (r.provider === 'FREE') {
        toast.success('You are in!');
        return nav(`/s/${store.slug}/orders/${r.orderId}`);
      }
      if (r.provider === 'STRIPE') {
        window.location.href = r.stripe.url;
        return;
      }
      await loadRazorpay();
      const res = await openRazorpay({ ...r.razorpay, prefill: r.razorpay.prefill });
      if (!res) {
        toast.message('Payment window closed. Your order is saved – you can try again.');
        return;
      }
      // The server verifies the signature and asks Razorpay directly; webhooks confirm independently
      await api.post(`/store/${store.slug}/orders/${r.orderId}/razorpay/verify`, res).catch(() => undefined);
      nav(`/s/${store.slug}/orders/${r.orderId}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const qd = quote.data?.quote;
  return (
    <form onSubmit={pay} className="space-y-4">
      {product.prices.length > 1 && (
        <div className="space-y-2" role="radiogroup" aria-label="Choose an option">
          {product.prices.map((p: any) => (
            <label key={p.id} className="flex cursor-pointer items-center justify-between rounded-lg border p-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand)]/5">
              <span className="flex items-center gap-2"><input type="radio" name="price" checked={priceId === p.id} onChange={() => setPriceId(p.id)} />{p.label ?? (p.type === 'RECURRING' ? `Every ${p.interval.toLowerCase()}` : p.accessDays ? `${p.accessDays} days access` : 'Lifetime access')}</span>
              <span className="font-semibold">{p.amount ? money(p.amount, p.currency) : 'Free'}</span>
            </label>
          ))}
        </div>
      )}
      <div>
        <p className="text-3xl font-bold">{qd ? (qd.total ? money(qd.total, qd.currency) : 'Free') : price?.amount ? money(price.amount, price.currency) : 'Free'}</p>
        {price?.compareAtAmount && <p className="text-sm text-muted-foreground line-through">{money(price.compareAtAmount, price.currency)}</p>}
        {price?.type === 'RECURRING' && <p className="text-sm text-muted-foreground">per {price.interval.toLowerCase()} · renew any time from your library</p>}
        {qd && qd.discount > 0 && <p className="text-sm text-success">You save {money(qd.discount, qd.currency)}</p>}
        {qd && qd.taxAmount > 0 && <p className="text-xs text-muted-foreground">{qd.pricesIncludeTax ? 'Includes' : 'Plus'} GST {money(qd.taxAmount, qd.currency)}</p>}
      </div>
      {(price?.amount ?? 0) > 0 && (
        <div className="flex gap-2">
          <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" />
          <Button type="button" variant="outline" onClick={() => setApplied(coupon || undefined)}>Apply</Button>
        </div>
      )}
      {applied && qd && <p className="text-sm text-success">Coupon {applied} applied</p>}
      {user ? (
        <>
          <Field label="Full name (for invoice)"><Input required value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} /></Field>
          <Field label="Phone"><Input type="tel" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Country"><Select value={buyer.country} onChange={(e) => setBuyer({ ...buyer, country: e.target.value })}><option value="IN">India</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="AE">UAE</option><option value="SG">Singapore</option><option value="CA">Canada</option><option value="AU">Australia</option></Select></Field>
            {buyer.country === 'IN' && <Field label="State"><Select value={buyer.state} onChange={(e) => setBuyer({ ...buyer, state: e.target.value })}>{STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select></Field>}
          </div>
          <Checkbox checked={consent} onChange={setConsent} label={`Send me updates from ${store.name}`} description="Optional. Unsubscribe any time." />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">You'll create a free account so you can access your purchase any time.</p>
      )}
      <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy}>
        {user ? (qd?.total === 0 || price?.amount === 0 ? 'Get access' : 'Pay securely') : 'Continue'}
      </Button>
      {(price?.amount ?? 0) > 0 && <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Secure payment · UPI, cards, net banking</p>}
    </form>
  );
}

export default function ProductPage() {
  const { productSlug = '' } = useParams();
  const [params] = useSearchParams();
  const { store } = useStore();
  const { user } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['store-product', store.slug, productSlug, user?.id], queryFn: () => api.get(`/store/${store.slug}/products/${productSlug}`), retry: false });
  useSeo(q.data ? `${q.data.product.title} – ${store.name}` : undefined, q.data?.product.description?.slice(0, 160), q.data?.product.coverUrl ?? undefined);
  useEffect(() => {
    if (params.get('canceled')) toast.message('Payment was cancelled. You can try again.');
  }, [params]);

  if (q.isPending) return <div className="container grid gap-8 py-10 lg:grid-cols-[1fr_380px]"><Skeleton className="aspect-video" /><Skeleton className="h-96" /></div>;
  if (q.isError) return <div className="container py-16">{q.error instanceof ApiError && q.error.status === 404 ? <div className="text-center"><h1 className="text-2xl font-bold">Product not found</h1></div> : <ErrorState error={q.error} />}</div>;
  const { product, courses, owned } = q.data;
  return (
    <div className="container grid gap-10 py-10 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-8">
        {product.coverUrl && <img src={product.coverUrl} alt="" className="aspect-video w-full rounded-xl object-cover shadow" />}
        <div>
          <Badge variant="outline" className="mb-2">{PRODUCT_TYPES[product.type]}</Badge>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{product.title}</h1>
          {courses[0]?.subtitle && <p className="mt-2 text-lg text-muted-foreground">{courses[0].subtitle}</p>}
          {courses[0]?.reviewCount > 0 && <p className="mt-2 flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-warning text-warning" /> {courses[0].rating?.toFixed(1)} ({courses[0].reviewCount} reviews)</p>}
        </div>
        {product.description && <Description text={product.description} />}
        {courses.map((c: any) => (
          <Card key={c.id}>
            <CardHeader><CardTitle>Course curriculum{courses.length > 1 ? `: ${c.title}` : ''}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {c.modules.map((m: any, i: number) => (
                <div key={i}>
                  <p className="font-medium">{m.title}</p>
                  <ul className="mt-1 space-y-1">
                    {m.lessons.map((l: any) => (
                      <li key={l.id} className="flex items-center justify-between text-sm text-muted-foreground">
                        <span className="flex items-center gap-2">{l.isPreview ? <PlayCircle className="h-4 w-4 text-[var(--brand)]" /> : <Lock className="h-4 w-4" />}{l.title}</span>
                        {l.isPreview ? (user ? <button onClick={() => setPreview(l.id)} className="text-xs font-medium text-[var(--brand)]">Free preview</button> : <Link to={`/signup?next=${encodeURIComponent(location.pathname)}`} className="text-xs font-medium text-[var(--brand)]">Sign up to preview</Link>) : l.durationSec ? <span className="text-xs">{Math.round(l.durationSec / 60)} min</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {preview && <LessonPreview id={preview} onClose={() => setPreview(null)} />}
      <aside>
        <Card className="sticky top-24 shadow-lg">
          <CardContent className="pt-6"><Checkout product={product} owned={owned} /></CardContent>
        </Card>
      </aside>
    </div>
  );
}
