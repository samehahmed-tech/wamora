import { readJSON, writeJSON } from '../../store';

export interface Lead {
  id: string;
  name: string;
  category: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  rating: string;
  source: string;
  sourceUrl: string;
  tags: string[];
  savedAt: string;
}

/** category keyword → OSM tag filters */
const CATEGORY_FILTERS: Record<string, string[]> = {
  restaurant: ['["amenity"="restaurant"]', '["amenity"="fast_food"]'],
  cafe: ['["amenity"="cafe"]'],
  hotel: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="hostel"]'],
  pharmacy: ['["amenity"="pharmacy"]'],
  clinic: ['["amenity"="clinic"]', '["amenity"="doctors"]', '["amenity"="dentist"]', '["amenity"="hospital"]'],
  gym: ['["leisure"="fitness_centre"]'],
  salon: ['["shop"="hairdresser"]', '["shop"="beauty"]'],
  car: ['["shop"="car"]', '["shop"="car_repair"]'],
  school: ['["amenity"="school"]'],
  shop: ['["shop"]'],
};

const UA = { 'User-Agent': 'wamora-lead-finder/1.0 (business directory research)' } as const;

async function fetchJson(url: string, ms = 30_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers: { ...UA } as any, signal: controller.signal });
    if (!res.ok) throw new Error(`source ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function overpass(ql: string): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(UA as any) },
      body: `data=${encodeURIComponent(ql)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data: any = await res.json();
    return data?.elements || [];
  } finally {
    clearTimeout(timer);
  }
}

export interface LeadQuery {
  city: string;
  category: string;
  keyword: string;
  limit: number;
}

export async function searchLeads(q: LeadQuery): Promise<Lead[]> {
  const city = String(q.city || '').trim();
  const keyword = String(q.keyword || '').trim();
  if (!city) throw new Error('اكتب المدينة/المنطقة أولاً.');
  const limit = Math.max(10, Math.min(150, Number(q.limit) || 50));

  // 1. geocode area → bbox (public Nominatim, 1 call)
  const geo: any = await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`,
  );
  const g = geo?.[0];
  if (!g?.boundingbox) throw new Error('تعذر تحديد المنطقة. جرّب اسم أوضح (مدينة، دولة).');
  const [s, n, w, e] = (g.boundingbox as string[]).map(Number);
  const bbox = `${s},${w},${n},${e}`;
  const cityName = String(g.display_name || city).split(',').slice(0, 2).join(',').trim();

  // 2. POIs with names in bbox (public Overpass)
  const filters = CATEGORY_FILTERS[q.category] || ['["amenity"]', '["shop"]'];
  const nameRe = keyword ? `["name"~"${keyword.replace(/"/g, '')}",i]` : `["name"]`;
  const parts = filters
    .map((f) => `node${f}${nameRe}(${bbox});way${f}${nameRe}(${bbox});`)
    .join('');
  const elements = await overpass(`[out:json][timeout:25];(${parts});out center ${limit};`);

  const normPhone = (p: string) => String(p || '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const el of elements) {
    const t = el.tags || {};
    if (!t.name) continue;
    const phone = normPhone(t.phone || t['contact:phone'] || t.mobile || t['contact:mobile'] || '');
    const key = phone || `${String(t.name).toLowerCase()}|${String(t['addr:street'] || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const addr = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:city']]
      .filter(Boolean)
      .join('، ');
    out.push({
      id: `lead-${el.type}-${el.id}`,
      name: String(t.name),
      category: String(t.shop || t.amenity || t.tourism || t.leisure || q.category),
      phone,
      website: String(t.website || t['contact:website'] || ''),
      address: addr,
      city: String(t['addr:city'] || cityName),
      rating: '',
      source: 'OpenStreetMap',
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      tags: [],
      savedAt: '',
    });
    if (out.length >= limit) break;
  }
  return out;
}

const KEY = 'leads';
const CAP = 5000;

export function getLeads(): Lead[] {
  return readJSON<Lead[]>(KEY, []);
}

/** save search hits (dedupe against stored leads by phone or name+city) */
export function saveLeads(items: Lead[], tags: string[] = []): { saved: number; dupes: number } {
  const stored = getLeads();
  const havePhone = new Set(stored.map((l) => l.phone).filter(Boolean));
  const haveName = new Set(stored.map((l) => `${l.name.toLowerCase()}|${l.city.toLowerCase()}`));
  let saved = 0;
  let dupes = 0;
  for (const it of items) {
    const key = `${String(it.name).toLowerCase()}|${String(it.city).toLowerCase()}`;
    if ((it.phone && havePhone.has(it.phone)) || haveName.has(key)) {
      dupes++;
      continue;
    }
    if (it.phone) havePhone.add(it.phone);
    haveName.add(key);
    stored.unshift({ ...it, tags: [...(it.tags || []), ...tags], savedAt: new Date().toISOString() });
    saved++;
  }
  void writeJSON(KEY, stored.slice(0, CAP));
  return { saved, dupes };
}

export function deleteLead(id: string) {
  void writeJSON(KEY, getLeads().filter((l) => l.id !== id));
}

export function leadsToCsv(list: Lead[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['name', 'category', 'phone', 'website', 'address', 'city', 'source', 'sourceUrl'].map(esc).join(',');
  const rows = list.map((l) => [l.name, l.category, l.phone, l.website, l.address, l.city, l.source, l.sourceUrl].map(esc).join(','));
  return '﻿' + [head, ...rows].join('\n');
}
