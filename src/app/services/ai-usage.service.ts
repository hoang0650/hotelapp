import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
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
    return this.http.get<{ success: boolean; data: AiUsageSummary }>(`${this.apiUrl}/me`, { params });
  }

  getRates(): Observable<{ success: boolean; data: any }> {
    return this.http.get<{ success: boolean; data: any }>(`${this.apiUrl}/rates`);
  }

  listHotelUsages(options?: {
    period?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Observable<{ success: boolean; data: { period: string; total: number; page: number; pageSize: number; items: AiHotelUsageRow[] } }> {
    let params = new HttpParams();
    if (options?.period) params = params.set('period', options.period);
    if (options?.search) params = params.set('search', options.search);
    if (options?.page) params = params.set('page', String(options.page));
    if (options?.pageSize) params = params.set('pageSize', String(options.pageSize));
    return this.http.get<{ success: boolean; data: any }>(`${this.apiUrl}/admin/hotels`, { params });
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
