import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { APP_DIR } from './server/paths';
import { wa, checkMediaUrl } from './server/wa';
import { aiStatus, saveAiSettings, aiVariants, aiChat, listModels, getLastAiError } from './server/ai';
import type { ChatMessage } from './src/types';
import {
  answerBot,
  bumpStat,
  checkDuplicates,
  hasBeenSent,
  emit,
  enqueueJobs,
  findOrCreateConversation,
  getAntiBlock,
  getApiKeys,
  getBotConfig,
  getBotRules,
  getCampaigns,
  getContacts,
  getConversations,
  getGroups,
  getQueueStatus,
  getStats,
  getTemplates,
  handleIncomingMessage,
  initGemini,
  isGeminiReady,
  messageHash,
  onEvent,
  setCampaignStatus,
  startCampaign,
  startScheduler,
  getCampaignReport,
  startCheckJob,
  getCheckJob,
  touchApiKey,
  validateApiKey,
  type SendJob,
} from './server/engine';
import { readJSON, writeJSON, DATA_DIR, syncFromSupabase } from './server/store';
import { audit, getAudit } from './server/modules/audit/service';
import { notify, getNotifications, markNoticeRead, unreadCount } from './server/modules/notifications/service';
import { checkLicense, licenseHeartbeat, getLicense, requireLicensed, activateLicense } from './server/license';
import {
  metaStatus,
  connectMeta,  disconnectMeta,
  getMetaSettings,
  setAutoReplyComments,
  getMetaConversations,
  metaSend,
  metaPoll,
  takePendingIncoming,
  markMetaRead,
  pushMetaOutgoing,
  metaPollComments,
  metaReplyComment,
  commentWorthReply,
  markCommentReplied,
} from './server/meta';
import type { ApiKeyItem, Campaign, Conversation } from './src/types';

dotenv.config();

const __dirname = APP_DIR;

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '15mb' }));
  app.use('/media', express.static(path.join(DATA_DIR, 'media')));
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  // ---- file uploads (images / video / pdf / audio for message attachments)
  const uploadDir = path.join(DATA_DIR, 'media', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const uploadOne = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'file';
        cb(null, `${Date.now()}-${safe}`);
      },
    }),
    limits: { fileSize: 32 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok =
        /^(image|video|audio)\//.test(file.mimetype) || file.mimetype === 'application/pdf';
      if (ok) cb(null, true);
      else cb(new Error('نوع الملف غير مدعوم. المسموح: صور، فيديو، صوت، PDF.'));
    },
  }).single('file');

  app.post('/api/upload', (req, res) => {
    uploadOne(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message || 'فشل رفع الملف.' });
      const f = (req as any).file;
      if (!f) return res.status(400).json({ error: 'لم يتم استلام أي ملف.' });
      res.json({
        url: `/media/uploads/${f.filename}`,
        name: f.originalname,
        size: f.size,
        mime: f.mimetype,
      });
    });
  });

  initGemini();

  // license gate (Electron per-client installs phone home to Supabase)
  const lic = await checkLicense();
  console.log(`[license] status=${lic.status} plan=${lic.planName || '-'} accounts<=${lic.maxAccounts} daily<=${lic.dailyMessages}`);
  licenseHeartbeat();

  // pull shared state from Supabase before serving (falls back to local files)
  await syncFromSupabase();

  // wire WhatsApp events into the app
  void wa.onMessage((msg) => handleIncomingMessage(msg));
  void wa.onStatus(() => emit({ type: 'wa-status' }));

  // auto-reconnect every account with a saved session from a previous run
  wa.autostartAll();

  // campaigns stuck in "running" from a killed process can never progress -> pause them
  try {
    const camps = getCampaigns();
    const stuck = camps.filter((c) => c.status === 'running');
    if (stuck.length) {
      stuck.forEach((c) => (c.status = 'paused'));
      await writeJSON('campaigns', camps);
      console.log(`[boot] paused ${stuck.length} campaign(s) left running by a previous session.`);
    }
  } catch {
    /* ignore */
  }

  startScheduler();

  // ------------------------------------------------------------ helpers
  const waPublic = () => {
    const s = wa.getStatus();
    return { state: s.state, user: s.user, lastError: s.lastError };
  };

  // license: suspended/expired blocks sending; plan caps accounts + daily volume
  const licenseSendGate = (): string | null => {
    const l = requireLicensed();
    if (!l.ok) return l.error || 'الترخيص غير صالح.';
    const cur = getLicense();
    const today = new Date().toISOString().slice(0, 10);
    const sentToday = getStats().daily?.[today]?.sent || 0;
    if (cur.dailyMessages > 0 && sentToday >= cur.dailyMessages)
      return `بلغت حد الخطة اليومي (${cur.dailyMessages} رسالة).`;
    return null;
  };

  // ------------------------------------------------------------ health + bootstrap + status
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'online',
      license: getLicense(),
      whatsapp: waPublic(),
      geminiAiReady: isGeminiReady(),
      queuePending: getQueueStatus().pending,
      serverTime: new Date().toISOString(),
      version: '4.0.0-baileys',
    });
  });

  app.get('/api/bootstrap', (_req, res) => {
    res.json({
      contacts: getContacts(),
      groups: getGroups(),
      campaigns: getCampaigns(),
      templates: getTemplates(),
      botRules: getBotRules(),
      botConfig: getBotConfig(),
      antiBlock: getAntiBlock(),
      apiKeys: getApiKeys(),
      conversations: getConversations(),
      stats: getStats(),
      sendLog: readJSON('sendlog', []),
      wa: waPublic(),
      accounts: wa.listAccounts(),
      activeAccountId: wa.getActiveId(),
      rotation: wa.getRotation(),
      ai: aiStatus(),
      license: getLicense(),
      queue: { pending: getQueueStatus().pending, sentThisHour: getQueueStatus().sentThisHour },
      geminiReady: isGeminiReady(),
    });
  });

  app.get('/api/stats', (_req, res) => res.json(getStats()));
  app.get('/api/queue', (_req, res) => res.json(getQueueStatus()));
  app.get('/api/contacts', (_req, res) => res.json(getContacts()));
  app.get('/api/groups', (_req, res) => res.json(getGroups()));
  app.get('/api/templates', (_req, res) => res.json(getTemplates()));
  app.get('/api/bot-rules', (_req, res) => res.json(getBotRules()));
  app.get('/api/bot-config', (_req, res) => res.json(getBotConfig()));
  app.get('/api/settings/antiblock', (_req, res) => res.json(getAntiBlock()));
  app.get('/api/api-keys-public', (_req, res) => res.json(getApiKeys()));

  // ------------------------------------------------------------ realtime events (SSE)
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    const off = onEvent((e) => {
      try {
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      } catch {
        /* client gone */
      }
    });
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* ignore */
      }
    }, 25_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      off();
      try {
        res.end();
      } catch {
        /* ignore */
      }
    });
  });

  // ------------------------------------------------------------ license (per-client installs)
  app.get('/api/license', (_req, res) => res.json(getLicense()));

  app.post('/api/license/activate', async (req, res) => {
    try {
      const s = await activateLicense(String(req.body?.key || ''));
      audit(s.ok ? 'license.activated' : 'license.blocked', { module: 'license', result: s.ok ? 'ok' : 'error', detail: s.status });
      res.json(s);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'تعذر التفعيل.' });
    }
  });

  // ------------------------------------------------------------ v2 additive APIs (foundation)
  app.get('/api/v2/audit-log', (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const module = typeof req.query.module === 'string' ? req.query.module : undefined;
    res.json(getAudit(limit, module));
  });

  app.get('/api/v2/notifications', (req, res) => {
    res.json({ unread: unreadCount(), items: getNotifications(req.query.unread === '1') });
  });

  app.post('/api/v2/notifications/:id/read', (req, res) => {
    markNoticeRead(req.params.id);
    res.json({ ok: true, unread: unreadCount() });
  });

  // ------------------------------------------------------------ accounts (multi-number)
  app.get('/api/accounts', (_req, res) => {
    res.json({ accounts: wa.listAccounts(), activeAccountId: wa.getActiveId(), rotation: wa.getRotation() });
  });

  app.post('/api/accounts', (req, res) => {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم الحساب مطلوب.' });
    const licNow = getLicense();
    if (licNow.ok && licNow.maxAccounts > 0 && wa.listAccounts().length >= licNow.maxAccounts)
      return res.status(403).json({ error: `خطتك تسمح بـ ${licNow.maxAccounts} أرقام فقط.` });
    res.json({ accounts: wa.createAccount(String(name).trim()), activeAccountId: wa.getActiveId() });
  });

  app.get('/api/accounts/:id/status', (req, res) => {
    const s = wa.accountStatus(req.params.id);
    if (!s) return res.status(404).json({ error: 'الحساب غير موجود.' });
    res.json(s);
  });

  app.post('/api/accounts/:id/connect', async (req, res) => {
    try {
      const status = await wa.connectAccount(req.params.id);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر بدء الجلسة.' });
    }
  });

  app.post('/api/accounts/:id/disconnect', async (req, res) => {
    try {
      const status = await wa.disconnectAccount(req.params.id);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر قطع الاتصال.' });
    }
  });

  app.post('/api/accounts/:id/activate', (req, res) => {
    if (!wa.activate(req.params.id)) return res.status(404).json({ error: 'الحساب غير موجود.' });
    res.json({ ok: true, activeAccountId: wa.getActiveId() });
  });

  app.post('/api/accounts/:id/pause', (req, res) => {
    const paused = req.body?.paused !== false;
    if (!wa.setPaused(req.params.id, paused)) return res.status(404).json({ error: 'الحساب غير موجود.' });
    res.json({ ok: true });
  });

  app.delete('/api/accounts/:id', async (req, res) => {
    try {
      const accounts = await wa.deleteAccount(req.params.id);
      res.json({ accounts, activeAccountId: wa.getActiveId() });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر حذف الحساب.' });
    }
  });

  app.put('/api/settings/rotation', (req, res) => {
    try {
      wa.setRotation(req.body || {});
      res.json({ ok: true, rotation: wa.getRotation() });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'إعدادات غير صالحة.' });
    }
  });

  // ------------------------------------------------------------ WhatsApp session (active account, compat)
  app.get('/api/whatsapp/status', (_req, res) => res.json(wa.getStatus()));

  app.post('/api/whatsapp/connect', async (_req, res) => {
    try {
      const status = await wa.start();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر بدء الجلسة.' });
    }
  });

  app.post('/api/whatsapp/disconnect', async (_req, res) => {
    try {
      const status = await wa.stop();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر قطع الاتصال.' });
    }
  });

  // ------------------------------------------------------------ real sending (queued, anti-block enforced)
  app.post('/api/send-check', (req, res) => {
    const { phones, message } = req.body || {};
    const list: string[] = (Array.isArray(phones) ? phones : [])
      .map((p: unknown) => String(p || '').replace(/[^0-9]/g, ''))
      .filter((p: string) => p.length >= 9 && p.length <= 15);
    res.json(checkDuplicates(list, String(message || '')));
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    try {
      const gate = licenseSendGate();
      if (gate) return res.status(403).json({ error: gate });
      const { phone, phones, message, mediaType, mediaUrl, mediaName, variables = {}, fast, accountId, force } = req.body || {};
      const list: string[] = (Array.isArray(phones) ? phones : phone ? [phone] : [])
        .map((p: unknown) => String(p || '').replace(/[^0-9]/g, ''))
        .filter((p: string) => p.length >= 9 && p.length <= 15);
      if (!list.length) return res.status(400).json({ error: 'أدخل رقماً واحداً صالحاً على الأقل.' });
      if (!message && !mediaUrl) return res.status(400).json({ error: 'الرسالة فارغة.' });
      if (mediaUrl && mediaType && mediaType !== 'none') {
        const check = await checkMediaUrl(String(mediaUrl));
        if (!check.ok) return res.status(400).json({ error: check.error });
      }
      const pinned = accountId && accountId !== 'auto' ? String(accountId) : null;
      if (pinned) {
        const picked = wa.pickSession(undefined, pinned);
        if ('error' in picked) return res.status(409).json({ error: picked.error });
      } else if (!wa.listAccounts().length) {
        return res.status(409).json({ error: 'لا توجد حسابات واتساب. أنشئ حساباً واربط رقماً أولاً.' });
      }
      // otherwise enqueue even if sessions are momentarily reconnecting —
      // the worker parks jobs and sends them once accounts are back

      // dedupe on the FINAL text (variables resolved): same template with
      // different names counts as different messages. force skips all guards.
      const forced = force === true;
      // resolve per-recipient before hashing (variables may differ per phone)
      const contactsByPhone = new Map(getContacts().map((c) => [String(c.phone).replace(/[^0-9]/g, ''), c]));
      const withHash = list.map((p) => {
        const c = contactsByPhone.get(p);
        const resolved = String(message || '').replace(/\{\{\s*name\s*\}\}|\{\s*name\s*\}|\[\s*name\s*\]/gi, c?.name || (variables as any)?.name || '');
        return { phone: p, hash: messageHash(resolved) };
      });
      const seen = new Set<string>();
      const dupesInList: string[] = [];
      const unique: string[] = [];
      const alreadySent: string[] = [];
      if (!forced) {
        for (const { phone: p, hash: h } of withHash) {
          if (seen.has(p)) { if (!dupesInList.includes(p)) dupesInList.push(p); continue; }
          seen.add(p);
          if (hasBeenSent(p, h)) { alreadySent.push(p); continue; }
          unique.push(p);
        }
        if (!unique.length) return res.status(409).json({ error: 'كل الأرقام مكررة أو استلمت نفس الرسالة من قبل.', alreadySent, dupesInList });
      } else {
        for (const { phone: p } of withHash) {
          if (seen.has(p)) { if (!dupesInList.includes(p)) dupesInList.push(p); continue; }
          seen.add(p);
          unique.push(p);
        }
      }

      const jobs: SendJob[] = unique.map((p) => ({
        id: `job-${Date.now()}-${p}-${Math.floor(Math.random() * 99999)}`,
        phone: p,
        text: message || '',
        messageHash: messageHash(String(message || '')),
        mediaType,
        mediaUrl,
        mediaName,
        variables,
        accountId: pinned,
        fast: fast !== false,
        force: forced,
        createdAt: Date.now(),
      }));
      const ids = enqueueJobs(jobs);
      return res.json({ accepted: true, jobCount: ids.length, jobIds: ids, skipped: alreadySent.length + dupesInList.length, alreadySent });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'خطأ داخلي.' });
    }
  });

  // ------------------------------------------------------------ collections (persist + broadcast)
  app.put('/api/contacts', async (req, res) => {
    const list = Array.isArray(req.body) ? req.body : [];
    await writeJSON('contacts', list);
    res.json({ ok: true, count: list.length });
  });

  app.put('/api/groups', async (req, res) => {
    const list = Array.isArray(req.body) ? req.body : [];
    await writeJSON('contact-groups', list);
    res.json({ ok: true, count: list.length });
  });

  app.put('/api/templates', async (req, res) => {
    const list = Array.isArray(req.body) ? req.body : [];
    await writeJSON('templates', list);
    res.json({ ok: true, count: list.length });
  });

  app.put('/api/bot-rules', async (req, res) => {
    const list = Array.isArray(req.body) ? req.body : [];
    await writeJSON('bot-rules', list);
    res.json({ ok: true, count: list.length });
  });

  app.put('/api/bot-config', async (req, res) => {
    await writeJSON('bot-config', req.body || {});
    res.json({ ok: true });
  });

  app.put('/api/settings/antiblock', async (req, res) => {
    await writeJSON('antiblock', req.body || {});
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ campaigns
  app.get('/api/campaigns', (_req, res) => res.json(getCampaigns()));

  app.put('/api/campaigns', async (req, res) => {
    const list = Array.isArray(req.body) ? req.body : [];
    await writeJSON('campaigns', list);
    emit({ type: 'campaigns' });
    res.json({ ok: true, count: list.length });
  });

  app.post('/api/campaigns', async (req, res) => {
    const body = req.body || {};
    if (!body.name || !body.messageTemplate) {
      return res.status(400).json({ error: 'اسم الحملة ونص الرسالة مطلوبان.' });
    }
    if (body.media?.url) {
      const check = await checkMediaUrl(String(body.media.url));
      if (!check.ok) return res.status(400).json({ error: `مرفق الحملة: ${check.error}` });
    }
    const campaign: Campaign = {
      id: `cmp-${Date.now().toString().slice(-6)}`,
      name: String(body.name),
      status: 'draft',
      targetAudience: String(body.targetAudience || ''),
      audienceTag: body.audienceTag || 'all',
      accountIds: Array.isArray(body.accountIds) && body.accountIds.length ? body.accountIds : ['all'],
      manualPhones: Array.isArray(body.manualPhones) ? body.manualPhones : [],
      totalRecipients: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      repliedCount: 0,
      failedCount: 0,
      messageTemplate: String(body.messageTemplate),
      messageVariants: Array.isArray(body.messageVariants)
        ? body.messageVariants.map((v: unknown) => String(v || '').trim()).filter(Boolean).slice(0, 10)
        : undefined,
      media: body.media,
      createdAt: new Date().toLocaleString('ar-EG'),
      scheduledFor: body.scheduledFor,
      scheduledAt: body.scheduledAt,
      antiBlockConfig: body.antiBlockConfig || getAntiBlock(),
      progressPercent: 0,
    };
    if (body.scheduledAt) campaign.status = 'scheduled';
    const camps = [...getCampaigns(), campaign];
    await writeJSON('campaigns', camps);
    emit({ type: 'campaigns' });
    res.json(campaign);
  });

  app.post('/api/campaigns/:id/start', (req, res) => {
    const gate = licenseSendGate();
    if (gate) return res.status(403).json({ error: gate });
    const result = startCampaign(req.params.id, (req.body || {}).force === true);
    if (!result.ok) return res.status(400).json({ error: result.error });
    audit('campaign.started', { module: 'campaigns', entity: req.params.id });
    res.json({ ok: true });
  });

  app.post('/api/campaigns/:id/pause', (req, res) => {
    if (!setCampaignStatus(req.params.id, 'paused')) return res.status(404).json({ error: 'غير موجودة.' });
    res.json({ ok: true });
  });

  app.post('/api/campaigns/:id/resume', (req, res) => {
    if (!setCampaignStatus(req.params.id, 'running')) return res.status(404).json({ error: 'غير موجودة.' });
    res.json({ ok: true });
  });

  app.post('/api/campaigns/:id/stop', (req, res) => {
    if (!setCampaignStatus(req.params.id, 'completed')) return res.status(404).json({ error: 'غير موجودة.' });
    res.json({ ok: true });
  });

  // per-campaign report: saved snapshot when finished, live otherwise
  app.get('/api/campaigns/:id/report', (req, res) => {
    const report = getCampaignReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'الحملة غير موجودة.' });
    res.json(report);
  });

  // report as downloadable CSV (Excel-friendly with BOM)
  app.get('/api/campaigns/:id/report.csv', (req, res) => {
    const report = getCampaignReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'الحملة غير موجودة.' });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      '\uFEFF' + ['phone', 'status', 'account', 'error', 'time'].map(esc).join(','),
      ...report.recipients.map((r) =>
        [
          r.phone,
          r.status === 'sent' ? 'sent' : r.status === 'failed' ? 'failed' : 'pending',
          r.accountName || '',
          r.error || '',
          r.ts ? new Date(r.ts).toLocaleString('ar-EG') : '',
        ]
          .map(esc)
          .join(','),
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${report.campaignId}-report.csv"`);
    res.send(lines.join('\n'));
  });

  // WhatsApp number existence check (background job with progress)
  app.post('/api/contacts/check', (req, res) => {
    try {
      const { phones, accountId, autoApply } = req.body || {};
      let list: string[] = [];
      if (Array.isArray(phones) && phones.length) {
        list = phones as string[];
      } else {
        // default: all active contacts
        list = getContacts()
          .filter((c) => c.status === 'active')
          .map((c) => c.phone);
      }
      if (!list.length) return res.status(400).json({ error: 'لا توجد أرقام للفحص.' });
      const jobId = startCheckJob(list, accountId && accountId !== 'auto' ? String(accountId) : null, autoApply !== false);
      res.json({ jobId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر بدء الفحص.' });
    }
  });

  app.get('/api/contacts/check/:jobId', (req, res) => {
    const job = getCheckJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'مهمة الفحص غير موجودة.' });
    res.json(job);
  });

  app.delete('/api/campaigns/:id', async (req, res) => {
    setCampaignStatus(req.params.id, 'completed');
    const rest = getCampaigns().filter((c) => c.id !== req.params.id);
    await writeJSON('campaigns', rest);
    const reports = readJSON<Record<string, unknown>>('reports', {});
    if (reports[req.params.id]) {
      delete reports[req.params.id];
      await writeJSON('reports', reports);
    }
    audit('campaign.deleted', { module: 'campaigns', entity: req.params.id });
    emit({ type: 'campaigns' });
    res.json({ ok: true });
  });

  // anti-block analyzer (pure, real heuristic mirror of the client utils)
  app.post('/api/campaigns/analyze', (req, res) => {
    try {
      const { message, recipientCount = 100, delaySeconds = 12, useSpintax = false } = req.body || {};
      const spintaxRegex = /\{([^{}]+)\}/g;
      const spintaxMatches = (message || '').match(spintaxRegex) || [];
      const hasSpintax = spintaxMatches.length > 0 || useSpintax;
      let variations = 1;
      spintaxMatches.forEach((match: string) => {
        variations *= Math.max(1, match.slice(1, -1).split('|').length);
      });
      let riskScore = 10;
      const recommendations: string[] = [];
      if (!hasSpintax) {
        riskScore += 30;
        recommendations.push('فعّل Spintax لتوليد نصوص مختلفة لكل عميل وتفادي كشف الرسائل المتطابقة.');
      } else {
        recommendations.push(`Spintax مفعّلة وتوفر أكثر من ${variations} صياغة مختلفة.`);
      }
      if (delaySeconds < 15) {
        riskScore += 45;
        recommendations.push('التأخير قليل جداً (< 15 ثانية). اضبطه بين 15-28 ثانية.');
      } else {
        recommendations.push(`معدل الإرسال آمن (${delaySeconds} ثانية بين الرسائل).`);
      }
      if (recipientCount > 500) {
        recommendations.push('أكثر من 500 مستلم: فعّل وضع التسخين وقسّم الإرسال إلى دفعات.');
      }
      const riskLevel = riskScore < 30 ? 'آمن جداً (Safe)' : riskScore < 60 ? 'متوسط (Moderate)' : 'مرتفع المخاطر (High Risk)';
      return res.json({
        riskScore,
        riskLevel,
        variations,
        estimatedDurationMinutes: Math.ceil((recipientCount * delaySeconds) / 60),
        recommendations,
        safeHourlyCap: 25,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------------ inbox
  app.get('/api/conversations', (_req, res) => res.json(getConversations()));

  app.post('/api/conversations/:id/send', async (req, res) => {
    try {
      const gate = licenseSendGate();
      if (gate) return res.status(403).json({ error: gate });
      const list = getConversations();
      const conv = list.find((c) => c.id === req.params.id);
      if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة.' });
      const { text, mediaType, mediaUrl, mediaName } = req.body || {};
      if (!text && !mediaUrl) return res.status(400).json({ error: 'النص أو المرفق مطلوب.' });
      const media =
        mediaUrl && mediaType && mediaType !== 'none'
          ? {
              type: mediaType as 'image' | 'video' | 'audio' | 'document',
              url: String(mediaUrl),
              name: mediaName ? String(mediaName) : 'مرفق',
            }
          : null;
      // agent replies go out from the same account the customer wrote to
      const result = await wa.routeSend(conv.contactPhone, text || '', media, {
        accountId: conv.accountId || null,
      });
      const msg: ChatMessage = {
        id: `m-agent-${Date.now()}`,
        sender: 'agent',
        text: text || '',
        timestamp: new Date().toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        status: result.success ? 'sent' : 'failed',
        media: media || undefined,
      };
      conv.messages.push(msg);
      conv.lastMessageTime = msg.timestamp;
      await writeJSON('conversations', list);
      emit({ type: 'conversations' });
      if (result.success) {
        bumpStat('sent');
        bumpStat('delivered');
      } else bumpStat('failed');
      if (!result.success) return res.status(502).json({ error: result.error, message: msg });
      res.json({ ok: true, message: msg, messageId: result.messageId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'خطأ داخلي.' });
    }
  });

  app.post('/api/conversations/:id/read', async (req, res) => {
    const list = getConversations();
    const conv = list.find((c) => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة.' });
    conv.unreadCount = 0;
    await writeJSON('conversations', list);
    emit({ type: 'conversations' });
    try {
      const chatId = conv.contactPhone.includes('@') ? conv.contactPhone : `${conv.contactPhone}@s.whatsapp.net`;
      await wa.markRead(conv.accountId || wa.getActiveId() || '', chatId);
    } catch {
      /* best effort */
    }
    res.json({ ok: true });
  });

  app.post('/api/conversations/:id/bot', async (req, res) => {
    const list = getConversations();
    const conv = list.find((c) => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة.' });
    conv.botActive = req.body?.botActive !== false;
    await writeJSON('conversations', list);
    emit({ type: 'conversations' });
    res.json({ ok: true, botActive: conv.botActive });
  });

  // ------------------------------------------------------------ Meta (Messenger + Instagram)
  app.get('/api/meta/status', (_req, res) => res.json(metaStatus()));

  app.post('/api/meta/connect', async (req, res) => {
    try {
      const s = await connectMeta(String(req.body?.token || ''));
      audit('meta.connected', { module: 'meta', detail: s.pageName });
      res.json(metaStatus());
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'تعذر الربط.' });
    }
  });

  app.post('/api/meta/disconnect', (_req, res) => {
    disconnectMeta();
    audit('meta.disconnected', { module: 'meta' });
    res.json({ ok: true });
  });

  app.get('/api/meta/conversations', (_req, res) => res.json(getMetaConversations()));

  app.post('/api/meta/send', async (req, res) => {
    try {
      const gate = licenseSendGate();
      if (gate) return res.status(403).json({ error: gate });
      const { psid, text } = req.body || {};
      if (!psid || !String(text || '').trim()) return res.status(400).json({ error: 'psid والنص مطلوبان.' });
      const r = await metaSend(String(psid), String(text));
      pushMetaOutgoing(String(psid), String(text));
      bumpStat('sent');
      bumpStat('delivered');
      emit({ type: 'meta' });
      res.json({ ok: true, messageId: r.messageId });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'تعذر الإرسال.' });
    }
  });

  app.post('/api/meta/read', async (req, res) => {
    const { psid } = req.body || {};
    if (!psid) return res.status(400).json({ error: 'psid مطلوب.' });
    markMetaRead(String(psid));
    emit({ type: 'meta' });
    res.json({ ok: true });
  });

  app.post('/api/meta/comments-toggle', (req, res) => {
    res.json(setAutoReplyComments(req.body?.enabled === true));
  });

  // Meta polling loop: pull inbox every 30s, bot auto-replies like WhatsApp
  setInterval(
    () =>
      void (async () => {
        try {
          if (!getMetaSettings().connected) return;
          await metaPoll();
          emit({ type: 'meta' });
          const incoming = takePendingIncoming();
          if (!incoming.length) return;
          const botCfg = getBotConfig();
          if (!botCfg.enabled) return;
          for (const msg of incoming) {
            try {
              if (licenseSendGate()) continue;
              const answer = await answerBot(msg.text, []);
              if (!answer?.reply) continue;
              await metaSend(msg.psid, answer.reply);
              pushMetaOutgoing(msg.psid, answer.reply);
              bumpStat('sent');
              bumpStat('delivered');
            } catch (err: any) {
              console.error('[meta] auto-reply failed:', err?.message);
            }
          }
          emit({ type: 'meta' });
        } catch (err: any) {
          console.error('[meta] poll loop:', err?.message);
        }
      })(),
    30_000,
  );

  // Meta comments loop: public auto-reply with the same bot engine (60s)
  setInterval(
    () =>
      void (async () => {
        try {
          const cfg = getMetaSettings();
          if (!cfg.connected || !cfg.autoReplyComments) return;
          if (!getBotConfig().enabled) return;
          const comments = await metaPollComments();
          for (const c of comments) {
            try {
              if (!commentWorthReply(c.text)) {
                markCommentReplied(c.id);
                continue;
              }
              if (licenseSendGate()) continue;
              const answer = await answerBot(c.text, []);
              if (!answer?.reply) {
                markCommentReplied(c.id);
                continue;
              }
              await metaReplyComment(c.id, c.channel, answer.reply);
              bumpStat('sent');
              bumpStat('delivered');
            } catch (err: any) {
              console.error('[meta] comment reply failed:', err?.message);
            }
          }
        } catch (err: any) {
          console.error('[meta] comments loop:', err?.message);
        }
      })(),
    60_000,
  );

  // ------------------------------------------------------------ AI settings + generation
  app.get('/api/settings/ai', (_req, res) => res.json(aiStatus()));

  // available models per provider (uses saved server-side key)
  app.get('/api/settings/ai/models', async (req, res) => {
    const p = String(req.query.provider || '');
    if (!['gemini', 'groq', 'nvidia'].includes(p)) return res.status(400).json({ error: 'مزود غير صالح.' });
    res.json({ models: await listModels(p as 'gemini' | 'groq' | 'nvidia') });
  });

  app.put('/api/settings/ai', (req, res) => {
    try {
      const { provider, geminiKey, groqKey, groqModel, nvidiaKey, nvidiaModel } = req.body || {};
      if (provider && !['auto', 'gemini', 'groq', 'nvidia'].includes(provider)) {
        return res.status(400).json({ error: 'مزود غير صالح.' });
      }
      const saved = saveAiSettings({
        ...(provider ? { provider } : {}),
        ...(typeof geminiKey === 'string' ? { geminiKey: geminiKey.trim() } : {}),
        ...(typeof groqKey === 'string' ? { groqKey: groqKey.trim() } : {}),
        ...(typeof groqModel === 'string' && groqModel.trim() ? { groqModel: groqModel.trim() } : {}),
        ...(typeof nvidiaKey === 'string' ? { nvidiaKey: nvidiaKey.trim() } : {}),
        ...(typeof nvidiaModel === 'string' && nvidiaModel.trim() ? { nvidiaModel: nvidiaModel.trim() } : {}),
      });
      console.log(`[ai] settings saved provider=${saved.provider}`);
      res.json(aiStatus());
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر حفظ الإعدادات.' });
    }
  });

  // generate alternative phrasings of a message
  app.post('/api/ai/variants', async (req, res) => {
    try {
      const { text, count } = req.body || {};
      if (!text || typeof text !== 'string' || text.trim().length < 3) {
        return res.status(400).json({ error: 'أدخل نص الرسالة أولاً.' });
      }
      const n = Math.max(2, Math.min(30, Number(count) || 4));
      const { variants, provider } = await aiVariants(text.trim(), n);
      if (!variants.length) {
        const last = getLastAiError();
        const detail = last ? ` [${last.provider} ${last.status}] ${last.detail}` : '';
        return res.status(502).json({ error: `تعذر التوليد.${detail}` });
      }
      res.json({ variants, provider });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر التوليد.' });
    }
  });

  // live test of the smart reply engine (used by the AI settings card)
  app.post('/api/ai/test', async (req, res) => {
    try {
      const { message } = req.body || {};
      if (!message) return res.status(400).json({ error: 'أدخل رسالة للاختبار.' });
      const reply = await aiChat('أنت مساعد ودود يجيب بإيجاز بالعربية.', [{ role: 'user', text: String(message) }], 0.7);
      if (!reply) {
        const last = getLastAiError();
        const detail = last ? ` [${last.provider} ${last.status}] ${last.detail}` : '';
        return res.status(502).json({ error: `فشل الاتصال بالمزود.${detail}` });
      }
      res.json({ reply: reply.text, provider: reply.provider });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر الاختبار.' });
    }
  });

  // ------------------------------------------------------------ bot chat (test + engine)
  app.post('/api/bot/chat', async (req, res) => {
    try {
      const { message, conversationHistory = [] } = req.body || {};
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message text is required.' });
      }
      const answer = await answerBot(
        message,
        Array.isArray(conversationHistory)
          ? conversationHistory.map((m: any) => ({ role: m.role, text: m.text || m.content || '' }))
          : [],
      );
      return res.json({
        reply: answer.reply,
        source: answer.source,
        action: answer.action === 'opt_out' ? 'unsubscribed' : 'bot_reply',
        isOptOut: answer.isOptOut,
        ruleId: answer.ruleId,
      });
    } catch (err: any) {
      console.error('Bot endpoint error:', err);
      return res.status(500).json({ error: 'Internal server error processing bot reply.' });
    }
  });

  // ------------------------------------------------------------ api keys
  app.get('/api/api-keys', (_req, res) => res.json(getApiKeys()));

  app.post('/api/api-keys', async (req, res) => {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المفتاح مطلوب.' });
    const suffix = crypto.randomBytes(16).toString('hex');
    const isTest = /test|اختبار|dev|تطوير/i.test(String(name));
    const fullKey = `${isTest ? 'wp_test_' : 'wp_live_'}${suffix}`;
    const item: ApiKeyItem = {
      id: `key-${Date.now()}`,
      name: String(name).trim(),
      keyPrefix: fullKey.slice(0, 12),
      fullKey,
      createdDate: new Date().toLocaleDateString('ar-EG'),
      lastUsedDate: 'لم يُستخدم بعد',
      status: 'active',
    };
    const keys = [...getApiKeys(), item];
    await writeJSON('api-keys', keys);
    res.json(item);
  });

  app.delete('/api/api-keys/:id', async (req, res) => {
    const keys = getApiKeys().filter((k) => k.id !== req.params.id);
    await writeJSON('api-keys', keys);
    res.json({ ok: true });
  });

  app.post('/api/api-keys/:id/revoke', async (req, res) => {
    const keys = getApiKeys();
    const k = keys.find((x) => x.id === req.params.id);
    if (!k) return res.status(404).json({ error: 'غير موجود.' });
    k.status = 'revoked';
    await writeJSON('api-keys', keys);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ webhook test (real HTTP)
  app.post('/api/webhooks/test', async (req, res) => {
    const { url } = req.body || {};
    if (!url || !/^https?:\/\//i.test(String(url))) {
      return res.status(400).json({ error: 'رابط الويب هوك غير صالح. يجب أن يبدأ بـ http(s)://' });
    }
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(String(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'whatspro.test', timestamp: new Date().toISOString() }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      res.json({ ok: response.ok, statusCode: response.status, ms: Date.now() - started });
    } catch (err: any) {
      res.json({ ok: false, statusCode: 0, ms: Date.now() - started, error: String(err?.message || err).slice(0, 200) });
    }
  });

  // ------------------------------------------------------------ public developer API (key-guarded)
  const requireKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = validateApiKey(req.headers['x-api-key'] as string);
    if (!key) return res.status(401).json({ error: 'Invalid or missing API key. Send it in the X-API-KEY header.' });
    (req as any).apiKey = key;
    touchApiKey(key.id);
    next();
  };

  app.get('/api/v1/status', requireKey, (_req, res) => {
    const s = wa.getStatus();
    res.json({ connected: s.state === 'connected', user: s.user, queue: getQueueStatus().pending });
  });

  app.post('/api/v1/send', requireKey, async (req, res) => {
    try {
      const gate = licenseSendGate();
      if (gate) return res.status(403).json({ error: gate });
      const { phone, message, mediaType, mediaUrl } = req.body || {};
      const clean = String(phone || '').replace(/[^0-9]/g, '');
      if (clean.length < 9 || !message) return res.status(400).json({ error: 'phone and message are required.' });
      if (mediaUrl && mediaType && mediaType !== 'none') {
        const check = await checkMediaUrl(String(mediaUrl));
        if (!check.ok) return res.status(400).json({ error: check.error });
      }
      if (!wa.isConnected()) return res.status(409).json({ error: 'WhatsApp session is not connected.' });
      const job: SendJob = {
        id: `job-v1-${Date.now()}-${clean}`,
        phone: clean,
        text: String(message),
        mediaType,
        mediaUrl,
        fast: false,
        createdAt: Date.now(),
      };
      const [jobId] = enqueueJobs([job]);
      res.json({ accepted: true, jobId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'internal error' });
    }
  });

  // ------------------------------------------------------------ vite / static
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // bundled backend lives in dist-server/, frontend in ../dist; dev root has dist/
    const distDir = [path.resolve(__dirname, 'dist'), path.resolve(__dirname, '..', 'dist')].find((d) => {
      try {
        return fs.existsSync(d);
      } catch {
        return false;
      }
    }) || path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsPro Server running at http://0.0.0.0:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
});
