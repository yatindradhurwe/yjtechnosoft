import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Monitor, Plus, Redo2, Smartphone, Tablet, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Block, BLOCK_ICONS, BlockRenderer, PublicPlan, RenderProduct } from './BlockRenderer';

type Kind = 'text' | 'textarea' | 'url' | 'select' | 'bool' | 'button' | 'list' | 'number' | 'productIds' | 'strings';
interface FieldDef {
  key: string;
  label: string;
  kind: Kind;
  options?: (string | number)[];
  itemFields?: FieldDef[];
  newItem?: Record<string, unknown>;
  hint?: string;
}

const BLOCK_FIELDS: Record<Block['type'], { label: string; fields: FieldDef[]; template: () => Omit<Block, 'id'> }> = {
  hero: {
    label: 'Hero',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', kind: 'text' },
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
      { key: 'image', label: 'Image URL', kind: 'url' },
      { key: 'primary', label: 'Primary button', kind: 'button' },
      { key: 'secondary', label: 'Secondary button', kind: 'button' },
    ],
    template: () => ({ type: 'hero', heading: 'A headline that sells the outcome', subheading: 'One sentence about who this is for and what they get.', primary: { label: 'Get started', href: '/' }, style: { align: 'center', paddingY: 'lg' } }),
  },
  features: {
    label: 'Features',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
      { key: 'columns', label: 'Columns', kind: 'select', options: [2, 3, 4] },
      { key: 'items', label: 'Items', kind: 'list', newItem: { icon: 'sparkles', title: 'Benefit', body: 'Describe it' }, itemFields: [{ key: 'icon', label: 'Icon', kind: 'select', options: Object.keys(BLOCK_ICONS) }, { key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Text', kind: 'textarea' }] },
    ],
    template: () => ({ type: 'features', heading: 'What you will learn', columns: 3, items: [{ icon: 'check', title: 'Benefit one', body: 'Explain the result.' }, { icon: 'zap', title: 'Benefit two', body: 'Explain the result.' }, { icon: 'heart', title: 'Benefit three', body: 'Explain the result.' }] }),
  },
  text: { label: 'Text', fields: [{ key: 'heading', label: 'Heading', kind: 'text' }, { key: 'body', label: 'Body', kind: 'textarea' }], template: () => ({ type: 'text', heading: 'About', body: 'Write your story here.' }) },
  image: { label: 'Image', fields: [{ key: 'src', label: 'Image URL', kind: 'url' }, { key: 'alt', label: 'Alt text', kind: 'text', hint: 'Describe the image for screen readers' }, { key: 'caption', label: 'Caption', kind: 'text' }], template: () => ({ type: 'image', src: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200', alt: 'Describe the image' }) },
  video: { label: 'Video', fields: [{ key: 'heading', label: 'Heading', kind: 'text' }, { key: 'url', label: 'YouTube/Vimeo embed URL', kind: 'url', hint: 'e.g. https://www.youtube.com/embed/VIDEO_ID' }], template: () => ({ type: 'video', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }) },
  testimonials: {
    label: 'Testimonials',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'items', label: 'Quotes', kind: 'list', newItem: { quote: 'Quote', name: 'Name' }, itemFields: [{ key: 'quote', label: 'Quote', kind: 'textarea' }, { key: 'name', label: 'Name', kind: 'text' }, { key: 'role', label: 'Role', kind: 'text' }] },
    ],
    template: () => ({ type: 'testimonials', heading: 'What students say', items: [{ quote: '[Add a real student quote]', name: '[Student name]' }] }),
  },
  faq: { label: 'FAQ', fields: [{ key: 'heading', label: 'Heading', kind: 'text' }, { key: 'items', label: 'Questions', kind: 'list', newItem: { q: 'Question?', a: 'Answer.' }, itemFields: [{ key: 'q', label: 'Question', kind: 'text' }, { key: 'a', label: 'Answer', kind: 'textarea' }] }], template: () => ({ type: 'faq', heading: 'FAQ', items: [{ q: 'Who is this for?', a: 'Answer here.' }] }) },
  pricing: {
    label: 'Pricing',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'subheading', label: 'Subheading', kind: 'text' },
      { key: 'source', label: 'Source', kind: 'select', options: ['manual', 'plans'], hint: '"plans" shows the platform plans (marketing site only)' },
      { key: 'items', label: 'Tiers', kind: 'list', newItem: { name: 'Tier', price: '₹999', features: ['Feature'] }, itemFields: [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'price', label: 'Price', kind: 'text' }, { key: 'period', label: 'Period', kind: 'text' }, { key: 'features', label: 'Features (one per line)', kind: 'strings' }, { key: 'cta', label: 'Button', kind: 'button' }, { key: 'highlighted', label: 'Highlight', kind: 'bool' }] },
    ],
    template: () => ({ type: 'pricing', heading: 'Choose your plan', source: 'manual', items: [{ name: 'Basic', price: '₹999', features: ['Lifetime access'], cta: { label: 'Buy', href: '/' } }] }),
  },
  cta: { label: 'Call to action', fields: [{ key: 'heading', label: 'Heading', kind: 'text' }, { key: 'body', label: 'Text', kind: 'textarea' }, { key: 'button', label: 'Button', kind: 'button' }], template: () => ({ type: 'cta', heading: 'Ready to start?', button: { label: 'Join now', href: '/' }, style: { background: 'brand', align: 'center' } }) },
  stats: { label: 'Stats', fields: [{ key: 'items', label: 'Stats', kind: 'list', newItem: { value: '100+', label: 'Students' }, itemFields: [{ key: 'value', label: 'Value', kind: 'text' }, { key: 'label', label: 'Label', kind: 'text' }] }], template: () => ({ type: 'stats', items: [{ value: '6 weeks', label: 'Program length' }, { value: '24', label: 'Lessons' }, { value: 'Lifetime', label: 'Access' }] }) },
  logos: { label: 'Logos', fields: [{ key: 'heading', label: 'Heading', kind: 'text' }, { key: 'items', label: 'Logos', kind: 'list', newItem: { name: 'Brand' }, itemFields: [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'src', label: 'Logo URL', kind: 'url' }] }], template: () => ({ type: 'logos', heading: 'As featured in', items: [{ name: 'Brand' }] }) },
  products: { label: 'Products', fields: [{ key: 'heading', label: 'Heading', kind: 'text' }, { key: 'productIds', label: 'Products', kind: 'productIds', hint: 'Leave empty to show all published products' }], template: () => ({ type: 'products', heading: 'Enrol now', productIds: [] }) },
  lead_form: { label: 'Lead form', fields: [{ key: 'heading', label: 'Heading', kind: 'text' }, { key: 'body', label: 'Text', kind: 'textarea' }, { key: 'buttonLabel', label: 'Button label', kind: 'text' }, { key: 'collectPhone', label: 'Ask for phone', kind: 'bool' }, { key: 'tag', label: 'Tag new contacts as', kind: 'text' }], template: () => ({ type: 'lead_form', heading: 'Get the free guide', buttonLabel: 'Send it to me', tag: 'lead' }) },
};

export const newBlockId = () => Math.random().toString(36).slice(2, 10);

type Obj = Record<string, unknown>;

function FieldEditor({ def, value, onChange, products }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; products?: RenderProduct[] }) {
  switch (def.kind) {
    case 'text':
    case 'url':
      return (
        <Field label={def.label} hint={def.hint}>
          <Input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)} type={def.kind === 'url' ? 'url' : 'text'} />
        </Field>
      );
    case 'number':
      return (
        <Field label={def.label}>
          <Input type="number" value={(value as number) ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={def.label} hint={def.hint}>
          <Textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={4} />
        </Field>
      );
    case 'select':
      return (
        <Field label={def.label} hint={def.hint}>
          <Select value={String(value ?? def.options?.[0] ?? '')} onChange={(e) => onChange(typeof def.options?.[0] === 'number' ? Number(e.target.value) : e.target.value)}>
            {def.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </Field>
      );
    case 'bool':
      return (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{def.label}</span>
          <Switch checked={!!value} onChange={onChange} label={def.label} />
        </div>
      );
    case 'strings':
      return (
        <Field label={def.label}>
          <Textarea value={((value as string[]) ?? []).join('\n')} onChange={(e) => onChange(e.target.value.split('\n'))} rows={4} />
        </Field>
      );
    case 'button': {
      const b = (value as { label?: string; href?: string }) ?? {};
      return (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">{def.label}</legend>
          <Input placeholder="Label" value={b.label ?? ''} onChange={(e) => onChange(e.target.value || b.href ? { label: e.target.value, href: b.href ?? '/' } : undefined)} aria-label={`${def.label} label`} />
          <Input placeholder="/path or https://…" value={b.href ?? ''} onChange={(e) => onChange({ label: b.label ?? 'Learn more', href: e.target.value })} aria-label={`${def.label} link`} />
        </fieldset>
      );
    }
    case 'productIds': {
      const ids = (value as string[]) ?? [];
      return (
        <Field label={def.label} hint={def.hint}>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {(products ?? []).length === 0 && <p className="text-xs text-muted-foreground">No published products yet.</p>}
            {(products ?? []).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={ids.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))} />
                {p.title}
              </label>
            ))}
          </div>
        </Field>
      );
    }
    case 'list': {
      const items = (value as Obj[]) ?? [];
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{def.label}</span>
            <Button size="sm" variant="outline" onClick={() => onChange([...items, { ...def.newItem }])}>
              <Plus /> Add
            </Button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))} aria-label="Move item up">
                  <ArrowUp />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))} aria-label="Move item down">
                  <ArrowDown />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove item">
                  <Trash2 />
                </Button>
              </div>
              {def.itemFields!.map((f) => (
                <FieldEditor key={f.key} def={f} value={it[f.key]} onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))} />
              ))}
            </div>
          ))}
        </div>
      );
    }
  }
}

function move<T>(arr: T[], from: number, to: number) {
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

const DEVICES = { desktop: { w: '100%', icon: Monitor }, tablet: { w: '768px', icon: Tablet }, mobile: { w: '390px', icon: Smartphone } } as const;

/**
 * Controlled editor. History (undo/redo) is kept locally; the parent saves.
 */
export function BlockEditor({ value, onChange, products, plans, storeSlug, allowed }: { value: Block[]; onChange: (b: Block[]) => void; products?: RenderProduct[]; plans?: PublicPlan[]; storeSlug?: string; allowed?: Block['type'][] }) {
  const [selected, setSelected] = useState<string | null>(value[0]?.id ?? null);
  const [past, setPast] = useState<Block[][]>([]);
  const [future, setFuture] = useState<Block[][]>([]);
  const [device, setDevice] = useState<keyof typeof DEVICES>('desktop');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const commit = useCallback(
    (next: Block[]) => {
      setPast((p) => [...p.slice(-49), value]);
      setFuture([]);
      onChange(next);
    },
    [value, onChange],
  );

  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [value, ...f]);
    onChange(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }, [past, value, onChange]);

  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, value]);
    onChange(future[0]);
    setFuture((f) => f.slice(1));
  }, [future, value, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const sel = value.find((b) => b.id === selected);
  const update = (id: string, patch: Obj) => commit(value.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  const types = (allowed ?? (Object.keys(BLOCK_FIELDS) as Block['type'][]));

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_320px]">
      {/* Outline */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Menu
            align="start"
            trigger={
              <Button size="sm" className="flex-1">
                <Plus /> Add section
              </Button>
            }
          >
            {types.map((t) => (
              <MenuItem
                key={t}
                onSelect={() => {
                  const b = { ...BLOCK_FIELDS[t].template(), id: newBlockId() } as Block;
                  const at = sel ? value.findIndex((x) => x.id === sel.id) + 1 : value.length;
                  commit([...value.slice(0, at), b, ...value.slice(at)]);
                  setSelected(b.id);
                }}
              >
                {BLOCK_FIELDS[t].label}
              </MenuItem>
            ))}
          </Menu>
          <Button size="icon" variant="outline" onClick={undo} disabled={!past.length} aria-label="Undo">
            <Undo2 />
          </Button>
          <Button size="icon" variant="outline" onClick={redo} disabled={!future.length} aria-label="Redo">
            <Redo2 />
          </Button>
        </div>
        <ol className="space-y-1" aria-label="Page sections">
          {value.map((b, i) => (
            <li
              key={b.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== i) commit(move(value, dragIndex, i));
                setDragIndex(null);
              }}
              className={cn('group flex items-center gap-1 rounded-md border bg-card px-2 py-1.5 text-sm', selected === b.id && 'border-primary ring-1 ring-primary')}
            >
              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden />
              <button className="flex-1 truncate text-left" onClick={() => setSelected(b.id)}>
                {BLOCK_FIELDS[b.type].label}
                <span className="ml-1 text-xs text-muted-foreground">{'heading' in b && b.heading ? `· ${b.heading}` : ''}</span>
              </button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => commit(move(value, i, i - 1))} aria-label="Move up">
                <ArrowUp />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === value.length - 1} onClick={() => commit(move(value, i, i + 1))} aria-label="Move down">
                <ArrowDown />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                const copy = { ...structuredClone(b), id: newBlockId() };
                commit([...value.slice(0, i + 1), copy, ...value.slice(i + 1)]);
                setSelected(copy.id);
              }} aria-label="Duplicate">
                <Copy />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                commit(value.filter((x) => x.id !== b.id));
                if (selected === b.id) setSelected(null);
              }} aria-label="Delete section">
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
        {!value.length && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No sections yet. Add your first one.</p>}
      </div>

      {/* Preview */}
      <div className="min-w-0">
        <div className="mb-2 flex justify-center gap-1">
          {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((d) => {
            const I = DEVICES[d].icon;
            return (
              <Button key={d} size="sm" variant={device === d ? 'secondary' : 'ghost'} onClick={() => setDevice(d)} aria-pressed={device === d}>
                <I /> <span className="capitalize">{d}</span>
              </Button>
            );
          })}
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted/40 p-2">
          <div className="mx-auto max-h-[75vh] overflow-y-auto rounded-md bg-background shadow-sm transition-all" style={{ width: DEVICES[device].w, maxWidth: '100%' }}>
            <BlockRenderer blocks={value} preview products={products} plans={plans} storeSlug={storeSlug} />
          </div>
        </div>
      </div>

      {/* Properties */}
      <div className="space-y-4">
        {sel ? (
          <>
            <h3 className="font-sans text-sm font-semibold">{BLOCK_FIELDS[sel.type].label} settings</h3>
            {BLOCK_FIELDS[sel.type].fields.map((f) => (
              <FieldEditor key={f.key} def={f} value={(sel as unknown as Obj)[f.key]} products={products} onChange={(v) => update(sel.id, { [f.key]: v })} />
            ))}
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">Style</legend>
              {(['background', 'align', 'paddingY'] as const).map((k) => (
                <Field key={k} label={{ background: 'Background', align: 'Alignment', paddingY: 'Spacing' }[k]}>
                  <Select value={sel.style?.[k] ?? ''} onChange={(e) => update(sel.id, { style: { ...sel.style, [k]: e.target.value || undefined } })}>
                    <option value="">Default</option>
                    {{ background: ['default', 'muted', 'brand', 'dark'], align: ['left', 'center'], paddingY: ['sm', 'md', 'lg'] }[k].map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </fieldset>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a section to edit it.</p>
        )}
      </div>
    </div>
  );
}
