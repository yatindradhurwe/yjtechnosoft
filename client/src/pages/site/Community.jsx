import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Flag, Flame, Heart, Image as ImageIcon, Link2, LogOut, MessageCircle, MoreHorizontal, Pin, Search, Send, Share2, Smile, Trash2, UserCog, Users, Video, X,
} from 'lucide-react';
import { API_BASE, errMsg } from '../../lib/api';
import { asset, cn, fmtDate } from '../../lib/utils';
import { Avatar, EmptyState, Field, Modal, PageLoader, Spinner, useConfirm } from '../../components/ui';
import { PageHero } from '../../components/site/Blocks';
import { Seo } from '../../components/site/Layout';
import SocialIcon from '../../components/site/SocialIcons';

/* ------------------------------------------------------------------ Member session (separate from staff login) */
const TOKEN_KEY = 'yj_community_token';
const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session simply will not persist */
  }
};

const capi = axios.create({ baseURL: `${API_BASE}/api/community` });
capi.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const Ctx = createContext(null);
const useCommunity = () => useContext(Ctx);

function CommunityProvider({ children }) {
  const [member, setMember] = useState(null);
  const [ready, setReady] = useState(!readToken());
  const [authMode, setAuthMode] = useState(null);

  useEffect(() => {
    if (!readToken()) return;
    capi
      .get('/me')
      .then((r) => setMember(r.data))
      .catch((e) => {
        if (e.response?.status === 401) writeToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signedIn = (data) => {
    writeToken(data.token);
    setMember(data.member);
    setAuthMode(null);
  };
  const logout = () => {
    writeToken(null);
    setMember(null);
  };
  /** Runs fn when logged in, otherwise asks the visitor to log in first */
  const guard = (fn) => (...args) => {
    if (!member) {
      setAuthMode('login');
      return undefined;
    }
    return fn(...args);
  };
  return <Ctx.Provider value={{ member, setMember, ready, guard, logout, signedIn, authMode, setAuthMode }}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------------ Small helpers */
function timeAgo(value) {
  if (!value) return '';
  // the database returns local Indian time without an offset
  const then = new Date(`${String(value).replace(' ', 'T')}+05:30`).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(value);
}

const URL_RE = /(https?:\/\/[^\s<]+)/g;
function RichText({ text, className }) {
  if (!text) return null;
  return (
    <p className={cn('whitespace-pre-wrap [overflow-wrap:anywhere]', className)}>
      {String(text).split(URL_RE).map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-brand-700 hover:underline">{part}</a>
        ) : (
          part
        )
      )}
    </p>
  );
}

function useOutsideClose(open, close) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => ref.current && !ref.current.contains(e.target) && close();
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);
  return ref;
}

/* ------------------------------------------------------------------ Emoji */
const EMOJI = [
  ['Smileys', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😜 🤪 😎 🤓 🧐 🤔 🤗 🤭 🤫 😐 😏 😴 😌 🥳 😤 😢 😭 😡 🤯 😱 🥺 🤝 🙏'],
  ['Gestures', '👍 👎 👏 🙌 💪 🤞 ✌️ 🤟 👌 👋 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 ✨ 🔥 🎉 🎊 🏆 🥇 ⭐ 🌟 💡 🌈'],
  ['Tech & AI', '🤖 🧠 💻 🖥️ ⌨️ 🖱️ 📱 💾 💿 🔌 🔋 📡 🛰️ 🚀 🛸 ⚙️ 🛠️ 🔧 🔬 🧪 🧬 📊 📈 🔐 🔒 🌐 ☁️ 👨‍💻 👩‍💻 🐛 ☕ 📚 📝 🎯 ⚡ 🎮'],
];
const MOODS = [['😊', 'happy'], ['🤩', 'excited'], ['🤔', 'thoughtful'], ['😎', 'confident'], ['💡', 'inspired'], ['🙏', 'grateful'], ['🚀', 'motivated'], ['🤖', 'curious about AI'], ['😴', 'tired'], ['😢', 'sad']];
const moodLabel = (emoji) => MOODS.find((m) => m[0] === emoji)?.[1];

function EmojiButton({ onPick, align = 'left', up = false }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="Add emoji" title="Add emoji" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-amber-600 hover:bg-amber-50">
        <Smile className="h-5 w-5" />
      </button>
      {open && (
        <div className={cn('z-50 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl thin-scroll max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 sm:absolute sm:w-72', align === 'right' ? 'sm:right-0' : 'sm:left-0', up ? 'sm:bottom-full sm:mb-1' : 'sm:top-full sm:mt-1')}>
          {EMOJI.map(([group, list]) => (
            <div key={group} className="mb-2">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{group}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {list.split(' ').map((e) => (
                  <button key={e} type="button" onClick={() => onPick(e)} className="rounded-md p-1 text-lg leading-none hover:bg-slate-100">{e}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inserts text at the caret of a textarea-controlled value */
function insertAt(el, value, text, setValue) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  setValue(value.slice(0, start) + text + value.slice(end));
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.selectionStart = el.selectionEnd = start + text.length;
  });
}

/* ------------------------------------------------------------------ Login / sign up */
function AuthModal() {
  const { authMode: mode, setAuthMode: setMode, signedIn } = useCommunity();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => setSent(false), [mode]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await capi.post('/auth/forgot-password', { email: f.email });
        setSent(true);
      } else {
        const { data } = await capi.post(mode === 'register' ? '/auth/register' : '/auth/login', f);
        signedIn(data);
        setF({ name: '', email: '', password: '' });
        toast.success(mode === 'register' ? `Welcome to the community, ${data.member.name.split(' ')[0]}!` : `Welcome back, ${data.member.name.split(' ')[0]}!`);
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const titles = { login: 'Log in to the community', register: 'Join the community', forgot: 'Reset your password' };
  return (
    <Modal open={!!mode} onClose={() => setMode(null)} title={titles[mode] || ''} size="max-w-md">
      {sent ? (
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">If an account exists for <b>{f.email}</b>, a reset link has been sent. Please check your inbox.</div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <Field label="Your name" required>
              <input className="input" required minLength={2} maxLength={100} autoComplete="name" value={f.name} onChange={set('name')} />
            </Field>
          )}
          <Field label="Email" required>
            <input className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
          </Field>
          {mode !== 'forgot' && (
            <Field label="Password" required hint={mode === 'register' ? 'At least 8 characters' : undefined}>
              <input className="input" type="password" required minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} />
            </Field>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner className="h-4 w-4 text-white" />}
            {mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Log in'}
          </button>
        </form>
      )}
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        {mode === 'login' && (
          <>
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setMode('register')}>Create an account</button>
            <button type="button" className="text-slate-500 hover:underline" onClick={() => setMode('forgot')}>Forgot password?</button>
          </>
        )}
        {mode !== 'login' && <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setMode('login')}>Back to login</button>}
      </div>
    </Modal>
  );
}

function ProfileModal({ open, onClose }) {
  const { member, setMember } = useCommunity();
  const [f, setF] = useState({ name: '', bio: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && member) {
      setF({ name: member.name, bio: member.bio || '' });
      setFile(null);
    }
  }, [open, member]);
  const preview = file ? URL.createObjectURL(file) : member?.avatar;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', f.name);
      fd.append('bio', f.bio);
      if (file) fd.append('avatar', file);
      const { data } = await capi.put('/me', fd);
      setMember(data);
      toast.success('Profile updated');
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Edit profile" size="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          {file ? <img src={preview} alt="" className="h-16 w-16 rounded-full object-cover" /> : <Avatar src={preview} name={f.name} size="h-16 w-16" />}
          <label className="btn-outline btn-sm cursor-pointer">
            Change photo
            <input type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
        </div>
        <Field label="Name" required>
          <input className="input" required minLength={2} maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Bio" hint="A line about you, shown on your profile">
          <textarea className="input" rows={3} maxLength={300} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />} Save</button>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Composer */
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';

function Composer({ categories, onPosted }) {
  const { member, setAuthMode } = useCommunity();
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('');
  const [moodOpen, setMoodOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const textRef = useRef();
  const closeMood = useCallback(() => setMoodOpen(false), []);
  const moodRef = useOutsideClose(moodOpen, closeMood);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files]);

  const addFiles = (e, type) => {
    const chosen = [...e.target.files];
    e.target.value = '';
    if (type === 'video') {
      if (chosen[0].size > 50 * 1024 * 1024) return toast.error('Videos must be 50 MB or smaller');
      return setFiles([{ file: chosen[0], type, url: URL.createObjectURL(chosen[0]) }]);
    }
    if (chosen.some((f) => f.size > 8 * 1024 * 1024)) return toast.error('Images must be 8 MB or smaller');
    const kept = files.filter((f) => f.type === 'image');
    if (kept.length + chosen.length > 6) toast.error('You can attach up to 6 images');
    return setFiles([...kept, ...chosen.map((file) => ({ file, type, url: URL.createObjectURL(file) }))].slice(0, 6));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim() && !files.length) return toast.error('Write something or attach an image or video');
    const fd = new FormData();
    fd.append('content', content);
    if (mood) fd.append('mood', mood);
    if (categoryId) fd.append('category_id', categoryId);
    files.forEach((f) => fd.append('media', f.file));
    setProgress(0);
    try {
      const { data } = await capi.post('/posts', fd, { onUploadProgress: (ev) => ev.total && setProgress(Math.round((ev.loaded / ev.total) * 100)) });
      setContent('');
      setMood('');
      setFiles([]);
      setCategoryId('');
      toast.success(data.status === 'pending' ? 'Posted! It will appear after admin approval.' : 'Your post is live!');
      onPosted(data);
    } catch (err) {
      toast.error(err.response?.status === 413 ? 'That file is too large to upload' : errMsg(err));
    } finally {
      setProgress(null);
    }
  };

  if (!member) {
    return (
      <div className="card p-5 sm:p-6">
        <h2 className="text-lg font-bold text-navy-900">What's your thought today? 💭</h2>
        <p className="mt-1 text-sm text-slate-500">Join the community to share ideas, tech news and AI discoveries with photos, videos and emoji.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setAuthMode('register')}>Join free</button>
          <button className="btn-outline" onClick={() => setAuthMode('login')}>Log in</button>
        </div>
      </div>
    );
  }

  const busy = progress !== null;
  return (
    <form onSubmit={submit} className="card p-4 sm:p-5">
      <div className="flex gap-3">
        <Avatar src={member.avatar} name={member.name} size="h-11 w-11" className="shrink-0" />
        <div className="min-w-0 flex-1">
          {mood && (
            <button type="button" onClick={() => setMood('')} className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800" title="Remove feeling">
              {mood} Feeling {moodLabel(mood)} <X className="h-3 w-3" />
            </button>
          )}
          <textarea
            ref={textRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder={`What's your thought today, ${member.name.split(' ')[0]}?`}
            aria-label="Write your post"
            className="w-full resize-y rounded-xl border-0 bg-slate-50 px-4 py-3 text-[15px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
      </div>
      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <div key={f.url} className={cn('relative overflow-hidden rounded-xl bg-slate-100', f.type === 'video' ? 'col-span-3 sm:col-span-4' : 'aspect-square')}>
              {f.type === 'video' ? <video src={f.url} controls className="max-h-72 w-full bg-black" /> : <img src={f.url} alt="" className="h-full w-full object-cover" />}
              <button type="button" aria-label="Remove attachment" onClick={() => setFiles(files.filter((_, n) => n !== i))} className="absolute right-1.5 top-1.5 rounded-full bg-navy-950/70 p-1 text-white hover:bg-navy-950">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {busy && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress}>
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50" title="Add photos">
          <ImageIcon className="h-5 w-5" /> <span className="hidden sm:inline">Photo</span>
          <input type="file" hidden multiple accept={IMAGE_ACCEPT} onChange={(e) => addFiles(e, 'image')} />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg p-2 text-sm font-medium text-rose-600 hover:bg-rose-50" title="Add a video">
          <Video className="h-5 w-5" /> <span className="hidden sm:inline">Video</span>
          <input type="file" hidden accept={VIDEO_ACCEPT} onChange={(e) => addFiles(e, 'video')} />
        </label>
        <EmojiButton onPick={(em) => insertAt(textRef.current, content, em, setContent)} />
        <div className="relative" ref={moodRef}>
          <button type="button" onClick={() => setMoodOpen(!moodOpen)} className="rounded-lg p-2 text-sm font-medium text-slate-600 hover:bg-slate-100">{mood || '😊'} Feeling</button>
          {moodOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
              {MOODS.map(([em, label]) => (
                <button key={em} type="button" onClick={() => { setMood(em); setMoodOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm capitalize hover:bg-slate-100">
                  <span className="text-lg">{em}</span> {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className="input !w-auto min-w-0 flex-1 !py-2 sm:flex-none">
            <option value="">Choose topic</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
          <button className="btn-primary !px-4 !py-2" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />} Post
          </button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ Post pieces */
function MediaGallery({ media }) {
  const [viewing, setViewing] = useState(null);
  if (!media?.length) return null;
  const video = media.find((m) => m.type === 'video');
  if (video) return <video src={asset(video.url)} controls playsInline preload="metadata" className="mt-3 max-h-[520px] w-full rounded-xl bg-black" />;
  const images = media.filter((m) => m.type === 'image');
  const grid = images.length === 1 ? 'grid-cols-1' : images.length === 2 || images.length === 4 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <>
      <div className={cn('mt-3 grid gap-1.5 overflow-hidden rounded-xl', grid)}>
        {images.map((m, i) => (
          <button key={m.url} type="button" aria-label={`Open image ${i + 1}`} onClick={() => setViewing(m.url)} className="block bg-slate-100">
            <img src={asset(m.url)} alt="" loading="lazy" className={cn('w-full object-cover', images.length === 1 ? 'max-h-[520px]' : 'aspect-square')} />
          </button>
        ))}
      </div>
      {viewing && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-navy-950/90 p-4" onClick={() => setViewing(null)}>
          <button type="button" aria-label="Close image" className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><X className="h-6 w-6" /></button>
          <img src={asset(viewing)} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </>
  );
}

function ShareButton({ post, onShared }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const url = `${window.location.origin}/community/post/${post.id}`;
  const text = (post.content || 'Take a look at this post on the YJTechnosoft community').slice(0, 140);
  const count = () => capi.post(`/posts/${post.id}/share`).then((r) => onShared(r.data.shares_count)).catch(() => {});
  const links = [
    ['whatsapp', 'WhatsApp', `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`],
    ['facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`],
    ['linkedin', 'LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`],
    ['twitter', 'X (Twitter)', `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`],
  ];
  const copy = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
      count();
    } catch {
      toast.error('Could not copy the link');
    }
  };
  return (
    <div className="relative flex-1" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
        <Share2 className="h-[18px] w-[18px]" /> Share{post.shares_count > 0 && ` · ${post.shares_count}`}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-1 w-48 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
          {links.map(([icon, label, href]) => (
            <a key={icon} href={href} target="_blank" rel="noopener noreferrer" onClick={() => { setOpen(false); count(); }} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100">
              <SocialIcon name={icon} className="h-4 w-4" /> {label}
            </a>
          ))}
          <button type="button" onClick={copy} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100">
            <Link2 className="h-4 w-4" /> Copy link
          </button>
        </div>
      )}
    </div>
  );
}

function MoreMenu({ mine, onDelete, onReport, small }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="More options" onClick={() => setOpen(!open)} className={cn('rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600', small ? 'p-1' : 'p-1.5')}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {mine ? (
            <button type="button" onClick={() => { setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
          ) : (
            <button type="button" onClick={() => { setOpen(false); onReport(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100"><Flag className="h-4 w-4" /> Report</button>
          )}
        </div>
      )}
    </div>
  );
}

function useReport() {
  const { guard } = useCommunity();
  return guard(async (target) => {
    const reason = window.prompt('What is wrong with this content? (optional)');
    if (reason === null) return;
    try {
      const { data } = await capi.post('/reports', { ...target, reason });
      toast.success(data.message);
    } catch (err) {
      toast.error(errMsg(err));
    }
  });
}

/* ------------------------------------------------------------------ Comments */
function CommentForm({ postId, parentId, replyName, autoFocus, onDone, onCancel }) {
  const { member, guard } = useCommunity();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  const submit = guard(async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await capi.post(`/posts/${postId}/comments`, { content: text, parent_id: parentId });
      setText('');
      await onDone();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  });
  const onSubmit = (e) => {
    e.preventDefault();
    submit(e);
  };
  return (
    <form onSubmit={onSubmit} className="flex items-start gap-2">
      <Avatar src={member?.avatar} name={member?.name || '?'} size="h-8 w-8" className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-2xl bg-slate-100 pl-3.5 pr-1 focus-within:ring-2 focus-within:ring-brand-500/30">
        <textarea
          ref={ref}
          rows={1}
          autoFocus={autoFocus}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) onSubmit(e);
            if (e.key === 'Escape') onCancel?.();
          }}
          aria-label={replyName ? `Reply to ${replyName}` : 'Write a comment'}
          placeholder={replyName ? `Reply to ${replyName}…` : member ? 'Write a comment…' : 'Log in to comment…'}
          className="min-w-0 flex-1 resize-none bg-transparent py-2 text-sm placeholder-slate-400 focus:outline-none"
        />
        <EmojiButton up align="right" onPick={(em) => insertAt(ref.current, text, em, setText)} />
        <button aria-label="Send" disabled={busy || !text.trim()} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 disabled:text-slate-300 disabled:hover:bg-transparent">
          {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
}

function CommentItem({ comment, postId, reload, depth = 0 }) {
  const { member, guard } = useCommunity();
  const confirm = useConfirm();
  const report = useReport();
  const [c, setC] = useState(comment);
  const [replying, setReplying] = useState(false);
  useEffect(() => setC(comment), [comment]);
  const like = guard(async () => {
    try {
      const { data } = await capi.post(`/comments/${c.id}/like`);
      setC({ ...c, ...data });
    } catch (err) {
      toast.error(errMsg(err));
    }
  });
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this comment?', text: depth ? 'This cannot be undone.' : 'Its replies will be deleted too.' }))) return;
    try {
      await capi.delete(`/comments/${c.id}`);
      await reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <div className="flex gap-2">
      <Link to={`/community?member=${c.member_id}`} className="shrink-0"><Avatar src={c.member_avatar} name={c.member_name} size={depth ? 'h-7 w-7' : 'h-8 w-8'} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <div className="min-w-0 rounded-2xl bg-slate-100 px-3.5 py-2">
            <Link to={`/community?member=${c.member_id}`} className="text-[13px] font-semibold text-navy-900 hover:underline">{c.member_name}</Link>
            <div className="text-sm text-slate-700">
              {c.reply_to_name && <span className="mr-1 font-medium text-brand-700">@{c.reply_to_name}</span>}
              <RichText text={c.content} className="inline" />
            </div>
          </div>
          <MoreMenu small mine={member?.id === c.member_id} onDelete={remove} onReport={() => report({ comment_id: c.id })} />
        </div>
        <div className="mt-1 flex items-center gap-3 px-2 text-xs font-medium text-slate-500">
          <span className="font-normal">{timeAgo(c.created_at)}</span>
          <button type="button" onClick={like} className={cn('hover:underline', c.liked && 'text-rose-600')}>Like{c.likes_count > 0 && ` · ${c.likes_count}`}</button>
          <button type="button" onClick={guard(() => setReplying(!replying))} className="hover:underline">Reply</button>
        </div>
        {replying && (
          <div className="mt-2">
            <CommentForm autoFocus postId={postId} parentId={c.id} replyName={c.member_name} onCancel={() => setReplying(false)} onDone={async () => { setReplying(false); await reload(); }} />
          </div>
        )}
        {c.replies?.length > 0 && (
          <div className="mt-2 space-y-2.5">
            {c.replies.map((r) => <CommentItem key={r.id} comment={r} postId={postId} reload={reload} depth={depth + 1} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentSection({ postId, onCount }) {
  const [comments, setComments] = useState(null);
  const load = useCallback(async () => {
    const { data } = await capi.get(`/posts/${postId}/comments`);
    setComments(data.data);
    onCount?.(data.data.reduce((n, c) => n + 1 + c.replies.length, 0));
  }, [postId, onCount]);
  useEffect(() => {
    load().catch((e) => {
      toast.error(errMsg(e));
      setComments([]);
    });
  }, [load]);
  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <CommentForm postId={postId} onDone={load} />
      {comments === null ? (
        <div className="flex justify-center py-3"><Spinner /></div>
      ) : (
        comments.map((c) => <CommentItem key={c.id} comment={c} postId={postId} reload={load} />)
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Post card */
function PostCard({ post: initial, onDeleted, defaultOpen = false }) {
  const { member, guard } = useCommunity();
  const confirm = useConfirm();
  const report = useReport();
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const long = (post.content || '').length > 500;
  const onCount = useCallback((n) => setPost((p) => ({ ...p, comments_count: n })), []);
  const onShared = useCallback((n) => setPost((p) => ({ ...p, shares_count: n })), []);

  const like = guard(async () => {
    const before = post;
    setPost({ ...post, liked: !post.liked, likes_count: post.likes_count + (post.liked ? -1 : 1) });
    try {
      const { data } = await capi.post(`/posts/${post.id}/like`);
      setPost((p) => ({ ...p, ...data }));
    } catch (err) {
      setPost(before);
      toast.error(errMsg(err));
    }
  });
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this post?', text: 'Its comments and media will be deleted too.' }))) return;
    try {
      await capi.delete(`/posts/${post.id}`);
      toast.success('Post deleted');
      onDeleted?.(post.id);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  const isPending = post.status === 'pending';
  return (
    <article className="card p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <Link to={`/community?member=${post.member_id}`} className="shrink-0"><Avatar src={post.member_avatar} name={post.member_name} size="h-11 w-11" /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-700">
            <Link to={`/community?member=${post.member_id}`} className="font-semibold text-navy-900 hover:underline">{post.member_name}</Link>
            {post.mood && <span> is {post.mood} feeling {moodLabel(post.mood) || 'something'}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <Link to={`/community/post/${post.id}`} className="hover:underline">{timeAgo(post.created_at)}</Link>
            {post.category_name && (
              <Link to={`/community?category=${post.category_slug}`} className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100">{post.category_emoji} {post.category_name}</Link>
            )}
            {post.is_pinned && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700"><Pin className="h-3 w-3" /> Pinned</span>}
            {isPending && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">Waiting for approval</span>}
          </p>
        </div>
        <MoreMenu mine={member?.id === post.member_id} onDelete={remove} onReport={() => report({ post_id: post.id })} />
      </header>
      {post.content && (
        <div className="mt-3 text-[15px] leading-relaxed text-slate-800">
          <RichText text={long && !expanded ? `${post.content.slice(0, 500)}…` : post.content} />
          {long && <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 text-sm font-medium text-brand-700 hover:underline">{expanded ? 'See less' : 'See more'}</button>}
        </div>
      )}
      <MediaGallery media={post.media} />
      {!isPending && (
        <>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{post.likes_count > 0 && `${post.likes_count} ${post.likes_count === 1 ? 'like' : 'likes'}`}</span>
            <button type="button" onClick={() => setShowComments(!showComments)} className="hover:underline">{post.comments_count > 0 && `${post.comments_count} ${post.comments_count === 1 ? 'comment' : 'comments'}`}</button>
          </div>
          <div className="mt-2 flex gap-1 border-t border-slate-100 pt-1.5">
            <button type="button" aria-pressed={post.liked} onClick={like} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium hover:bg-slate-100', post.liked ? 'text-rose-600' : 'text-slate-600')}>
              <Heart className={cn('h-[18px] w-[18px]', post.liked && 'fill-current')} /> Like
            </button>
            <button type="button" onClick={() => setShowComments(!showComments)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              <MessageCircle className="h-[18px] w-[18px]" /> Comment
            </button>
            <ShareButton post={post} onShared={onShared} />
          </div>
          {showComments && <CommentSection postId={post.id} onCount={onCount} />}
        </>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ Feed page */
function MemberCard({ memberId }) {
  const { member } = useCommunity();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setProfile(null);
    capi.get(`/members/${memberId}`).then((r) => setProfile(r.data)).catch(() => setProfile(false));
  }, [memberId]);
  if (profile === false) return <div className="card p-5 text-sm text-slate-500">This member's profile is not available.</div>;
  if (!profile) return null;
  const mine = member?.id === profile.id;
  const shown = mine ? { ...profile, ...member } : profile;
  return (
    <div className="card flex flex-wrap items-center gap-4 p-5">
      <Avatar src={shown.avatar} name={shown.name} size="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold text-navy-900">{shown.name}</h2>
        {shown.bio && <p className="mt-0.5 text-sm text-slate-600">{shown.bio}</p>}
        <p className="mt-1 text-xs text-slate-500">{profile.posts} posts · Joined {fmtDate(profile.created_at)}</p>
      </div>
      {mine && <button className="btn-outline btn-sm" onClick={() => setEditing(true)}><UserCog className="h-4 w-4" /> Edit profile</button>}
      <ProfileModal open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function Sidebar({ meta }) {
  const { member, logout, setAuthMode } = useCommunity();
  const [editing, setEditing] = useState(false);
  return (
    <aside className="space-y-5 lg:sticky lg:top-24">
      {member ? (
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Link to={`/community?member=${member.id}`}><Avatar src={member.avatar} name={member.name} size="h-11 w-11" /></Link>
            <div className="min-w-0 flex-1">
              <Link to={`/community?member=${member.id}`} className="block truncate text-sm font-semibold text-navy-900 hover:underline">{member.name}</Link>
              <button onClick={() => setEditing(true)} className="text-xs text-brand-700 hover:underline">Edit profile</button>
            </div>
            <button aria-label="Log out" title="Log out" onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><LogOut className="h-4 w-4" /></button>
          </div>
          <ProfileModal open={editing} onClose={() => setEditing(false)} />
        </div>
      ) : (
        <div className="card p-4 text-sm">
          <p className="font-semibold text-navy-900">Be part of the conversation</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary btn-sm flex-1" onClick={() => setAuthMode('register')}>Join</button>
            <button className="btn-outline btn-sm flex-1" onClick={() => setAuthMode('login')}>Log in</button>
          </div>
        </div>
      )}
      {meta?.stats && (
        <div className="card grid grid-cols-3 divide-x divide-slate-100 py-4 text-center">
          {[['Members', meta.stats.members], ['Posts', meta.stats.posts], ['Comments', meta.stats.comments]].map(([label, n]) => (
            <div key={label}>
              <p className="text-lg font-bold text-navy-900">{n}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      )}
      {meta?.trending?.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900"><Flame className="h-4 w-4 text-orange-500" /> Trending</h3>
          <ul className="space-y-3">
            {meta.trending.map((t) => (
              <li key={t.id}>
                <Link to={`/community/post/${t.id}`} className="group block">
                  <p className="line-clamp-2 text-sm text-slate-700 group-hover:text-brand-700">{t.content || 'Photo or video post'}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{t.member_name} · {t.likes_count} {t.likes_count === 1 ? 'like' : 'likes'}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card p-4 text-xs leading-relaxed text-slate-500">
        <h3 className="mb-1.5 text-sm font-bold text-navy-900">Community guidelines</h3>
        Be kind, stay on topic and share only what you have the right to share. No spam, hate or personal attacks. Use Report on anything that breaks these rules.
      </div>
    </aside>
  );
}

function Feed() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'latest';
  const memberId = params.get('member') || '';
  const { ready, member } = useCommunity();
  const [meta, setMeta] = useState(null);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(q);
  const request = useRef(0);

  const loadMeta = useCallback(() => capi.get('/meta').then((r) => setMeta(r.data)).catch(() => {}), []);
  useEffect(() => { loadMeta(); }, [loadMeta, member?.id]);
  useEffect(() => setSearch(q), [q]);

  const load = useCallback(async (nextPage) => {
    const id = ++request.current;
    setLoading(true);
    try {
      const { data } = await capi.get('/posts', { params: { page: nextPage, category, q, sort, member: memberId } });
      if (id !== request.current) return;
      setPosts((cur) => (nextPage === 1 ? data.data : [...cur, ...data.data.filter((p) => !cur.some((c) => c.id === p.id))]));
      setTotal(data.total);
      setPage(nextPage);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errMsg(e));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [category, q, sort, memberId]);

  // wait for the session so likes show correctly; reload when the visitor logs in or out
  useEffect(() => {
    if (ready) load(1);
  }, [load, ready, member?.id]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const posted = (post) => {
    setPosts((cur) => [post, ...cur]);
    setTotal((t) => t + 1);
    loadMeta();
  };
  const removed = (id) => {
    setPosts((cur) => cur.filter((p) => p.id !== id));
    setTotal((t) => t - 1);
    loadMeta();
  };
  const categories = meta?.categories || [];

  return (
    <>
      <Seo title="Community" description="Share your thoughts, technology news and AI discoveries with the YJTechnosoft community." />
      <PageHero title="Community" text="Share your thought of the day, tech finds and AI ideas. Like, comment and learn together." crumbs={[{ label: 'Community' }]} />
      <section className="bg-slate-50 py-6 sm:py-10">
        <div className="container-x grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)_290px]">
          <nav aria-label="Topics" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 hidden px-3 text-xs font-bold uppercase tracking-wide text-slate-400 lg:block">Topics</p>
            <div className="flex gap-2 overflow-x-auto pb-1 thin-scroll lg:flex-col lg:gap-0.5 lg:overflow-visible">
              {[{ slug: '', name: 'All posts', emoji: '🌐' }, ...categories].map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setParam('category', c.slug)}
                  className={cn('flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition lg:rounded-xl', category === c.slug ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-brand-50 lg:bg-transparent lg:ring-0')}
                >
                  <span>{c.emoji}</span> {c.name}
                </button>
              ))}
            </div>
          </nav>

          <div className="min-w-0 space-y-4">
            {memberId ? (
              <>
                <button onClick={() => setParam('member', '')} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Back to all posts</button>
                <MemberCard memberId={memberId} />
              </>
            ) : (
              <Composer categories={categories} onPosted={posted} />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <form onSubmit={(e) => { e.preventDefault(); setParam('q', search.trim()); }} className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts…" aria-label="Search posts" />
              </form>
              <div className="flex rounded-xl bg-slate-200/70 p-1 text-sm">
                {[['latest', 'Latest'], ['popular', 'Popular']].map(([key, label]) => (
                  <button key={key} onClick={() => setParam('sort', key === 'latest' ? '' : key)} className={cn('rounded-lg px-3 py-1.5 font-medium', sort === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600')}>{label}</button>
                ))}
              </div>
            </div>
            {error && <div className="card p-6 text-center text-sm text-red-600">{error}</div>}
            {!error && !loading && posts.length === 0 && (
              <div className="card"><EmptyState icon={Users} title={q || category ? 'No posts match' : 'No posts yet'} text={q || category ? 'Try another topic or search.' : 'Be the first to share your thought today.'} /></div>
            )}
            {posts.map((p) => <PostCard key={p.id} post={p} onDeleted={removed} />)}
            {loading && <div className="flex justify-center py-6"><Spinner className="h-7 w-7" /></div>}
            {!loading && posts.length < total && (
              <button className="btn-outline w-full" onClick={() => load(page + 1)}>Load more</button>
            )}
          </div>

          <Sidebar meta={meta} />
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ Single post */
function PostPage() {
  const { id } = useParams();
  const { ready } = useCommunity();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!ready) return;
    setPost(null);
    setError(null);
    capi.get(`/posts/${id}`).then((r) => setPost(r.data)).catch((e) => setError(errMsg(e)));
  }, [id, ready]);
  return (
    <section className="min-h-[60vh] bg-slate-50 py-6 sm:py-10">
      <Seo title={post ? `${post.member_name} on Community` : 'Community'} description={post?.content?.slice(0, 160)} />
      <div className="container-x max-w-2xl space-y-4">
        <Link to="/community" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Back to community</Link>
        {error ? (
          <div className="card"><EmptyState title="Post not available" text={error} /></div>
        ) : post ? (
          <PostCard key={post.id} post={post} defaultOpen onDeleted={() => navigate('/community')} />
        ) : (
          <PageLoader />
        )}
      </div>
    </section>
  );
}

function ResetPassword() {
  const [params] = useSearchParams();
  const { setAuthMode } = useCommunity();
  const navigate = useNavigate();
  const [f, setF] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.password !== f.confirm) return toast.error('Passwords do not match');
    setBusy(true);
    try {
      const { data } = await capi.post('/auth/reset-password', { token: params.get('token'), password: f.password });
      toast.success(data.message);
      navigate('/community');
      setAuthMode('login');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <section className="flex min-h-[60vh] items-center bg-slate-50 py-10">
      <Seo title="Reset community password" />
      <form onSubmit={submit} className="card mx-auto w-full max-w-md space-y-4 p-6">
        <h1 className="text-xl font-bold text-navy-900">Set a new password</h1>
        <Field label="New password" required hint="At least 8 characters">
          <input className="input" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label="Confirm password" required>
          <input className="input" type="password" required autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />} Reset password</button>
      </form>
    </section>
  );
}

export default function Community() {
  return (
    <CommunityProvider>
      <Routes>
        <Route index element={<Feed />} />
        <Route path="post/:id" element={<PostPage />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/community" replace />} />
      </Routes>
      <AuthModal />
    </CommunityProvider>
  );
}
