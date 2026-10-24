import { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badge = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-accent text-accent-foreground',
      secondary: 'bg-secondary text-secondary-foreground',
      success: 'bg-success/15 text-success',
      warning: 'bg-warning/15 text-warning',
      destructive: 'bg-destructive/15 text-destructive',
      outline: 'border text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variant }), className)} {...p} />;
}

const STATUS: Record<string, VariantProps<typeof badge>['variant']> = {
  PUBLISHED: 'success', ACTIVE: 'success', PAID: 'success', CAPTURED: 'success', COMPLETED: 'success', CONFIRMED: 'success', REGISTERED: 'success', VERIFIED: 'success', APPROVED: 'success', PROCESSED: 'success', SENT: 'success', RESOLVED: 'success',
  DRAFT: 'secondary', UNPUBLISHED: 'secondary', ARCHIVED: 'outline', CANCELED: 'outline', EXPIRED: 'outline', CLOSED: 'outline', IGNORED: 'outline',
  PENDING: 'warning', SCHEDULED: 'warning', WAITLISTED: 'warning', GRACE: 'warning', REQUESTED: 'warning', OPEN: 'warning', QUEUED: 'warning', WAITING: 'warning', RUNNING: 'warning', SENDING: 'warning', PARTIALLY_REFUNDED: 'warning', PAST_DUE: 'warning', SKIPPED: 'outline',
  FAILED: 'destructive', REFUNDED: 'destructive', SUSPENDED: 'destructive', REJECTED: 'destructive', REVERSED: 'destructive', HIDDEN: 'destructive',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS[status] ?? 'secondary'}>{status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}
