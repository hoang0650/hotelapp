import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AiUsageChannelStats {
  turns?: number;
  inputTokens?: number;
  outputTokens?: number;
  retailCostVnd?: number;
}

export interface AiRetailRate {
  role: string;
  modelId: string;
  alias: string;
  cogsInputPer1MUsd?: number;
  cogsOutputPer1MUsd?: number;
  retailInputPer1MUsd: number;
  retailOutputPer1MUsd: number;
  retailInputPer1MVnd: number;
  retailOutputPer1MVnd: number;
  markupMultiplier: number;
}

export interface AiUsageEvent {
  at: string | Date;
  channel: string;
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  retailCostVnd: number;
}

export interface AiQuotaAllocation {
  at: string | Date;
  turns: number;
  note?: string;
  hotelId?: string;
  hotelName?: string;
  allocatedBy?: string;
  allocatedByName?: string;
}

export interface AiUsageSummary {
  period: string;
  ownerKey?: string;
  hotelId?: string | null;
  hotelName?: string | null;
  businessId?: string | null;
  packageName: string | null;
  aiChatboxFeature: boolean;
  packageQuota?: number;
  bonusQuota?: number;
  monthlyQuota: number;
  usedTurns: number;
  remainingTurns: number | null;
  unlimited: boolean;
  percentUsed: number;
  inputTokens: number;
  outputTokens: number;
  retailCostVnd: number;
  byChannel: {
    sales?: AiUsageChannelStats;
    chatbox?: AiUsageChannelStats;
    openclaw?: AiUsageChannelStats;
    fallback?: AiUsageChannelStats;
  };
  allocations?: AiQuotaAllocation[];
  recentEvents: AiUsageEvent[];
  retailRates: AiRetailRate[];
  markupMultiplier: number;
  fxVndPerUsd: number;
}

export interface AiHotelUsageRow extends AiUsageSummary {
  hotelId: string;
  hotelName: string;
  status?: string;
}

function toNum(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeChannelStats(raw: any): AiUsageChannelStats {
  if (!raw || typeof raw !== 'object') {
    return { turns: 0, inputTokens: 0, outputTokens: 0, retailCostVnd: 0 };
  }
  return {
    turns: toNum(raw.turns ?? raw.Turns),
    inputTokens: toNum(raw.inputTokens ?? raw.input_tokens ?? raw.prompt_tokens),
    outputTokens: toNum(raw.outputTokens ?? raw.output_tokens ?? raw.completion_tokens),
    retailCostVnd: toNum(raw.retailCostVnd ?? raw.retail_cost_vnd)
  };
}

function normalizeEvent(raw: any): AiUsageEvent {
  return {
    at: raw?.at || raw?.createdAt || new Date().toISOString(),
    channel: String(raw?.channel || 'chatbox'),
    model: String(raw?.model || ''),
    turns: toNum(raw?.turns, 1),
    inputTokens: toNum(raw?.inputTokens ?? raw?.input_tokens ?? raw?.prompt_tokens),
    outputTokens: toNum(raw?.outputTokens ?? raw?.output_tokens ?? raw?.completion_tokens),
    retailCostVnd: toNum(raw?.retailCostVnd ?? raw?.retail_cost_vnd)
  };
}

/** Chuẩn hóa payload /ai-usage (camelCase hoặc snake_case). */
export function normalizeAiUsageSummary(raw: any): AiUsageSummary | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const byChannelRaw = raw.byChannel || raw.by_channel || {};
  const byChannel: AiUsageSummary['byChannel'] = {};
  for (const key of ['sales', 'chatbox', 'openclaw', 'fallback']) {
    byChannel[key as keyof AiUsageSummary['byChannel']] = normalizeChannelStats(byChannelRaw[key]);
  }

  const recentRaw = raw.recentEvents || raw.recent_events || [];
  const recentEvents = Array.isArray(recentRaw) ? recentRaw.map(normalizeEvent) : [];

  return {
    period: String(raw.period || ''),
    ownerKey: raw.ownerKey || raw.owner_key,
    hotelId: raw.hotelId ?? raw.hotel_id ?? null,
    hotelName: raw.hotelName ?? raw.hotel_name ?? null,
    businessId: raw.businessId ?? raw.business_id ?? null,
    packageName: raw.packageName ?? raw.package_name ?? null,
    aiChatboxFeature: !!(raw.aiChatboxFeature ?? raw.ai_chatbox_feature),
    packageQuota: toNum(raw.packageQuota ?? raw.package_quota),
    bonusQuota: toNum(raw.bonusQuota ?? raw.bonus_quota),
    monthlyQuota: toNum(raw.monthlyQuota ?? raw.monthly_quota),
    usedTurns: toNum(raw.usedTurns ?? raw.used_turns),
    remainingTurns:
      raw.remainingTurns === null || raw.remaining_turns === null
        ? null
        : toNum(raw.remainingTurns ?? raw.remaining_turns),
    unlimited: !!raw.unlimited,
    percentUsed: toNum(raw.percentUsed ?? raw.percent_used),
    inputTokens: toNum(raw.inputTokens ?? raw.input_tokens),
    outputTokens: toNum(raw.outputTokens ?? raw.output_tokens),
    retailCostVnd: toNum(raw.retailCostVnd ?? raw.retail_cost_vnd),
    byChannel,
    allocations: Array.isArray(raw.allocations) ? raw.allocations : [],
    recentEvents,
    retailRates: Array.isArray(raw.retailRates)
      ? raw.retailRates
      : Array.isArray(raw.retail_rates)
        ? raw.retail_rates
        : [],
    markupMultiplier: toNum(raw.markupMultiplier ?? raw.markup_multiplier, 1),
    fxVndPerUsd: toNum(raw.fxVndPerUsd ?? raw.fx_vnd_per_usd)
  };
}

@Injectable({
  providedIn: 'root'
})
export class AiUsageService {
  private apiUrl = `${environment.apiUrl}/ai-usage`;

  constructor(private http: HttpClient) {}

  getMyUsage(hotelId?: string | null): Observable<{ success: boolean; data: AiUsageSummary }> {
    let params = new HttpParams();
    if (hotelId) {
      params = params.set('hotelId', hotelId);
    }
    return this.http.get<{ success: boolean; data: any }>(`${this.apiUrl}/me`, { params }).pipe(
      map((res) => ({
        success: !!res?.success,
        data: normalizeAiUsageSummary(res?.data) as AiUsageSummary
      }))
    );
  }

  getRates(): Observable<{ success: boolean; data: any }> {
    return this.http.get<{ success: boolean; data: any }>(`${this.apiUrl}/rates`);
  }

  listHotelUsages(options?: {
    period?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Observable<{
    success: boolean;
    data: { period: string; total: number; page: number; pageSize: number; items: AiHotelUsageRow[] };
  }> {
    let params = new HttpParams();
    if (options?.period) params = params.set('period', options.period);
    if (options?.search) params = params.set('search', options.search);
    if (options?.page) params = params.set('page', String(options.page));
    if (options?.pageSize) params = params.set('pageSize', String(options.pageSize));
    return this.http.get<{ success: boolean; data: any }>(`${this.apiUrl}/admin/hotels`, { params }).pipe(
      map((res) => ({
        success: !!res?.success,
        data: {
          period: res?.data?.period,
          total: toNum(res?.data?.total),
          page: toNum(res?.data?.page, 1),
          pageSize: toNum(res?.data?.pageSize, 20),
          items: Array.isArray(res?.data?.items)
            ? res.data.items.map((row: any) => normalizeAiUsageSummary(row) as AiHotelUsageRow)
            : []
        }
      }))
    );
  }

  allocateBonus(payload: {
    hotelId: string;
    turns: number;
    note?: string;
  }): Observable<{ success: boolean; message?: string; data: any }> {
    return this.http.post<{ success: boolean; message?: string; data: any }>(
      `${this.apiUrl}/admin/allocate`,
      payload
    );
  }
}
