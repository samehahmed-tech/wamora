import React, { useState } from 'react';
import {
  Code2,
  Key,
  Copy,
  Check,
  Globe,
  Terminal,
  Send,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
  Layers,
  Ban,
  AlertCircle,
} from 'lucide-react';
import { ApiKeyItem } from '../types';
import { get, post, del } from '../api';
import { Button, Modal, Field, Input, Badge } from './kit';
import { SectionHeader } from './ui';

interface ApiGatewayViewProps {
  apiKeys: ApiKeyItem[];
  onUpdateApiKeys: (keys: ApiKeyItem[]) => void;
}

interface WebhookResult {
  ok: boolean;
  statusCode: number;
  ms: number;
  error?: string;
}

export const ApiGatewayView: React.FC<ApiGatewayViewProps> = ({
  apiKeys,
  onUpdateApiKeys,
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<'curl' | 'nodejs' | 'python' | 'php'>('nodejs');
  const [selectedEndpoint, setSelectedEndpoint] = useState<'send_message' | 'send_media' | 'check_status'>('send_message');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookResult, setWebhookResult] = useState<WebhookResult | null>(null);
  const [showGenerateKeyModal, setShowGenerateKeyModal] = useState<boolean>(false);
  const [newKeyName, setNewKeyName] = useState<string>('');
  const [newFullKey, setNewFullKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeKey = apiKeys.find((k) => k.status === 'active')?.fullKey || 'YOUR_API_KEY_HERE';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const refreshKeys = async () => {
    try {
      const fresh = await get<ApiKeyItem[]>('/api/api-keys');
      onUpdateApiKeys(fresh);
    } catch {
      /* ignore */
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleCreateNewKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || busy) return;
    setBusy(true);
    setKeyError(null);
    try {
      const created = await post<ApiKeyItem>('/api/api-keys', { name: newKeyName.trim() });
      setNewFullKey(created.fullKey || '');
      setNewKeyName('');
      await refreshKeys();
    } catch (err: any) {
      setKeyError(err?.message || 'تعذر توليد المفتاح.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setBusy(true);
    try {
      await post(`/api/api-keys/${id}/revoke`);
      await refreshKeys();
    } catch (err: any) {
      setKeyError(err?.message || 'تعذر إيقاف المفتاح.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('حذف هذا المفتاح نهائياً؟ لن يعمل بعد الحذف.')) return;
    setBusy(true);
    try {
      await del(`/api/api-keys/${id}`);
      await refreshKeys();
    } catch (err: any) {
      setKeyError(err?.message || 'تعذر حذف المفتاح.');
    } finally {
      setBusy(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim() || webhookBusy) return;
    setWebhookBusy(true);
    setWebhookResult(null);
    try {
      const res = await post<WebhookResult>('/api/webhooks/test', { url: webhookUrl.trim() });
      setWebhookResult(res);
    } catch (err: any) {
      setWebhookResult({ ok: false, statusCode: 0, ms: 0, error: err?.message });
    } finally {
      setWebhookBusy(false);
    }
  };

  // Code snippets: real endpoints of THIS server, real auth header
  const getCodeSnippet = () => {
    const endpoint =
      selectedEndpoint === 'send_message'
        ? '/api/v1/send'
        : selectedEndpoint === 'send_media'
        ? '/api/v1/send'
        : '/api/v1/status';

    if (selectedEndpoint === 'check_status') {
      if (selectedLanguage === 'curl')
        return `curl "${baseUrl}${endpoint}" \\\n  -H "X-API-KEY: ${activeKey}"`;
      if (selectedLanguage === 'nodejs')
        return `// Node.js — check the WhatsApp session\nconst res = await fetch("${baseUrl}${endpoint}", {\n  headers: { "X-API-KEY": "${activeKey}" }\n});\nconsole.log(await res.json());\n// { connected: true, user: {...}, queue: 0 }`;
      if (selectedLanguage === 'python')
        return `# Python — check the WhatsApp session\nimport requests\nres = requests.get("${baseUrl}${endpoint}", headers={"X-API-KEY": "${activeKey}"})\nprint(res.json())`;
      if (selectedLanguage === 'php')
        return `<?php\n$ch = curl_init("${baseUrl}${endpoint}");\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\ncurl_setopt($ch, CURLOPT_HTTPHEADER, ["X-API-KEY: ${activeKey}"]);\necho curl_exec($ch);\ncurl_close($ch);`;
      return '';
    }

    const payload =
      selectedEndpoint === 'send_media'
        ? `{\n    "phone": "9665XXXXXXXX",\n    "message": "إليك الكتالوج الجديد",\n    "mediaType": "document",\n    "mediaUrl": "https://example.com/catalog.pdf"\n  }`
        : `{\n    "phone": "9665XXXXXXXX",\n    "message": "{مرحباً|أهلاً} تم شحن طلبك بنجاح"\n  }`;

    if (selectedLanguage === 'curl') {
      return `curl -X POST "${baseUrl}${endpoint}" \\
  -H "X-API-KEY: ${activeKey}" \\
  -H "Content-Type: application/json" \\
  -d '${payload}'`;
    }

    if (selectedLanguage === 'nodejs') {
      return `// Node.js — send via your own server (free, no Meta API)
const response = await fetch("${baseUrl}${endpoint}", {
  method: "POST",
  headers: {
    "X-API-KEY": "${activeKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${payload})
});

const data = await response.json();
console.log("Queued job:", data.jobId);`;
    }

    if (selectedLanguage === 'python') {
      return `# Python (requests)
import requests

url = "${baseUrl}${endpoint}"
headers = {
    "X-API-KEY": "${activeKey}",
    "Content-Type": "application/json"
}
payload = ${payload}  # Spintax supported in "message"

response = requests.post(url, json=payload, headers=headers)
print("Status:", response.status_code)
print("Result:", response.json())`;
    }

    if (selectedLanguage === 'php') {
      return `<?php
// PHP cURL
$ch = curl_init("${baseUrl}${endpoint}");
$payload = json_encode(${payload});

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "X-API-KEY: ${activeKey}",
    "Content-Type: application/json"
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;
?>`;
    }

    return '';
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <SectionHeader
        icon={<Code2 className="w-5 h-5" />}
        title="واجهة الربط البرمجي والـ REST API & Webhooks"
        hint="اربط منصة Wamora بمتجرك الإلكتروني (سلة، زد، شوبيفاي، ووكومرس) أو نظام الـ CRM ومواقعك بسهولة"
        action={
          <Button onClick={() => setShowGenerateKeyModal(true)}>
            <Plus className="w-4 h-4" />
            <span>توليد مفتاح API جديد</span>
          </Button>
        }
      />

      {/* API Keys Table Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">مفاتيح الوصول والتفويض (API Keys)</h2>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Bearer Token Authentication</span>
        </div>

        {keyError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{keyError}</span>
          </div>
        )}

        {newFullKey && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <div className="text-xs font-bold text-emerald-300">
              تم توليد المفتاح بنجاح — انسخه الآن، لن يظهر كاملاً مرة أخرى:
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto" dir="ltr">
                {newFullKey}
              </code>
              <button
                onClick={() => handleCopy(newFullKey, 'new-key')}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
              >
                {copiedKey === 'new-key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                نسخ
              </button>
              <button
                onClick={() => setNewFullKey(null)}
                className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                إخفاء
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          {apiKeys.length === 0 ? (
            <div className="text-center text-xs text-slate-500 dark:text-slate-400 py-8">
              لا توجد مفاتيح بعد — ولّد مفتاحك الأول لربط متجرك أو نظامك.
            </div>
          ) : (
          <table className="w-full text-right text-xs">
            <thead className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-bold">
              <tr>
                <th className="pb-3">اسم التطبيق / المفتاح</th>
                <th className="pb-3">المفتاح البرمجي</th>
                <th className="pb-3">الحالة</th>
                <th className="pb-3">تاريخ الإنشاء</th>
                <th className="pb-3">آخر استخدام</th>
                <th className="pb-3 text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-700 dark:text-slate-200">
              {apiKeys.map((item) => (
                <tr key={item.id} className="hover:bg-slate-200/50 dark:hover:bg-slate-850/50 transition">
                  <td className="py-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.status === 'active' ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                    <span>{item.name}</span>
                  </td>
                  <td className="py-3 font-mono text-emerald-400 text-[11px]" dir="ltr">
                    {item.keyPrefix}••••••••
                  </td>
                  <td className="py-3">
                    <Badge tone={item.status === 'active' ? 'green' : 'gray'}>
                      {item.status === 'active' ? 'نشط' : 'موقوف'}
                    </Badge>
                  </td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">{item.createdDate}</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">{item.lastUsedDate}</td>
                  <td className="py-3 text-left">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevoke(item.id)}
                          disabled={busy}
                          title="إيقاف المفتاح"
                          aria-label="إيقاف المفتاح"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(item.id)}
                        disabled={busy}
                        title="حذف المفتاح"
                        aria-label="حذف المفتاح"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Code Snippets & Endpoints Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Endpoints & Methods (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              العمليات البرمجية المتاحة (Endpoints)
            </h3>

            <div className="space-y-2">
              <button
                onClick={() => setSelectedEndpoint('send_message')}
                className={`w-full text-right p-3 rounded-2xl border text-xs transition cursor-pointer active:scale-[0.99] ${
                  selectedEndpoint === 'send_message'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-lg shadow-emerald-950/30'
                    : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-200">إرسال رسالة نصية</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px]">
                    POST
                  </span>
                </div>
                <div className="font-mono text-[10px] text-slate-500" dir="ltr">
                  /api/v1/send
                </div>
              </button>

              <button
                onClick={() => setSelectedEndpoint('send_media')}
                className={`w-full text-right p-3 rounded-2xl border text-xs transition cursor-pointer active:scale-[0.99] ${
                  selectedEndpoint === 'send_media'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-lg shadow-emerald-950/30'
                    : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-200">إرسال وسائط (صورة/فيديو)</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px]">
                    POST
                  </span>
                </div>
                <div className="font-mono text-[10px] text-slate-500" dir="ltr">
                  /api/v1/send + mediaType/mediaUrl
                </div>
              </button>

              <button
                onClick={() => setSelectedEndpoint('check_status')}
                className={`w-full text-right p-3 rounded-2xl border text-xs transition cursor-pointer active:scale-[0.99] ${
                  selectedEndpoint === 'check_status'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-lg shadow-emerald-950/30'
                    : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-200">فحص حالة الاتصال</span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono text-[10px]">
                    GET
                  </span>
                </div>
                <div className="font-mono text-[10px] text-slate-500" dir="ltr">
                  /api/v1/status
                </div>
              </button>
            </div>
          </div>

          {/* Webhook Configuration Box */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-emerald-400" />
              الربط بالويب هوك (Webhooks)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              استقبل إشعارات فورية عند استلام رسائل العملاء، تأكيدات التسليم، وتغييرات الحالة.
            </p>

            <div className="space-y-1.5">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://yourdomain.com/webhook"
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                dir="ltr"
              />
            </div>

            <button
              onClick={handleTestWebhook}
              disabled={webhookBusy || !webhookUrl.trim()}
              className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-750 disabled:opacity-50 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {webhookBusy ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>جارٍ إرسال الحدث التجريبي...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>إرسال حدث اختبار للويب هوك</span>
                </>
              )}
            </button>

            {webhookResult && (
              <div
                className={`p-3 rounded-xl border text-[11px] space-y-1 ${
                  webhookResult.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {webhookResult.ok ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>نجح الاختبار — رد {webhookResult.statusCode} خلال {webhookResult.ms}ms</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>
                        فشل الاختبار {webhookResult.statusCode ? `(كود ${webhookResult.statusCode})` : ''} خلال{' '}
                        {webhookResult.ms}ms
                      </span>
                    </>
                  )}
                </div>
                {webhookResult.error && <div className="font-mono" dir="ltr">{webhookResult.error}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Code Snippets Viewer (8 cols) */}
        <div className="lg:col-span-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
          {/* Language selector bar */}
          <div className="p-3 bg-slate-200 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">كود التكامل الجاهز للاستخدام:</span>
            </div>

            <div className="flex items-center gap-1">
              {(['nodejs', 'python', 'php', 'curl'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setSelectedLanguage(lang)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase transition cursor-pointer ${
                    selectedLanguage === lang
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Code Body */}
          <div className="p-4 bg-slate-100 dark:bg-slate-950 flex-1 relative font-mono text-xs overflow-x-auto text-emerald-300 leading-relaxed" dir="ltr">
            <button
              onClick={() => handleCopy(getCodeSnippet(), 'code')}
              className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-[11px] font-sans font-bold flex items-center gap-1 transition cursor-pointer z-10"
            >
              {copiedKey === 'code' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>تم النسخ</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ الكود</span>
                </>
              )}
            </button>
            <pre>{getCodeSnippet()}</pre>
          </div>
        </div>
      </div>

      {/* Generate Key Modal */}
      <Modal
        open={showGenerateKeyModal}
        onClose={() => setShowGenerateKeyModal(false)}
        title="توليد مفتاح API جديد"
      >
            <form onSubmit={handleCreateNewKey} className="space-y-3 text-xs">
              <Field label="اسم الاستخدام أو النظام المربوط:">
                <Input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="مثال: تطبيق الجوال أو متجر ووكومرس"
                />
              </Field>

              {keyError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]">
                  {keyError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowGenerateKeyModal(false);
                    setNewFullKey(null);
                  }}
                >
                  إغلاق
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !newKeyName.trim()}
                  loading={busy}
                >
                  {busy ? 'جارٍ التوليد...' : 'توليد المفتاح'}
                </Button>
              </div>
            </form>
      </Modal>
    </div>
  );
};
