import React, { useState } from 'react';
import { Upload, Link as LinkIcon, X, FileText, Loader2 } from 'lucide-react';
import { Button, Field, Input, Select, Tabs } from './kit';

export interface MediaPickerValue {
  type: 'image' | 'video' | 'document';
  url: string;
  name: string;
}

interface MediaPickerProps {
  value: MediaPickerValue | null;
  onChange: (v: MediaPickerValue | null) => void;
  label?: string;
}

type TabId = 'upload' | 'url';

function mimeToType(mime: string): MediaPickerValue['type'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

export const MediaPicker: React.FC<MediaPickerProps> = ({
  value,
  onChange,
  label = 'الوسائط المرفقة',
}) => {
  const [tab, setTab] = useState<TabId>('upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlType, setUrlType] = useState<MediaPickerValue['type']>(value?.type || 'image');
  const [url, setUrl] = useState(value?.url || '');
  const [name, setName] = useState(value?.name || '');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'تعذر رفع الملف.');
      const mime: string = (data as any).mime || file.type || '';
      onChange({
        type: mimeToType(mime),
        url: (data as any).url as string,
        name: ((data as any).name as string) || file.name,
      });
    } catch (e: any) {
      setError(e?.message || 'تعذر رفع الملف.');
    } finally {
      setUploading(false);
    }
  };

  const applyUrl = () => {
    if (!url.trim()) {
      setError('أدخل رابطا مباشرا صالحا.');
      return;
    }
    setError(null);
    onChange({ type: urlType, url: url.trim(), name: name.trim() || url.trim().split('/').pop()?.split('?')[0] || 'ملف' });
  };

  return (
    <div className="space-y-2.5">
      <Field label={label}>
        <Tabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'upload', label: 'رفع ملف', icon: <Upload className="w-3.5 h-3.5" /> },
            { id: 'url', label: 'رابط مباشر', icon: <LinkIcon className="w-3.5 h-3.5" /> },
          ]}
        />
      </Field>

      {tab === 'upload' && (
        <div className="space-y-2">
          <label className="flex items-center justify-center gap-2 p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer hover:border-emerald-500/50 transition">
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                جارٍ الرفع...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                اختر ملفا (صورة / فيديو / PDF حتى 32MB)
              </span>
            )}
            <input
              type="file"
              accept="image/*,video/*,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {error && <div className="text-[11px] text-red-300">{error}</div>}
        </div>
      )}

      {tab === 'url' && (
        <div className="space-y-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={urlType} onChange={(e) => setUrlType(e.target.value as MediaPickerValue['type'])}>
              <option value="image">صورة</option>
              <option value="video">فيديو</option>
              <option value="document">مستند</option>
            </Select>
            <Input
              type="text"
              dir="ltr"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الملف"
              className="text-[11px]"
            />
            <Button type="button" size="sm" onClick={applyUrl}>
              اعتماد الرابط
            </Button>
          </div>
          <Input
            type="url"
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://... رابط الملف المباشر"
            className="font-mono text-[11px]"
          />
          {error && <div className="text-[11px] text-red-300">{error}</div>}
        </div>
      )}

      {value && (
        <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {value.type === 'image' ? (
            <img src={value.url} alt={value.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
          ) : value.type === 'video' ? (
            <video src={value.url} className="w-12 h-12 rounded-xl object-cover shrink-0 bg-black" />
          ) : (
            <span className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-emerald-400" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-slate-900 dark:text-white truncate" dir="ltr">{value.name}</div>
            <div className="text-[10px] text-slate-500 truncate" dir="ltr">{value.url}</div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} title="إزالة المرفق">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};
