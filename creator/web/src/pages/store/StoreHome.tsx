import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { PRODUCT_TYPES } from '@/pages/app/Products';
import { useStore } from './StoreApp';

export function ProductCard({ p, slug }: { p: any; slug: string }) {
  const price = p.prices[0];
  return (
    <Link to={`/s/${slug}/p/${p.slug}`} className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5">{p.coverUrl && <img src={p.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
      <div className="flex flex-1 flex-col p-4">
        <Badge variant="outline" className="mb-2 w-fit">{PRODUCT_TYPES[p.type]}</Badge>
        <h3 className="font-sans font-semibold group-hover:underline">{p.title}</h3>
        <div className="mt-auto pt-3">
          {price && (
            <p>
              <span className="text-lg font-bold">{price.amount ? money(price.amount, price.currency) : 'Free'}</span>
              {price.compareAtAmount && <span className="ml-2 text-sm text-muted-foreground line-through">{money(price.compareAtAmount, price.currency)}</span>}
              {price.type === 'RECURRING' && <span className="text-sm text-muted-foreground"> / {price.interval.toLowerCase()}</span>}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function StoreHome() {
  const { store, products } = useStore();
  const workshops = useQuery({ queryKey: ['store-workshops', store.slug], queryFn: () => api.get(`/store/${store.slug}/workshops`) });
  return (
    <>
      <section className="border-b bg-gradient-to-b from-primary/10 to-transparent py-16">
        <div className="container max-w-3xl text-center">
          {store.logoUrl && <img src={store.logoUrl} alt="" className="mx-auto mb-4 h-16 w-16 rounded-xl object-cover" />}
          <h1 className="text-4xl font-extrabold">{store.name}</h1>
          {store.tagline && <p className="mt-3 text-lg text-muted-foreground">{store.tagline}</p>}
          {store.about && <p className="mt-4 whitespace-pre-line text-muted-foreground">{store.about}</p>}
        </div>
      </section>
      <section className="container py-12">
        <h2 className="mb-6 text-2xl font-bold">Products</h2>
        {products.length === 0 ? (
          <EmptyState icon={<Package />} title="Nothing for sale yet" description="Check back soon." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{products.map((p) => <ProductCard key={p.id} p={p} slug={store.slug} />)}</div>
        )}
      </section>
      {workshops.data?.items.length > 0 && (
        <section className="container pb-16">
          <h2 className="mb-6 text-2xl font-bold">Upcoming live workshops</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {workshops.data.items.slice(0, 4).map((w: any) => (
              <Link key={w.id} to={`workshops/${w.id}`} className="flex items-center gap-4 rounded-xl border p-4 hover:bg-muted">
                <Calendar className="h-8 w-8 text-[var(--brand)]" />
                <div><p className="font-semibold">{w.title}</p><p className="text-sm text-muted-foreground">{dateTime(w.startsAt)}{w.seatsLeft !== null && ` · ${w.seatsLeft} seats left`}</p></div>
              </Link>
            ))}
          </div>
          <Button asChild variant="link" className="mt-2"><Link to="workshops">All workshops →</Link></Button>
        </section>
      )}
    </>
  );
}
