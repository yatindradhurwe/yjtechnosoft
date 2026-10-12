import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, MessageCircle, MessageSquare, Link2, Copy, ExternalLink } from 'lucide-react';
import api, { errMsg } from '../../lib/api';
import { Modal, Field, Spinner } from './index';
import { cn, waLink } from '../../lib/utils';

const CHANNELS = [
  { key: 'email', label: 'Email (with PDF)', icon: Mail },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
];

/** Send any generated document (invoice, quotation, letter, payslip, receipt) */
export default function SendDialog({ open, onClose, type, id, email: defEmail, phone: defPhone, title = 'Send document', onSent }) {
  const [channels, setChannels] = useState(['email']);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmail(defEmail || '');
    setPhone(defPhone || '');
    setMessage('');
    api.get(`/documents/${type}/${id}/link`).then(({ data }) => setLink(data.link)).catch(() => setLink(''));
  }, [open, type, id, defEmail, defPhone]);

  const toggle = (k) => setChannels((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const send = async () => {
    if (!channels.length) return toast.error('Choose at least one channel');
    setBusy(true);
    try {
      const { data } = await api.post(`/documents/${type}/${id}/send`, { channels, email, phone, message: message || undefined });
      let okCount = 0;
      Object.entries(data.results).forEach(([ch, r]) => {
        if (r.ok) {
          okCount += 1;
          toast.success(`${ch.toUpperCase()} sent`);
        } else {
          toast.error(`${ch.toUpperCase()}: ${r.error}`, { duration: 6000 });
          if (ch === 'whatsapp' && r.waLink) window.open(r.waLink, '_blank');
        }
      });
      if (okCount) {
        onSent?.();
        onClose();
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="max-w-lg"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={send} disabled={busy}>
            {busy && <Spinner className="h-4 w-4 text-white" />} Send now
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {CHANNELS.map(({ key, label, icon: I }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs font-semibold transition',
                channels.includes(key) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
              )}
            >
              <I className="h-5 w-5" /> {label}
            </button>
          ))}
        </div>
        {channels.includes('email') && (
          <Field label="Email">
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" />
          </Field>
        )}
        {(channels.includes('whatsapp') || channels.includes('sms')) && (
          <Field label="Mobile / WhatsApp number">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" />
          </Field>
        )}
        <Field label="Message (optional)" hint="Leave blank to use the default message template from Settings.">
          <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {link && (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Link2 className="h-3.5 w-3.5" /> Shareable link
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-outline btn-sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'))}>
                <Copy className="h-3.5 w-3.5" /> Copy link
              </button>
              {phone && (
                <a className="btn-outline btn-sm" href={waLink(phone, `${message || 'Please find the document here:'}\n${link}`)} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open in WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
