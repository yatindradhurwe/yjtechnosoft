import { ReactNode } from 'react';
import * as M from '@radix-ui/react-dropdown-menu';
import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export function Menu({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content align={align} sideOffset={6} className="z-50 min-w-[12rem] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({ children, onSelect, destructive }: { children: ReactNode; onSelect: () => void; destructive?: boolean }) {
  return (
    <M.Item onSelect={onSelect} className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:h-4 [&_svg]:w-4', destructive && 'text-destructive')}>
      {children}
    </M.Item>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">{children}</M.Label>;
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;

export function Tabs({ value, onValueChange, tabs, children }: { value: string; onValueChange: (v: string) => void; tabs: { value: string; label: ReactNode }[]; children: ReactNode }) {
  return (
    <T.Root value={value} onValueChange={onValueChange}>
      <T.List className="mb-5 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <T.Trigger key={t.value} value={t.value} className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground">
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}
export const TabPanel = T.Content;
