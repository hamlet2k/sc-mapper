import { useEffect, useRef, useState, type RefObject } from 'react';
import { Ico } from '../components/icons';
import { insertAtCursor } from './insert-text';
import { micDown, micUp } from './mic-gesture';

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: (event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onerror: (event: { error: string }) => void; onend: () => void;
  start(): void; stop(): void; abort(): void;
};
const speechConstructor = () => {
  const w = window as typeof window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
export function Dictation({ field, value, onChange, disabled }: { field: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (s: string) => void; disabled: boolean }) {
  const [listening, setListening] = useState(false), [status, setStatus] = useState(''), [interim, setInterim] = useState('');
  const rec = useRef<Recognition | null>(null), latest = useRef({ value, onChange });
  const press = useRef<ReturnType<typeof micDown> | null>(null);
  latest.current = { value, onChange };
  useEffect(() => () => { const r = rec.current; rec.current = null; r?.abort(); }, []);
  useEffect(() => { if (disabled) rec.current?.stop(); }, [disabled]);
  const stop = () => { rec.current?.stop(); setListening(false); setStatus('Finishing dictation…'); };
  const start = () => {
    const Ctor = speechConstructor(); if (!Ctor || rec.current) return;
    const r = new Ctor(); rec.current = r;
    r.lang = 'en-US'; r.interimResults = true; r.continuous = !/Android/i.test(navigator.userAgent);
    r.onresult = (event) => {
      if (rec.current !== r) return;
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const el = field.current;
          const inserted = insertAtCursor(latest.current.value, result[0].transcript, el ? { start: el.selectionStart, end: el.selectionEnd } : null);
          const next = inserted.value.slice(0, 8000);
          latest.current.value = next; latest.current.onChange(next);
          requestAnimationFrame(() => el?.setSelectionRange(Math.min(inserted.caret, next.length), Math.min(inserted.caret, next.length)));
        } else pending += result[0].transcript;
      }
      setInterim(pending);
    };
    r.onerror = (event) => { if (rec.current === r) setStatus(`Dictation: ${event.error}. You can still type your message.`); };
    r.onend = () => { if (rec.current === r) { rec.current = null; setListening(false); setInterim(''); setStatus((s) => s.startsWith('Dictation:') ? s : 'Dictation stopped'); } };
    try { r.start(); setListening(true); setStatus('Listening… tap to stop, or hold and release'); }
    catch { rec.current = null; setStatus('Could not start dictation. You can still type your message.'); }
  };
  const supported = Boolean(speechConstructor());
  return <div className="space-y-1 text-xs text-slate-400">
    <button type="button" data-testid="feedback-mic" aria-label={listening ? 'Stop dictation' : 'Start voice dictation'} aria-pressed={listening}
      disabled={!supported || disabled} title={supported ? 'Tap to toggle, or hold to talk. No audio is stored by this app.' : 'Speech recognition is unavailable in this browser'}
      className="flex items-center gap-1.5 rounded border border-edge px-2 py-1 text-slate-200 hover:border-hud disabled:opacity-50"
      onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); press.current = micDown(listening, Date.now()); if (!listening) start(); }}
      onPointerUp={() => { if (press.current && micUp(press.current, Date.now()) === 'stop') stop(); press.current = null; }}
      onPointerCancel={() => { press.current = null; stop(); }}
      onClick={(e) => { if (e.detail === 0) { if (listening) stop(); else start(); } }}>
      <Ico name="mic" className="h-4 w-4" />{listening ? 'Stop mic' : 'Voice dictation'}
    </button>
    <p role="status">{supported ? status : 'Voice dictation is unavailable in this browser. Please type your message.'}</p>
    {interim && <p className="italic text-hud2">{interim}</p>}
  </div>;
}
