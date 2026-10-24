import { ReactNode, useState } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Modal({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <D.Content
          className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-background shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b p-5">
            <div>
              <D.Title className="font-sans text-lg font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t p-4">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Button that asks for confirmation before running a destructive action */
export function ConfirmButton({ children, title, description, confirmLabel = 'Confirm', onConfirm, variant = 'outline', size = 'sm', destructive = true, disabled }: { children: ReactNode; title: string; description?: ReactNode; confirmLabel?: string; onConfirm: () => Promise<unknown> | unknown; variant?: 'outline' | 'ghost' | 'destructive' | 'default' | 'secondary'; size?: 'sm' | 'md' | 'icon'; destructive?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} disabled={disabled}>
        {children}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </>
  );
}
