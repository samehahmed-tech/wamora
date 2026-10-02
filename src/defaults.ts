import type { AntiBlockConfig, GeminiBotConfig } from './types';

export const DEFAULT_ANTIBLOCK: AntiBlockConfig = {
  useSpintax: true,
  minDelaySeconds: 15,
  maxDelaySeconds: 28,
  batchSize: 30,
  batchPauseMinutes: 5,
  enableWarmupMode: true,
  autoUnsubscribeKeyword: true,
  filterInvalidNumbers: true,
  randomizeSendOrder: true,
};

export const DEFAULT_BOT_CONFIG: GeminiBotConfig = {
  enabled: true,
  persona: 'أنت مساعد خدمة عملاء ذكي يتحدث بأسلوب مهني وودود باللغة العربية ويجيب على استفسارات العملاء بدقة وإيجاز يناسب رسائل الواتساب.',
  businessName: '',
  knowledgeBase: 'الخدمات متاحة 24/7، الشحن سريع خلال 48 ساعة، إمكانية الدفع عند الاستلام أو بالبطاقات.',
  temperature: 0.7,
  autoHandoverKeywords: ['موظف', 'إنسان', 'مدير', 'شكوى', 'كلمني شخص'],
};

export interface StatsShape {
  sent: number;
  delivered: number;
  failed: number;
  read: number;
  replied: number;
  daily: Record<string, { sent: number; delivered: number; failed: number; read: number; replied: number }>;
}

export const EMPTY_STATS: StatsShape = { sent: 0, delivered: 0, failed: 0, read: 0, replied: 0, daily: {} };

export interface SendLogShape {
  id: string;
  jobId?: string;
  phone: string;
  campaignId?: string | null;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
  delaySeconds?: number;
  timestamp: string;
  /** hash نص الرسالة بعد Spintax — لمنع إعادة نفس الرسالة */
  messageHash?: string;
}

export interface WaPublic {
  state: 'disconnected' | 'connecting' | 'qr' | 'connected';
  user: { id: string; name: string; phone: string } | null;
  lastError: string | null;
  trace?: string[];
}

export const WA_DISCONNECTED: WaPublic = { state: 'disconnected', user: null, lastError: null };
