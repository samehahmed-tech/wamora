import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Smile } from 'lucide-react';

interface EmojiItem {
  e: string;
  k: string; // english keywords for search
}

const GROUPS: { id: string; label: string; items: EmojiItem[] }[] = [
  {
    id: 'faces',
    label: 'وجوه',
    items: [
      { e: '😀', k: 'grin happy smile' }, { e: '😁', k: 'grin teeth happy' },
      { e: '😂', k: 'joy laugh tear lol' }, { e: '🤣', k: 'rofl laugh' },
      { e: '😊', k: 'smile blush happy' }, { e: '😍', k: 'heart eyes love' },
      { e: '😎', k: 'cool sunglasses' }, { e: '🤩', k: 'star eyes wow' },
      { e: '😉', k: 'wink' }, { e: '😌', k: 'relieved calm' },
      { e: '😴', k: 'sleep tired' }, { e: '🤔', k: 'think hmm' },
      { e: '🤗', k: 'hug care' }, { e: '🤝', k: 'handshake deal agree' },
      { e: '👏', k: 'clap applause bravo' }, { e: '🙏', k: 'pray thanks please' },
      { e: '💪', k: 'strong muscle power' }, { e: '👍', k: 'like yes ok good thumb' },
      { e: '👎', k: 'no bad dislike' }, { e: '🙌', k: 'hooray celebrate' },
      { e: '🎉', k: 'party celebrate congrats' }, { e: '🥳', k: 'party face celebrate' },
      { e: '😢', k: 'cry sad tear' }, { e: '😡', k: 'angry red' },
      { e: '😱', k: 'shock scream wow' }, { e: '🤯', k: 'mind blown exploding' },
      { e: '🥺', k: 'plead puppy cute' }, { e: '😳', k: 'blush shy' },
    ],
  },
  {
    id: 'hands',
    label: 'إشارات',
    items: [
      { e: '👋', k: 'wave hello hi' }, { e: '✋', k: 'hand stop' },
      { e: '🤚', k: 'hand back' }, { e: '👌', k: 'ok perfect' },
      { e: '✌️', k: 'victory peace' }, { e: '🤞', k: 'fingers crossed luck' },
      { e: '👈', k: 'point left' }, { e: '👉', k: 'point right' },
      { e: '👆', k: 'point up' }, { e: '👇', k: 'point down' },
      { e: '☝️', k: 'one index' }, { e: '👊', k: 'punch fist' },
      { e: '✊', k: 'fist power' }, { e: '🙌', k: 'hands up celebrate' },
      { e: '👐', k: 'open hands' }, { e: '🤲', k: 'palms dua pray' },
      { e: '💯', k: '100 perfect score' }, { e: '🔥', k: 'fire hot offer urgent' },
      { e: '⭐', k: 'star favorite' }, { e: '🌟', k: 'glow star new' },
      { e: '✨', k: 'sparkle new shine' }, { e: '💥', k: 'boom collision sale' },
      { e: '❤️', k: 'red heart love' }, { e: '💔', k: 'broken heart' },
      { e: '💚', k: 'green heart' }, { e: '💙', k: 'blue heart' },
      { e: '💛', k: 'yellow heart' }, { e: '🧡', k: 'orange heart' },
      { e: '💜', k: 'purple heart' }, { e: '🖤', k: 'black heart' },
      { e: '🤍', k: 'white heart' },
    ],
  },
  {
    id: 'objects',
    label: 'أشياء',
    items: [
      { e: '🎁', k: 'gift present offer' }, { e: '🛍️', k: 'shopping bags buy' },
      { e: '🛒', k: 'cart shop buy' }, { e: '💰', k: 'money bag rich' },
      { e: '💵', k: 'dollar money cash' }, { e: '💳', k: 'card credit pay' },
      { e: '🏷️', k: 'tag label price sale' }, { e: '📦', k: 'package box order ship' },
      { e: '🚚', k: 'truck delivery ship' }, { e: '✈️', k: 'plane travel ship' },
      { e: '🏠', k: 'home house' }, { e: '🚗', k: 'car auto' },
      { e: '📱', k: 'phone mobile' }, { e: '💻', k: 'laptop computer' },
      { e: '⌚', k: 'watch time' }, { e: '👕', k: 'shirt tshirt clothes' },
      { e: '👗', k: 'dress clothes' }, { e: '👞', k: 'shoe shoes' },
      { e: '👜', k: 'bag handbag' }, { e: '💄', k: 'lipstick makeup beauty' },
      { e: '💍', k: 'ring diamond' }, { e: '☕', k: 'coffee tea' },
      { e: '🍔', k: 'burger food' }, { e: '🍕', k: 'pizza food' },
      { e: '🎂', k: 'cake birthday' }, { e: '💐', k: 'flowers bouquet' },
      { e: '📸', k: 'camera photo' }, { e: '🎥', k: 'video camera' },
      { e: '🎬', k: 'movie clapper' }, { e: '🎮', k: 'game controller' },
    ],
  },
  {
    id: 'symbols',
    label: 'رموز',
    items: [
      { e: '✅', k: 'check yes done ok' }, { e: '❌', k: 'cross no x wrong' },
      { e: '⚠️', k: 'warning alert careful' }, { e: '❗', k: 'exclaim important' },
      { e: '❓', k: 'question help' }, { e: '💡', k: 'idea bulb tip' },
      { e: '📌', k: 'pin important' }, { e: '📍', k: 'location pin address' },
      { e: '🔔', k: 'bell notify reminder' }, { e: '📢', k: 'announce loudspeaker offer' },
      { e: '📣', k: 'mega announce' }, { e: '⏰', k: 'alarm clock time urgent' },
      { e: '⏳', k: 'waiting hourglass time' }, { e: '📅', k: 'calendar date' },
      { e: '🔗', k: 'link url' }, { e: '🔒', k: 'lock secure safe' },
      { e: '🔑', k: 'key password' }, { e: '⭐', k: 'star' },
      { e: '🌙', k: 'moon night ramadan' }, { e: '☀️', k: 'sun morning day' },
      { e: '🎯', k: 'target goal' }, { e: '🚀', k: 'rocket fast launch new' },
      { e: '💎', k: 'diamond premium vip' }, { e: '👑', k: 'crown vip king' },
      { e: '🏆', k: 'trophy win best' }, { e: '🥇', k: 'gold medal first' },
      { e: '💯', k: '100' }, { e: '🆕', k: 'new' },
      { e: '🆓', k: 'free' }, { e: '💲', k: 'dollar price' },
      { e: '➡️', k: 'arrow right next' },
    ],
  },
];

const RECENT_KEY = 'wamora-emoji-recent';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export const EmojiPicker: React.FC<{ onPick: (emoji: string) => void; small?: boolean }> = ({
  onPick,
  small = false,
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('faces');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS.find((g) => g.id === tab)?.items || [];
    const out: EmojiItem[] = [];
    for (const g of GROUPS) for (const it of g.items) if (it.k.includes(q)) out.push(it);
    return out.slice(0, 64);
  }, [query, tab]);

  const pick = (e: string) => {
    onPick(e);
    setRecent((prev) => {
      const next = [e, ...prev.filter((x) => x !== e)].slice(0, 16);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="إدراج إيموجي"
        aria-label="إدراج إيموجي"
        className={`${small ? 'p-2' : 'p-2.5'} rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer active:scale-95`}
      >
        <Smile className={small ? 'w-4 h-4' : 'w-5 h-5'} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.16 }}
            className="absolute bottom-11 left-0 z-40 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl shadow-black/30 overflow-hidden"
          >
            <div className="p-2 border-b border-slate-200 dark:border-slate-800">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث بالإنجليزية: heart, fire..."
                className="w-full p-2 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            {!query && (
              <div className="flex gap-1 px-2 pt-2">
                {recent.length > 0 && (
                  <button
                    onClick={() => setTab('recent')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${tab === 'recent' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                  >
                    الأخيرة
                  </button>
                )}
                {GROUPS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setTab(g.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${tab === g.id ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            <div className="p-2 grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto">
              {(tab === 'recent' && !query ? recent : filtered.map((f) => f.e)).map((e, i) => (
                <button
                  key={`${e}-${i}`}
                  onClick={() => pick(e)}
                  className="text-xl p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer leading-none"
                >
                  {e}
                </button>
              ))}
              {tab === 'recent' && recent.length === 0 && (
                <div className="col-span-8 text-center text-[11px] text-slate-400 py-4">لا عناصر أخيرة بعد</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** insert text at the cursor position of a textarea/input */
export function insertAtCursor(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  text: string,
  setter: (v: string) => void,
) {
  if (!el) {
    setter(text);
    return;
  }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  setter(next);
  requestAnimationFrame(() => {
    try {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    } catch {
      /* ignore */
    }
  });
}
