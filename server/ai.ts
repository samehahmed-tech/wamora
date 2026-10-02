import { GoogleGenAI } from '@google/genai';
import { readJSON, writeJSON } from './store';

export type AiProviderId = 'auto' | 'gemini' | 'groq' | 'nvidia';

export interface AiSettings {
  provider: AiProviderId;
  geminiKey: string;
  groqKey: string;
  groqModel: string;
  nvidiaKey: string;
  nvidiaModel: string;
}

const DEFAULTS: AiSettings = {
  provider: 'auto',
  geminiKey: '',
  groqKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  nvidiaKey: '',
  nvidiaModel: 'meta/llama-3.1-70b-instruct',
};

export function getAiSettings(): AiSettings {
  const s = readJSON<Partial<AiSettings>>('ai', {});
  return { ...DEFAULTS, ...s };
}

export function saveAiSettings(patch: Partial<AiSettings>): AiSettings {
  const next = { ...getAiSettings(), ...patch };
  next.provider = next.provider || 'auto';
  next.groqModel = next.groqModel || DEFAULTS.groqModel;
  next.nvidiaModel = next.nvidiaModel || DEFAULTS.nvidiaModel;
  void writeJSON('ai', next);
  return next;
}

/** public status — never leaks full keys */
export function aiStatus() {
  const s = getAiSettings();
  const envGemini = !!process.env.GEMINI_API_KEY;
  const hasGemini = !!s.geminiKey || envGemini;
  const hasGroq = !!s.groqKey;
  const hasNvidia = !!s.nvidiaKey;
  const active =
    !hasGemini && !hasGroq && !hasNvidia
      ? 'rules'
      : s.provider === 'groq' && hasGroq
        ? 'groq'
        : s.provider === 'nvidia' && hasNvidia
          ? 'nvidia'
          : s.provider === 'gemini' && hasGemini
            ? 'gemini'
            : hasNvidia
              ? 'nvidia'
              : hasGroq
                ? 'groq'
                : 'gemini';
  return {
    provider: s.provider,
    hasGeminiKey: hasGemini,
    hasGroqKey: hasGroq,
    groqModel: s.groqModel,
    hasNvidiaKey: hasNvidia,
    nvidiaModel: s.nvidiaModel,
    ready: hasGemini || hasGroq || hasNvidia,
    active,
  };
}

function geminiKey(): string | null {
  const s = getAiSettings();
  return s.geminiKey || process.env.GEMINI_API_KEY || null;
}

async function geminiChat(
  system: string,
  history: Array<{ role: string; text: string }>,
  temperature: number,
): Promise<string | null> {
  const key = geminiKey();
  if (!key) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { headers: { 'User-Agent': 'wamora' } } });
    const contents: any[] = [];
    for (const item of history.slice(-6)) {
      contents.push({
        role: item.role === 'bot' || item.role === 'model' ? 'model' : 'user',
        parts: [{ text: item.text }],
      });
    }
    const res = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: { systemInstruction: system, temperature: Math.min(1, Math.max(0, temperature)) },
    });
    return res.text || null;
  } catch (err: any) {
    setAiError('gemini', 0, err?.message || 'gemini error');
    return null;
  }
}

async function openAiChat(
  label: string,
  endpoint: string,
  apiKey: string,
  model: string,
  system: string,
  history: Array<{ role: string; text: string }>,
  temperature: number,
  maxTokens = 500,
  timeoutMs = 30_000,
): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const messages = [
      { role: 'system', content: system },
      ...history.slice(-6).map((h) => ({
        role: h.role === 'bot' || h.role === 'model' ? 'assistant' : 'user',
        content: h.text,
      })),
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: Math.min(1, Math.max(0, temperature)),
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      setAiError(label, res.status, t);
      return null;
    }
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    setAiError(label, 0, err?.message || 'network error');
    return null;
  }
}

async function groqChat(
  system: string,
  history: Array<{ role: string; text: string }>,
  temperature: number,
  maxTokens = 500,
  timeoutMs = 30_000,
): Promise<string | null> {
  const s = getAiSettings();
  return openAiChat(
    'groq',
    'https://api.groq.com/openai/v1/chat/completions',
    s.groqKey,
    s.groqModel || DEFAULTS.groqModel,
    system,
    history,
    temperature,
    maxTokens,
    timeoutMs,
  );
}

async function nvidiaChat(
  system: string,
  history: Array<{ role: string; text: string }>,
  temperature: number,
  maxTokens = 500,
  timeoutMs = 30_000,
): Promise<string | null> {
  const s = getAiSettings();
  return openAiChat(
    'nvidia',
    'https://integrate.api.nvidia.com/v1/chat/completions',
    s.nvidiaKey,
    s.nvidiaModel || DEFAULTS.nvidiaModel,
    system,
    history,
    temperature,
    maxTokens,
    timeoutMs,
  );
}

export interface AiReply {
  text: string;
  provider: 'gemini' | 'groq' | 'nvidia';
}

/** smart reply with automatic fallback across configured providers */
export async function aiChat(
  system: string,
  history: Array<{ role: string; text: string }>,
  temperature = 0.7,
  timeoutMs = 30_000,
): Promise<AiReply | null> {
  const s = getAiSettings();
  const has = {
    gemini: !!(s.geminiKey || process.env.GEMINI_API_KEY),
    groq: !!s.groqKey,
    nvidia: !!s.nvidiaKey,
  };
  const all: Array<'gemini' | 'groq' | 'nvidia'> = ['gemini', 'groq', 'nvidia'];
  let order: Array<'gemini' | 'groq' | 'nvidia'>;
  if (s.provider === 'gemini' || s.provider === 'groq' || s.provider === 'nvidia') {
    order = [s.provider];
  } else {
    // auto: configured providers first, then the rest as fallback
    order = [...all.filter((p) => has[p]), ...all.filter((p) => !has[p])];
  }
  const run = (p: 'gemini' | 'groq' | 'nvidia') =>
    p === 'gemini'
      ? geminiChat(system, history, temperature)
      : p === 'groq'
        ? groqChat(system, history, temperature, 500, timeoutMs)
        : nvidiaChat(system, history, temperature, 500, timeoutMs);
  for (const p of order) {
    const text = await run(p);
    if (text) return { text, provider: p };
  }
  return null;
}

export interface AiErrorInfo {
  provider: string;
  status: number;
  detail: string;
  at: string;
}

let lastAiError: AiErrorInfo | null = null;
export function getLastAiError(): AiErrorInfo | null {
  return lastAiError;
}
function setAiError(provider: string, status: number, detail: string) {
  lastAiError = { provider, status, detail: detail.slice(0, 500), at: new Date().toISOString() };
  console.error(`[ai] ${provider} ${status}:`, detail.slice(0, 200));
}
/** list available models for a provider using its saved key (keys never leave server) */
export async function listModels(provider: 'gemini' | 'groq' | 'nvidia'): Promise<string[]> {
  const s = getAiSettings();
  try {
    if (provider === 'gemini') {
      const key = s.geminiKey || process.env.GEMINI_API_KEY || '';
      if (!key) return [];
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      if (!res.ok) return [];
      const data: any = await res.json();
      const names = (data?.models || [])
        .map((m: any) => String(m?.name || '').replace(/^models\//, ''))
        .filter((n: string) => /gemini/i.test(n));
      return [...new Set(names as string[])].sort();
    }
    const cfg =
      provider === 'groq'
        ? { url: 'https://api.groq.com/openai/v1/models', key: s.groqKey }
        : { url: 'https://integrate.api.nvidia.com/v1/models', key: s.nvidiaKey };
    if (!cfg.key) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(cfg.url, {
      headers: { Authorization: `Bearer ${cfg.key}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data: any = await res.json();
    let ids = (data?.data || []).map((m: any) => String(m?.id || '')).filter(Boolean);
    if (provider === 'nvidia') {
      // /v1/models mixes invocable chat models (org/name) with function UUIDs
      // that 404 on chat/completions — keep only org/name ids
      ids = ids.filter((id: string) => /^[a-z0-9][a-z0-9-_]*\/[a-z0-9][a-z0-9-_.]*$/i.test(id));
    }
    return [...new Set(ids as string[])].sort();
  } catch (err: any) {
    console.error(`[ai] listModels ${provider}:`, err?.message);
    return [];
  }
}
/** generate N alternative phrasings of a marketing message (Arabic-first).
 *  Batches parallel calls (≤6 per call, max 2 concurrent, 60s each, one retry)
 *  so 20+ distinct variants stay reliable on slow models. */
export async function aiVariants(base: string, count = 4): Promise<{ variants: string[]; provider: string }> {
  const system = `أنت خبير كتابة إعلانات واتساب بالعربية. أعد صياغة الرسالة التالية إلى صياغات مختلفة تماما تحافظ على المعنى والمعلومات (الأرقام، الأكواد، الروابط، أرقام الهواتف كما هي حرفيا ولا تترجمها). كل صياغة في سطر مستقل بدون ترقيم وبدون مقدمات. حافظ على الإيجاز المناسب للواتساب.`;
  const PER_CALL = 6;
  const calls = Math.max(1, Math.ceil(count / PER_CALL));
  const out: Array<AiReply | null> = new Array(calls).fill(null);
  let next = 0;
  const attempt = (i: number) =>
    aiChat(
      system,
      [{ role: 'user', text: `النص:\n${base}\n\nعدد الصياغات المطلوبة: ${Math.min(PER_CALL, count)}\nالدفعة ${i + 1}: اجعل الزاوية والألفاظ مختلفة عن أي صياغات سابقة.` }],
      0.95,
      60_000,
    );
  const worker = async () => {
    while (next < calls) {
      const i = next++;
      out[i] = (await attempt(i)) || (await attempt(i));
    }
  };
  await Promise.all([worker(), worker()]);
  const seen = new Set<string>();
  const variants: string[] = [];
  let provider = 'none';
  for (const reply of out) {
    if (!reply) continue;
    provider = reply.provider;
    for (const line of reply.text.split('\n')) {
      const clean = line.replace(/^[\d\-–—.)\s•]+/, '').trim();
      const norm = clean.replace(/\s+/g, ' ');
      if (clean.length > 5 && !seen.has(norm)) {
        seen.add(norm);
        variants.push(clean);
        if (variants.length >= count) break;
      }
    }
    if (variants.length >= count) break;
  }
  return { variants, provider };
}
