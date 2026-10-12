import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Share2, Copy, Mail, ExternalLink, Send, Smartphone, ChevronDown } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import { cn, waLink } from '../../lib/utils';
import SocialIcon from '../site/SocialIcons';
import SendDialog from './SendDialog';
import { Spinner } from './index';

/**
 * Quick sharing for any document: WhatsApp / Email / copy link / native share,
 * plus "Send with PDF" through the configured Email/SMS/WhatsApp APIs.
 *
 * props: type, id, label, compact (icon only), onSent
 */
export default function ShareMenu({ type, id, label = 'Share', compact = false, onSent, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [send, setSend] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const load = async () => {
    if (info) return info;
    setLoading(true);
    try {
      const { data } = await api.get(`/documents/${type}/${id}/share`);
      setInfo(data);
      return data;
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (e) => {
    e.stopPropagation();
    if (!open) await load();
    setOpen(!open);
  };

  const act = async (fn) => {
    const d = info || (await load());
    if (!d) return;
    setOpen(false);
    fn(d);
  };

  const whatsapp = (d) => {
    const phone = d.phone || window.prompt('WhatsApp number of the recipient (with or without +91):', '') || '';
    window.open(phone ? waLink(phone, d.whatsapp_text) : `https://wa.me/?text=${encodeURIComponent(d.whatsapp_text)}`, '_blank');
  };
  const email = (d) => {
    const body = `${d.message}\n\n${d.message.includes(d.link) ? '' : `${d.link}\n`}`;
    window.location.href = `mailto:${d.email || ''}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(body)}`;
  };
  const copy = (d) => navigator.clipboard.writeText(d.link).then(() => toast.success('Share link copied'));
  const native = (d) => navigator.share({ title: d.subject, text: d.message, url: d.link }).catch(() => {});

  const items = [
    { key: 'wa', label: 'WhatsApp', hint: 'Open chat with message & link', icon: <SocialIcon name="whatsapp" className="h-4 w-4 text-[#25D366]" />, fn: whatsapp },
    { key: 'mail', label: 'Email (your mail app)', hint: 'Opens Gmail / Outlook with link', icon: <Mail className="h-4 w-4 text-sky-600" />, fn: email },
    { key: 'api', label: 'Send with PDF attached', hint: 'Email / WhatsApp / SMS via API', icon: <Send className="h-4 w-4 text-brand-600" />, fn: () => setSend(true) },
    { key: 'copy', label: 'Copy share link', hint: 'Online view, download & accept', icon: <Copy className="h-4 w-4 text-slate-600" />, fn: copy },
    { key: 'open', label: 'Open client view', icon: <ExternalLink className="h-4 w-4 text-slate-600" />, fn: (d) => window.open(`${d.link}?preview=1`, '_blank') },
    ...(typeof navigator !== 'undefined' && navigator.share ? [{ key: 'native', label: 'More apps…', icon: <Smartphone className="h-4 w-4 text-slate-600" />, fn: native }] : []),
  ];

  return (
    <div className="relative inline-block" ref={ref} onClick={(e) => e.stopPropagation()}>
      {compact ? (
        <button className="rounded-lg p-2 text-brand-600 hover:bg-brand-50" title="Share" onClick={toggle}>
          {loading ? <Spinner className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
        </button>
      ) : (
        <button className="btn-primary" onClick={toggle}>
          {loading ? <Spinner className="h-4 w-4 text-white" /> : <Share2 className="h-4 w-4" />} {label} <ChevronDown className="h-4 w-4" />
        </button>
      )}
      {open && info && (
        <div className={cn('absolute z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-100 bg-white py-1.5 text-left shadow-2xl', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it) => (
            <button key={it.key} onClick={() => act(it.fn)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
              <span className="mt-0.5">{it.icon}</span>
              <span>
                <span className="block text-sm font-medium text-navy-900">{it.label}</span>
                {it.hint && <span className="block text-[11px] text-slate-400">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {send && info && <SendDialog open onClose={() => setSend(false)} type={type} id={id} email={info.email} phone={info.phone} title={`Send ${info.subject}`} onSent={onSent} />}
    </div>
  );
}
