export type NavigationTab =
  | 'dashboard'
  | 'fast_sender'
  | 'campaigns'
  | 'templates'
  | 'anti_block'
  | 'bot_manager'
  | 'inbox'
  | 'meta'
  | 'crm'
  | 'contacts'
  | 'groups'
  | 'accounts'
  | 'api_docs'
  | 'billing';

export type WaAccountState = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WaAccount {
  id: string;
  name: string;
  phone: string;
  state: WaAccountState;
  user: { id: string; name: string; phone: string } | null;
  lastError: string | null;
  trace: string[];
  /** user-controlled: excluded from sending/receiving rotation */
  paused: boolean;
  /** epoch ms until which the account is cooling down after failures */
  cooldownUntil: number | null;
  sentHour: number;
  sentToday: number;
  failStreak: number;
  createdAt: string;
}

export type RotationStrategy = 'round-robin' | 'least-used' | 'pinned';

export interface RotationSettings {
  strategy: RotationStrategy;
  /** max sends per account per rolling hour (warmup cap) */
  perAccountHourlyCap: number;
  /** max sends per account per day — hard ceiling against bans */
  perAccountDailyCap: number;
  /** consecutive failures before an account cools down */
  failStreakLimit: number;
  /** cooldown minutes after hitting the fail limit */
  cooldownMinutes: number;
}

export interface MessageTemplate {
  id: string;
  title: string;
  category: 'marketing' | 'utility' | 'authentication' | 'support';
  categoryAr: string;
  body: string;
  variables: string[];
  mediaType?: 'none' | 'image' | 'video' | 'document';
  mediaUrl?: string;
  mediaName?: string;
  createdAt: string;
  usageCount: number;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  tags: string[];
  /** منطقة / مدينة — تضاف كوسم تلقائي `منطقة:X` عند الاستيراد */
  region?: string;
  lastActive: string;
  status: 'active' | 'opt_out' | 'invalid';
  notes?: string;
  messagesSentCount: number;
  /** last WhatsApp-existence check (ISO) */
  lastChecked?: string;
  /** result of the last existence check */
  onWhatsapp?: boolean;
}

export interface ContactGroup {
  id: string;
  name: string;
  region?: string;
  /** وسم مرتبط — أي جهة تحمل الوسم تعتبر عضو */
  tag?: string;
  /** أرقام مضافة يدوياً للعضوية المباشرة */
  phones: string[];
  notes?: string;
  createdAt: string;
}

export interface MediaAttachment {
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  name: string;
  size?: string;
  duration?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'customer' | 'bot' | 'agent';
  text: string;
  timestamp: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  media?: MediaAttachment;
  isAiGenerated?: boolean;
}

export interface Conversation {
  id: string;
  /** which WhatsApp account owns this thread */
  accountId?: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  avatar: string;
  unreadCount: number;
  lastMessageTime: string;
  botActive: boolean;
  tags: string[];
  messages: ChatMessage[];
}

export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'scheduled';
  targetAudience: string;
  /** 'all' or a contact tag name. Defaults to 'all'. */
  audienceTag?: string;
  /** account ids allowed to send this campaign; ['all'] or omitted = every active account */
  accountIds?: string[];
  /** extra free-form numbers added at creation time */
  manualPhones?: string[];
  /** resolved at start; the real recipient list */
  recipientPhones?: string[];
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  messageTemplate: string;
  /** extra message variants rotated across recipients (anti-block); template always included */
  messageVariants?: string[];
  media?: MediaAttachment;
  createdAt: string;
  /** ISO datetime the campaign actually finished sending */
  completedAt?: string;
  scheduledFor?: string;
  /** ISO datetime the scheduler fires on */
  scheduledAt?: string;
  antiBlockConfig: AntiBlockConfig;
  progressPercent: number;
}

export interface AntiBlockConfig {
  useSpintax: boolean;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  batchSize: number;
  batchPauseMinutes: number;
  enableWarmupMode: boolean;
  autoUnsubscribeKeyword: boolean;
  filterInvalidNumbers: boolean;
  randomizeSendOrder: boolean;
}

export interface BotRule {
  id: string;
  name: string;
  triggerType: 'exact' | 'contains' | 'regex' | 'fallback';
  keywords: string[];
  replyText: string;
  mediaAttachment?: MediaAttachment;
  isActive: boolean;
  matchCount: number;
  action: 'reply' | 'assign_agent' | 'opt_out' | 'trigger_webhook';
}

export interface GeminiBotConfig {
  enabled: boolean;
  persona: string;
  businessName: string;
  knowledgeBase: string;
  temperature: number;
  autoHandoverKeywords: string[];
}

export interface PricingPlan {
  id: string;
  nameAr: string;
  nameEn: string;
  priceMonthly: number;
  priceYearly: number;
  messageLimit: number;
  features: string[];
  recommended?: boolean;
  badge?: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  fullKey?: string;
  createdDate: string;
  lastUsedDate: string;
  status: 'active' | 'revoked';
}
