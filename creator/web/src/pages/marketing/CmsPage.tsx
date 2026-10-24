import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useSeo } from '@/lib/seo';
import { BlockRenderer, Block, PublicPlan } from '@/components/blocks/BlockRenderer';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface CmsPageData {
  page: { slug: string; title: string; sections: Block[]; seo: { title?: string; description?: string; image?: string } };
}

export default function CmsPage({ slug: fixed }: { slug?: string }) {
  const params = useParams();
  const slug = fixed ?? params['*'] ?? 'home';
  const q = useQuery({ queryKey: ['cms', slug], queryFn: () => api.get<CmsPageData>(`/public/pages/${slug}`) });
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<{ plans: PublicPlan[] }>('/public/plans'),
    enabled: !!q.data?.page.sections.some((s) => s.type === 'pricing' && s.source === 'plans'),
  });
  useSeo(q.data?.page.seo.title ?? q.data?.page.title, q.data?.page.seo.description, q.data?.page.seo.image);

  if (q.isPending) return <div className="container space-y-4 py-16"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-6 w-1/2" /><Skeleton className="h-64" /></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) {
      return (
        <div className="container py-24 text-center">
          <h1 className="text-4xl font-bold">Page not found</h1>
          <p className="mt-2 text-muted-foreground">The page you are looking for does not exist.</p>
          <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
        </div>
      );
    }
    return <div className="container py-16"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  }
  return <BlockRenderer blocks={q.data.page.sections} plans={plans.data?.plans} />;
}
