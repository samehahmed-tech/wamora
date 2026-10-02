import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { EmojiPicker, insertAtCursor } from './EmojiPicker';
import {
  MessageSquare,
  Search,
  Image as ImageIcon,
  Video,
  FileText,
  Send,
  Bot,
  UserCheck,
  CheckCheck,
  Paperclip,
  X,
  Play,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Conversation, MediaAttachment } from '../types';
import { post } from '../api';
import { Button } from './kit';

interface LiveChatViewProps {
  conversations: Conversation[];
}

export const LiveChatView: React.FC<LiveChatViewProps> = ({ conversations }) => {
  const [selectedConvId, setSelectedConvId] = useState<string>(conversations[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [messageInput, setMessageInput] = useState<string>('');
  const [activeMediaModal, setActiveMediaModal] = useState<MediaAttachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState<boolean>(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachType, setAttachType] = useState<'image' | 'video' | 'document'>('image');
  const [attachUrl, setAttachUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachMode, setAttachMode] = useState<'upload' | 'url'>('url');
  const [attachUploading, setAttachUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // keep a valid selection when the list changes (new inbound chats arrive via SSE)
  useEffect(() => {
    if (!conversations.find((c) => c.id === selectedConvId) && conversations[0]) {
      setSelectedConvId(conversations[0].id);
    }
  }, [conversations, selectedConvId]);

  const activeConv = conversations.find((c) => c.id === selectedConvId) || conversations[0];

  // smooth auto-scroll to the newest message
  const msgCount = activeConv?.messages.length || 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [msgCount, selectedConvId]);

  // mark as read when opening a conversation
  const handleSelectConv = (id: string) => {
    setSelectedConvId(id);
    const conv = conversations.find((c) => c.id === id);
    if (conv && conv.unreadCount > 0) {
      post(`/api/conversations/${id}/read`).catch(() => undefined);
    }
  };

  // Send a real message through the connected WhatsApp session
  const handleSendMessage = async (media?: { type: 'image' | 'video' | 'document'; url: string }) => {
    if ((!messageInput.trim() && !media) || !activeConv || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await post(`/api/conversations/${activeConv.id}/send`, {
        text: messageInput.trim(),
        mediaType: media?.type,
        mediaUrl: media?.url,
        mediaName: media ? media.url.split('/').pop()?.split('?')[0] || 'مرفق' : undefined,
      });
      setMessageInput('');
      setAttachUrl('');
      setShowAttachMenu(false);
    } catch (e: any) {
      setSendError(e?.message || 'تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  };

  // Toggle Bot vs Human Takeover for this contact (persisted on the server)
  const handleToggleBot = async () => {
    if (!activeConv) return;
    try {
      await post(`/api/conversations/${activeConv.id}/bot`, { botActive: !activeConv.botActive });
    } catch (e: any) {
      setSendError(e?.message || 'تعذر تبديل حالة البوت.');
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contactPhone.includes(searchQuery)
  );

  const Avatar: React.FC<{ conv: Conversation; size?: string }> = ({ conv, size = 'w-10 h-10' }) => {
    if (conv.avatar) {
      return (
        <img
          src={conv.avatar}
          alt={conv.contactName}
          className={`${size} rounded-full object-cover border border-slate-300 dark:border-slate-700`}
        />
      );
    }
    const initial = (conv.contactName || conv.contactPhone || '?').trim().charAt(0);
    return (
      <div className={`${size} rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-bold text-white text-sm border border-slate-300 dark:border-slate-700`}>
        {initial}
      </div>
    );
  };

  if (!activeConv) {
    return (
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 h-[calc(100vh-140px)] flex flex-col items-center justify-center gap-3 text-center p-8">
        <MessageSquare className="w-10 h-10 text-slate-600" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">لا توجد محادثات بعد</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
          بمجرد أن يراسلك أي عميل على رقم الواتساب المرتبط ستظهر محادثته هنا لحظياً،
          وسيرد عليه البوت تلقائياً حسب قواعدك.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden h-[calc(100vh-140px)] flex flex-col lg:flex-row">
      {/* Left/Sidebar: Conversation List (320px) */}
      <div className="w-full lg:w-80 border-l border-slate-200 dark:border-slate-800 flex flex-col bg-white/90 dark:bg-slate-900/90 shrink-0">
        {/* Search header */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              المحادثات الواردة ({conversations.length})
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
              مباشر
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الأسماء أو الأرقام..."
              className="w-full pr-9 pl-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Conversation Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-800/60">
          {filteredConversations.map((conv) => {
            const isSelected = conv.id === selectedConvId;
            const lastMsg = conv.messages[conv.messages.length - 1];

            return (
              <div
                key={conv.id}
                onClick={() => handleSelectConv(conv.id)}
                className={`p-3.5 flex items-start gap-3 cursor-pointer transition ${
                  isSelected ? 'bg-slate-200/90 dark:bg-slate-800/90 border-r-4 border-emerald-500' : 'hover:bg-slate-200/60 dark:hover:bg-slate-850/60'
                }`}
              >
                {/* Avatar with status indicator */}
                <div className="relative shrink-0">
                  <Avatar conv={conv} />
                  {conv.botActive && (
                    <span
                      className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-amber-500 border border-slate-900 flex items-center justify-center text-[9px] text-white font-bold"
                      title="البوت الذكي نشط لهذه المحادثة"
                    >
                      AI
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {conv.contactName}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {conv.unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {conv.unreadCount}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {conv.lastMessageTime}
                      </span>
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-snug">
                    {lastMsg?.media ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        {lastMsg.media.type === 'image' && <ImageIcon className="w-3 h-3" />}
                        {lastMsg.media.type === 'video' && <Video className="w-3 h-3" />}
                        مرفق {lastMsg.media.type === 'image' ? 'صورة' : 'فيديو'}: {lastMsg.media.name}
                      </span>
                    ) : (
                      lastMsg?.text || 'محادثة جديدة'
                    )}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {conv.tags.slice(0, 2).map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main/Right: Live Chat Screen */}
      <div className="flex-1 flex flex-col bg-[#0b141a] h-full min-w-0">
        {/* Chat Top Bar */}
        <div className="p-3.5 bg-[#1f2c34] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <Avatar conv={activeConv} />
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{activeConv.contactName}</span>
                <span className="text-[11px] font-mono text-emerald-400" dir="ltr">
                  +{activeConv.contactPhone}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                {activeConv.botActive ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <Bot className="w-3 h-3" />
                    المساعد الذكي (AI Bot) يتولى الرد
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    محادثة مباشرة مع ممثل خدمة العملاء
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Bot Takeover Control */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={activeConv.botActive ? 'soft' : 'primary'}
              onClick={handleToggleBot}
              className={activeConv.botActive ? '!bg-amber-500/20 !text-amber-300 !border-amber-500/30 hover:!bg-amber-500/30' : ''}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>{activeConv.botActive ? 'تحويل للموظف البشري' : 'تفعيل الرد الذكي'}</span>
            </Button>
          </div>
        </div>

        {/* Chat Messages Body */}
        <div
          ref={scrollRef}
          className="flex-1 p-4 md:p-6 overflow-y-auto space-y-3 chat-dots"
        >
          {activeConv.messages.map((msg) => {
            const isCustomer = msg.sender === 'user' || msg.sender === 'customer';
            const isBot = msg.sender === 'bot';

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'} space-y-1`}
              >
                <div
                  className={`p-3 rounded-2xl max-w-[85%] md:max-w-[70%] text-xs leading-relaxed shadow-md space-y-2 ${
                    isCustomer
                      ? 'bg-[#1f2c34] text-slate-100 rounded-tl-none border border-slate-300 dark:border-slate-750'
                      : 'bg-[#005c4b] text-white rounded-tr-none border border-emerald-600/30'
                  }`}
                >
                  {/* Media preview */}
                  {msg.media && (
                    <div
                      onClick={() => setActiveMediaModal(msg.media || null)}
                      className="rounded-xl overflow-hidden cursor-pointer hover:opacity-95 transition border border-white/10"
                    >
                      {msg.media.type === 'image' && (
                        <img
                          src={msg.media.url}
                          alt={msg.media.name}
                          className="w-full max-h-56 object-cover"
                        />
                      )}
                      {msg.media.type === 'video' && (
                        <div className="relative bg-black/60 aspect-video flex items-center justify-center">
                          <video src={msg.media.url} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                              <Play className="w-5 h-5 fill-white text-slate-900 dark:text-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.media.type === 'document' && (
                        <div className="p-3 bg-white/60 dark:bg-slate-900/60 flex items-center gap-2">
                          <FileText className="w-5 h-5 text-emerald-400" />
                          <div className="truncate">
                            <div className="font-bold">{msg.media.name}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{msg.media.size}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Text */}
                  {msg.text && (
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </div>
                  )}

                  {/* Footer metadata: timestamp & checkmarks */}
                  <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                    {isBot && (
                      <span className="text-amber-400 text-[9px] font-mono mr-1">
                        (رد آلي ذكي)
                      </span>
                    )}
                    <span>{msg.timestamp}</span>
                    {!isCustomer && (
                      <CheckCheck
                        className={`w-3.5 h-3.5 ${
                          msg.status === 'read' ? 'text-sky-400' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

        </div>

        {sendError && (
          <div className="mx-4 mb-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{sendError}</span>
          </div>
        )}

        {/* Canned Quick Responses Bar */}
        <div className="px-4 py-2 bg-[#1f2c34]/70 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
          <span className="text-slate-500 dark:text-slate-400 text-[11px] shrink-0 font-bold">ردود سريعة:</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setMessageInput('أهلاً بك! نشكرك على تواصلك، كيف يمكننا مساعدتك اليوم؟')
            }
            className="shrink-0"
          >
            ترحيب
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setMessageInput('طلبك قيد التجهيز وسيتم تسليمه لشركة الشحن خلال 24 ساعة بإذن الله.')
            }
            className="shrink-0"
          >
            حالة الطلب
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setMessageInput('تم استلام طلبك بنجاح، وسنتواصل معك فور تجهيزه بإذن الله.')
            }
            className="shrink-0"
          >
            تأكيد طلب
          </Button>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-[#1f2c34] border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0 relative">
          {/* Attach Menu Button */}
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu((prev) => !prev)}
              className="p-2.5 rounded-full hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              title="إرفاق صورة أو فيديو أو مستند"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Attach popup: upload or send a real media URL via Wamora */}
            {showAttachMenu && (
              <div className="absolute bottom-14 right-0 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-750 p-3 shadow-2xl space-y-2 z-30">
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">إرسال مرفق للعميل</div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={attachMode === 'upload' ? 'soft' : 'ghost'}
                    onClick={() => setAttachMode('upload')}
                    className="flex-1"
                  >
                    رفع
                  </Button>
                  <Button
                    size="sm"
                    variant={attachMode === 'url' ? 'soft' : 'ghost'}
                    onClick={() => setAttachMode('url')}
                    className="flex-1"
                  >
                    رابط
                  </Button>
                </div>
                {attachMode === 'upload' ? (
                  <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer hover:border-emerald-500/50 transition">
                    {attachUploading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        جارٍ الرفع...
                      </span>
                    ) : (
                      <span>اختر ملفا (حتى 32MB)</span>
                    )}
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*,.pdf"
                      className="hidden"
                      disabled={attachUploading || sending}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setAttachUploading(true);
                        setSendError(null);
                        try {
                          const form = new FormData();
                          form.append('file', file);
                          const res = await fetch('/api/upload', { method: 'POST', body: form });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error((data as any)?.error || 'تعذر رفع الملف.');
                          const mime: string = (data as any).mime || file.type || '';
                          const t = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document';
                          await handleSendMessage({ type: t, url: (data as any).url as string });
                        } catch (err: any) {
                          setSendError(err?.message || 'تعذر رفع الملف.');
                        } finally {
                          setAttachUploading(false);
                        }
                      }}
                    />
                  </label>
                ) : (
                  <>
                <div className="flex gap-1.5">
                  {(['image', 'video', 'document'] as const).map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={attachType === t ? 'soft' : 'ghost'}
                      onClick={() => setAttachType(t)}
                      className="flex-1"
                    >
                      {t === 'image' ? 'صورة' : t === 'video' ? 'فيديو' : 'مستند'}
                    </Button>
                  ))}
                </div>
                <input
                  type="url"
                  dir="ltr"
                  value={attachUrl}
                  onChange={(e) => setAttachUrl(e.target.value)}
                  placeholder="https://... رابط الملف المباشر"
                  className="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
                <Button
                  size="sm"
                  onClick={() => attachUrl.trim() && handleSendMessage({ type: attachType, url: attachUrl.trim() })}
                  disabled={!attachUrl.trim() || sending}
                  className="w-full"
                >
                  إرسال المرفق الآن
                </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <EmojiPicker small onPick={(e) => insertAtCursor(inputRef.current, e, setMessageInput)} />

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="اكتب رسالة للعميل..."
            className="flex-1 p-2.5 rounded-2xl bg-[#2a3942] border border-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500/60"
          />

          {/* Send Button */}
          <button
            onClick={() => handleSendMessage()}
            disabled={!messageInput.trim() || sending}
            className="p-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white transition cursor-pointer active:scale-95"
          >
            {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Media Fullscreen Preview Modal */}
      {activeMediaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative max-w-4xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold">{activeMediaModal.name}</span>
              <button
                onClick={() => setActiveMediaModal(null)}
                className="p-1 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center max-h-[70vh] overflow-hidden rounded-2xl bg-black">
              {activeMediaModal.type === 'image' && (
                <img
                  src={activeMediaModal.url}
                  alt={activeMediaModal.name}
                  className="max-h-[70vh] object-contain"
                />
              )}
              {activeMediaModal.type === 'video' && (
                <video
                  src={activeMediaModal.url}
                  className="max-h-[70vh] w-full"
                  controls
                  autoPlay
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
