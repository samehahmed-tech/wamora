# Wamora — وامورا | WhatsApp Marketing & Automation (self-hosted, free)

منصة ذاتية مجانية لإدارة حملات الواتساب: إرسال جماعي، بوت ذكي (Gemini/Groq)، حماية من الحظر، صندوق وارد حي، API للمطورين — بدون WhatsApp Cloud API وبدون رسوم.

## التشغيل محلياً

```bash
npm install
cp .env.example .env   # ثم املأ المفاتيح الاختيارية
npm run dev            # http://localhost:3000
```

## النشر أونلاين (رابط واحد للعملاء)

تحتاج: سيرفر VPS (أوبونتو 22.04 — مثل Contabo/Hetzner ~6$/شهر) + دومين.

**1. على السيرفر — تثبيت Docker:**
```bash
curl -fsSL https://get.docker.com | sh
```

**2. انسخ المشروع إلى السيرفر```
/opt/wamora
``` وضع ملف `.env` (انسخ `.env.example` واملأه — GEMINI اختياري).

**3. عدّل `Caddyfile` وضع دومينك مكان `your-domain.com`، ووجّه سجل DNS من نوع A إلى IP السيرفر.**

**4. شغّل:**
```bash
cd /opt/wamora
docker compose up -d --build
```

خلال دقيقة: `https://your-domain.com` يعمل بشهادة HTTPS تلقائية. ثم اربط رقم الواتساب من صفحة "الأرقام والحسابات" وأرسل الرابط للعميل.

**أوامر مفيدة:**
```bash
docker compose logs -f wamora     # سجلات الخادم
docker compose up -d --build      # تحديث بعد نسخ نسخة جديدة
docker compose down               # إيقاف

# نسخة احتياطية من كل البيانات (الجلسات + جهات الاتصال + الحملات + الوسائط):
docker run --rm -v wamora_wamora-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/wamora-backup-$(date +%F).tar.gz -C /data .
```

**جدار ناري أساسي (UFW):**
```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

## ملاحظات الإنتاج

- البيانات في مجلد Docker volume دائم (`wamora-data`) — لن تضيع عند التحديث أو إعادة التشغيل.
- النسخة الحالية **مستأجر واحد**: الرابط الواحد = حساب واحد. لبيع النظام لعدة عملاء بحسابات منفصلة يلزم طبقة الدخول والعزل (الخطوة التالية المقترحة: Supabase Auth + PostgreSQL).
- الربط عبر WhatsApp Web غير رسمي: خصص رقماً للإرسال (ليس رقمك الشخصي) والتزم حدود الحماية الافتراضية.
