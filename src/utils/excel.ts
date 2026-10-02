import * as XLSX from 'xlsx';
import { parseCSVContent, ParsedCsvRow } from './antiBlock';

function rowsToCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/** Parse first sheet of xlsx/xls into same shape as CSV parser. Region col kept as tag source. */
export async function parseExcelFile(file: File, defaultCountryCode = '20'): Promise<{
  rows: ParsedCsvRow[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  headers: string[];
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], totalRows: 0, validCount: 0, invalidCount: 0, headers: [] };
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
  const clean = (aoa as unknown as string[][]).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim()));
  if (!clean.length) return { rows: [], totalRows: 0, validCount: 0, invalidCount: 0, headers: [] };
  return parseCSVContent(rowsToCsv(clean as string[][]), defaultCountryCode);
}

/** Normalize header names: منطقة/مدينة/region/city -> التصنيف fallback handled by CSV parser tagIdx? Region lives in tag or notes; caller maps it. */
export function extractRegion(raw: Record<string, string>): string {
  for (const [k, v] of Object.entries(raw)) {
    const lk = k.toLowerCase();
    if (lk.includes('منطقة') || lk.includes('مدينة') || lk.includes('region') || lk.includes('city') || lk.includes('محافظ')) {
      const s = String(v || '').trim();
      if (s) return s;
    }
  }
  return '';
}
