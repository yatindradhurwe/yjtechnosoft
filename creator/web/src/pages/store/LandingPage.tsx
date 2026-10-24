import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useSeo } from '@/lib/seo';
import { hexToHsl } from '@/lib/theme';
import { BlockRenderer } from '@/components/blocks/BlockRenderer';
import { ErrorState, Spinner } from '@/components/ui/misc';
import { useStore } from './StoreApp';

export default function LandingPage() {
  const { pageSlug = '' } = useParams();
  const { store } = useStore();
  const q = useQuery({ queryKey: ['landing', store.slug, pageSlug], queryFn: () => api.get(`/store/${store.slug}/pages/${pageSlug}`), retry: false });
  useSeo(q.data?.page.seo?.title ?? q.data?.page.title, q.data?.page.seo?.description, q.data?.page.seo?.image);
  if (q.isPending) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (q.isError) return <div className="container py-20 text-center">{q.error instanceof ApiError && q.error.status === 404 ? <h1 className="text-2xl font-bold">Page not found</h1> : <ErrorState error={q.error} />}</div>;
  const theme = q.data.page.theme ?? {};
  const color = theme.primaryColor;
  return (
    <div style={{ ...(color ? { ['--brand' as string]: color, ['--primary' as string]: hexToHsl(color) } : {}), ...(theme.font ? { fontFamily: `${theme.font}, Inter, sans-serif` } : {}) }}>
      {theme.font && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.font)}:wght@400;600;700;800&display=swap`} />}
      <BlockRenderer blocks={q.data.page.blocks} products={q.data.products} storeSlug={store.slug} />
    </div>
  );
}
