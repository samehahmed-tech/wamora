import { AntiBlockConfig } from '../types';

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  localPrefix?: string;
  expectedLength: number[];
}

export const SUPPORTED_COUNTRIES: Record<string, CountryInfo> = {
  '966': { code: '966', name: 'السعودية', flag: '🇸🇦', localPrefix: '05', expectedLength: [12] },
  '20': { code: '20', name: 'مصر', flag: '🇪🇬', localPrefix: '01', expectedLength: [12] },
  '971': { code: '971', name: 'الإمارات', flag: '🇦🇪', localPrefix: '05', expectedLength: [12] },
  '965': { code: '965', name: 'الكويت', flag: '🇰🇼', expectedLength: [11] },
  '974': { code: '974', name: 'قطر', flag: '🇶🇦', expectedLength: [11] },
  '968': { code: '968', name: 'عمان', flag: '🇴🇲', expectedLength: [11] },
  '973': { code: '973', name: 'البحرين', flag: '🇧🇭', expectedLength: [11] },
  '962': { code: '962', name: 'الأردن', flag: '🇯🇴', localPrefix: '07', expectedLength: [12] },
  '964': { code: '964', name: 'العراق', flag: '🇮🇶', localPrefix: '07', expectedLength: [13] },
  '212': { code: '212', name: 'المغرب', flag: '🇲🇦', localPrefix: '06', expectedLength: [12] },
  '213': { code: '213', name: 'الجزائر', flag: '🇩🇿', localPrefix: '05', expectedLength: [12] },
  '1': { code: '1', name: 'أمريكا / كندا', flag: '🇺🇸', expectedLength: [11] },
  '44': { code: '44', name: 'المملكة المتحدة', flag: '🇬🇧', localPrefix: '07', expectedLength: [12] },
  '90': { code: '90', name: 'تركيا', flag: '🇹🇷', localPrefix: '05', expectedLength: [12] },
};

/**
 * Normalizes Arabic numerals (٠-٩) to standard ASCII digits (0-9)
 */
export function normalizeArabicNumbers(str: string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[٠-٩]/g, (w) => arabicDigits.indexOf(w).toString());
}

export interface PhoneValidationResult {
  phone: string;
  isValid: boolean;
  formatted: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  errorReason?: string;
}

/**
 * Validates and sanitizes phone numbers with country prefix detection
 */
export function validatePhoneNumberWithCountry(
  raw: string,
  defaultCountryCode = '966'
): PhoneValidationResult {
  if (!raw || typeof raw !== 'string') {
    return {
      phone: '',
      isValid: false,
      formatted: '',
      countryCode: defaultCountryCode,
      countryName: SUPPORTED_COUNTRIES[defaultCountryCode]?.name || 'غير معروف',
      countryFlag: SUPPORTED_COUNTRIES[defaultCountryCode]?.flag || '🌐',
      errorReason: 'الرقم فارغ',
    };
  }

  let cleaned = normalizeArabicNumbers(raw).trim();
  cleaned = cleaned.replace(/[\s\-\(\)\.]/g, ''); // strip spaces, hyphens, parentheses

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // Remove non-digit characters
  const digitsOnly = cleaned.replace(/[^0-9]/g, '');
  if (digitsOnly.length === 0) {
    return {
      phone: '',
      isValid: false,
      formatted: raw,
      countryCode: defaultCountryCode,
      countryName: 'غير صالح',
      countryFlag: '⚠️',
      errorReason: 'لا يحتوي على أرقام',
    };
  }

  let normalized = digitsOnly;

  // Handle local prefixes:
  // e.g. 05XXXXXXXX in Saudi Arabia (defaultCode: 966)
  if (normalized.startsWith('05') && defaultCountryCode === '966') {
    normalized = '966' + normalized.substring(1);
  } else if (normalized.startsWith('01') && defaultCountryCode === '20') {
    // 01XXXXXXXXX in Egypt
    normalized = '20' + normalized.substring(1);
  } else if (normalized.startsWith('05') && defaultCountryCode === '971') {
    // 05XXXXXXXX in UAE
    normalized = '971' + normalized.substring(1);
  } else if (normalized.startsWith('07') && defaultCountryCode === '962') {
    // 07XXXXXXXX in Jordan
    normalized = '962' + normalized.substring(1);
  } else if (normalized.startsWith('0') && normalized.length <= 11) {
    // Other local numbers starting with 0: prepend default country code without leading zero
    normalized = defaultCountryCode + normalized.substring(1);
  } else if (normalized.length === 9 && !normalized.startsWith('966')) {
    normalized = defaultCountryCode + normalized;
  }

  // Detect which country code it matches
  let detectedCode = defaultCountryCode;
  // Sort country codes by descending length (e.g. 966 before 9)
  const sortedCodes = Object.keys(SUPPORTED_COUNTRIES).sort((a, b) => b.length - a.length);
  for (const c of sortedCodes) {
    if (normalized.startsWith(c)) {
      detectedCode = c;
      break;
    }
  }

  const country = SUPPORTED_COUNTRIES[detectedCode] || {
    code: detectedCode,
    name: `دولي (+${detectedCode})`,
    flag: '🌐',
    expectedLength: [11, 12, 13, 14],
  };

  // Validation criteria
  let isValid = true;
  let errorReason: string | undefined = undefined;

  if (normalized.length < 9) {
    isValid = false;
    errorReason = 'الرقم قصير جداً (أقل من 9 أرقام)';
  } else if (normalized.length > 15) {
    isValid = false;
    errorReason = 'الرقم طويل جداً (أكثر من 15 رقم)';
  }

  const formatted = isValid
    ? `+${detectedCode} ${normalized.slice(detectedCode.length)}`
    : normalized;

  return {
    phone: normalized,
    isValid,
    formatted,
    countryCode: detectedCode,
    countryName: country.name,
    countryFlag: country.flag,
    errorReason,
  };
}

/**
 * Robust CSV parser that handles quotes, delimiters, newlines, and BOM
 */
export interface ParsedCsvRow {
  name: string;
  phone: string;
  tag?: string;
  notes?: string;
  validation: PhoneValidationResult;
  raw: Record<string, string>;
}

export function parseCSVContent(
  csvText: string,
  defaultCountryCode = '966'
): {
  rows: ParsedCsvRow[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  headers: string[];
} {
  if (!csvText) {
    return { rows: [], totalRows: 0, validCount: 0, invalidCount: 0, headers: [] };
  }

  // Strip BOM if present
  let text = csvText.replace(/^\uFEFF/, '').trim();

  // Detect delimiter: check first line for comma vs semicolon vs tab
  const firstLine = text.split(/\r?\n/)[0] || '';
  let delimiter = ',';
  if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) {
    delimiter = ';';
  } else if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length) {
    delimiter = '\t';
  }

  // Parse lines with RFC-4180 quotes handling
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some((f) => f.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { rows: [], totalRows: 0, validCount: 0, invalidCount: 0, headers: [] };
  }

  // Determine headers
  const rawHeaders = lines[0].map((h) => h.toLowerCase().trim());
  const hasHeaderRow = rawHeaders.some(
    (h) =>
      h.includes('name') ||
      h.includes('phone') ||
      h.includes('mobile') ||
      h.includes('اسم') ||
      h.includes('هاتف') ||
      h.includes('جوال')
  );

  const dataRows = hasHeaderRow ? lines.slice(1) : lines;
  const headers = hasHeaderRow ? lines[0] : ['الاسم', 'رقم الهاتف', 'التصنيف', 'ملاحظات'];

  // Map header indexes
  let nameIdx = -1;
  let phoneIdx = -1;
  let tagIdx = -1;
  let notesIdx = -1;

  if (hasHeaderRow) {
    rawHeaders.forEach((h, idx) => {
      if (nameIdx === -1 && (h.includes('name') || h.includes('اسم') || h.includes('عميل'))) {
        nameIdx = idx;
      } else if (
        phoneIdx === -1 &&
        (h.includes('phone') ||
          h.includes('mobile') ||
          h.includes('هاتف') ||
          h.includes('جوال') ||
          h.includes('واتس') ||
          h.includes('tel'))
      ) {
        phoneIdx = idx;
      } else if (tagIdx === -1 && (h.includes('tag') || h.includes('تصنيف') || h.includes('وسم') || h.includes('group'))) {
        tagIdx = idx;
      } else if (notesIdx === -1 && (h.includes('note') || h.includes('ملاحظ') || h.includes('وصف'))) {
        notesIdx = idx;
      }
    });
  }

  // Fallback index assignment if not recognized
  if (phoneIdx === -1) {
    // Find column with numbers
    for (let c = 0; c < (dataRows[0]?.length || 0); c++) {
      const sampleVal = (dataRows[0]?.[c] || '').replace(/[^0-9]/g, '');
      if (sampleVal.length >= 8) {
        phoneIdx = c;
        break;
      }
    }
    if (phoneIdx === -1) phoneIdx = dataRows[0]?.length > 1 ? 1 : 0;
  }

  if (nameIdx === -1) {
    nameIdx = phoneIdx === 0 && (dataRows[0]?.length || 0) > 1 ? 1 : 0;
  }

  // Process rows
  const parsedRows: ParsedCsvRow[] = [];
  let validCount = 0;
  let invalidCount = 0;

  dataRows.forEach((row, index) => {
    const rawName = (nameIdx !== -1 && row[nameIdx] ? row[nameIdx] : `عميل ${index + 1}`).trim();
    const rawPhone = (phoneIdx !== -1 && row[phoneIdx] ? row[phoneIdx] : '').trim();
    const rawTag = tagIdx !== -1 && row[tagIdx] ? row[tagIdx].trim() : undefined;
    const rawNotes = notesIdx !== -1 && row[notesIdx] ? row[notesIdx].trim() : undefined;

    if (!rawPhone && !rawName) return;

    const validation = validatePhoneNumberWithCountry(rawPhone, defaultCountryCode);
    if (validation.isValid) {
      validCount++;
    } else {
      invalidCount++;
    }

    const rowObj: Record<string, string> = {};
    headers.forEach((h, i) => {
      rowObj[h] = row[i] || '';
    });

    parsedRows.push({
      name: rawName,
      phone: validation.phone,
      tag: rawTag,
      notes: rawNotes,
      validation,
      raw: rowObj,
    });
  });

  return {
    rows: parsedRows,
    totalRows: parsedRows.length,
    validCount,
    invalidCount,
    headers,
  };
}

/**
 * Sanitizes phone numbers into international E.164 format without '+'
 * (Backwards compatibility wrapper)
 */
export function sanitizePhoneNumber(raw: string, defaultCode = '966'): {
  phone: string;
  isValid: boolean;
  formatted: string;
} {
  const res = validatePhoneNumberWithCountry(raw, defaultCode);
  return {
    phone: res.phone,
    isValid: res.isValid,
    formatted: res.formatted,
  };
}

/**
 * Resolves a Spintax string like:
 * "{مرحباً|أهلاً|السلام عليكم} عزيزنا {العميل|المشترك}!"
 * into a single randomly picked variation.
 */
export function resolveSpintax(text: string, variables: Record<string, string> = {}): string {
  if (!text) return '';

  // Replace variable placeholders like {{name}}, {name}, [الاسم]
  let result = text;
  Object.keys(variables).forEach((key) => {
    const regexDouble = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    const regexSingle = new RegExp(`\\{${key}\\}`, 'gi');
    const regexBracket = new RegExp(`\\[${key}\\]`, 'gi');
    result = result
      .replace(regexDouble, variables[key])
      .replace(regexSingle, variables[key])
      .replace(regexBracket, variables[key]);
  });

  // Iteratively resolve spintax groups: {option1|option2|option3}
  const spintaxRegex = /\{([^{}]+)\}/;
  let match;
  while ((match = spintaxRegex.exec(result)) !== null) {
    const options = match[1].split('|');
    const chosen = options[Math.floor(Math.random() * options.length)];
    result = result.replace(match[0], chosen);
  }

  return result;
}

/**
 * Calculates total possible unique message variations a spintax template can produce
 */
export function calculateSpintaxPermutations(template: string): number {
  if (!template) return 1;
  const matches = template.match(/\{([^{}]+)\}/g);
  if (!matches || matches.length === 0) return 1;

  let total = 1;
  matches.forEach((group) => {
    const inner = group.slice(1, -1);
    const options = inner.split('|').filter(Boolean);
    if (options.length > 1) {
      total *= options.length;
    }
  });

  return total;
}

/**
 * Generates sample variations of a spintax template
 */
export function generateSpintaxSamples(template: string, sampleCount = 4, vars = { name: 'أحمد', code: 'PRO30' }): string[] {
  const samples = new Set<string>();
  const maxAttempts = sampleCount * 8;
  let attempts = 0;

  while (samples.size < sampleCount && attempts < maxAttempts) {
    samples.add(resolveSpintax(template, vars));
    attempts++;
  }

  return Array.from(samples);
}

/**
 * Calculates ban risk rating (0 - 100), health score, and risk advice
 */
export interface BanRiskAssessment {
  riskScore: number; // 0 (safest) to 100 (highest risk)
  healthScore: number; // 100 (best) to 0
  status: 'safe' | 'moderate' | 'high_risk';
  statusAr: string;
  statusColor: string;
  permutations: number;
  recommendations: string[];
}

export function assessBanRisk(
  config: AntiBlockConfig,
  template: string,
  recipientCount: number
): BanRiskAssessment {
  let risk = 12; // Base baseline risk
  const recommendations: string[] = [];

  const permutations = calculateSpintaxPermutations(template);

  // 1. Spintax analysis
  if (!config.useSpintax || permutations <= 1) {
    risk += 35;
    recommendations.push('قم بتفعيل Spintax وإضافة خيارات بديلة مثل {مرحباً|أهلاً بكم|السلام عليكم} لضمان عدم إرسال نص متطابق للجميع.');
  } else if (permutations < 6) {
    risk += 15;
    recommendations.push(`عدد الصياغات البديلة قليل (${permutations} صياغات). يُفضل زيادتها إلى 12 صياغة على الأقل لنسبة أمان أعلى.`);
  } else {
    recommendations.push(`حماية Spintax ممتازة: توفر خوارزمية الصياغات أكثر من ${permutations.toLocaleString('ar-SA')} تركيبة مختلفة.`);
  }

  // 2. Delay and Throttling
  if (config.minDelaySeconds < 12) {
    risk += 40;
    recommendations.push('الفاصل الزمني قليل جداً (< 12 ثانية). هذا يثير خوارزميات رصد السلوك الآلي في واتساب فوراً.');
  } else if (config.minDelaySeconds < 15) {
    risk += 18;
    recommendations.push('يُنصح برفع الحد الأدنى للفاصل الزمني إلى 15 ثانية أو أكثر بين كل رسالة وأخرى.');
  } else {
    recommendations.push(`الفاصل الزمني بين الرسائل مدروس وموزون (${config.minDelaySeconds} - ${config.maxDelaySeconds} ثانية مع فاصل عشوائي).`);
  }

  // 3. Batch pauses
  if (recipientCount > 100 && config.batchSize > 50 && config.batchPauseMinutes < 2) {
    risk += 20;
    recommendations.push('لحملة تتجاوز 100 رقم، يُوصى بتوقف مؤقت لمدة 3 إلى 5 دقائق بعد كل 30-50 رسالة لمحاكاة السلوك البشري.');
  }

  // 4. Warm-up mode
  if (recipientCount > 250 && !config.enableWarmupMode) {
    risk += 15;
    recommendations.push('تفعيل "وضع التسخين التدريجي" (Warm-up Mode) يضمن إرسال الرسائل على دفعات متباعدة تزداد تدريجياً.');
  }

  // 5. Unsubscribe keyword
  if (!config.autoUnsubscribeKeyword) {
    risk += 15;
    recommendations.push('تفعيل كشف طلبات الإلغاء (STOP / إلغاء) يقلل إبلاغات السبام بنسبة 92%.');
  }

  const finalRisk = Math.min(100, Math.max(5, risk));
  const healthScore = Math.max(0, 100 - finalRisk);

  let status: 'safe' | 'moderate' | 'high_risk' = 'safe';
  let statusAr = 'آمن ومحمي بنجاح';
  let statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

  if (finalRisk >= 55) {
    status = 'high_risk';
    statusAr = 'خطر حظر مرتفع';
    statusColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
  } else if (finalRisk >= 30) {
    status = 'moderate';
    statusAr = 'مستوى حظر متوسط';
    statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  }

  return {
    riskScore: finalRisk,
    healthScore,
    status,
    statusAr,
    statusColor,
    permutations,
    recommendations,
  };
}

/**
 * Returns a randomized delay in milliseconds with human jitter
 */
export function getHumanJitterDelayMs(minSec: number, maxSec: number): number {
  const min = Math.max(1, minSec);
  const max = Math.max(min, maxSec);
  const randomSec = min + Math.random() * (max - min);
  // Add micro jitter (+/- 350ms)
  const jitter = (Math.random() - 0.5) * 700;
  return Math.round(randomSec * 1000 + jitter);
}
