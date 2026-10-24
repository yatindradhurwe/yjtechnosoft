import { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-grid flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md animate-fade-up">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer && <div className="border-t p-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </Card>
    </div>
  );
}

export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}
