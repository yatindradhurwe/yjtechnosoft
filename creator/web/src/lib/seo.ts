import { useEffect } from 'react';

/** Sets title, description and social metadata for client-rendered pages */
export function useSeo(title?: string, description?: string, image?: string) {
  useEffect(() => {
    if (title) document.title = title;
    const set = (attr: 'name' | 'property', key: string, value?: string) => {
      if (!value) return;
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = value;
    };
    set('name', 'description', description);
    set('property', 'og:title', title);
    set('property', 'og:description', description);
    set('property', 'og:image', image);
    set('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  }, [title, description, image]);
}
