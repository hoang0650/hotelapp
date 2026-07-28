import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

export interface AiUsageSummary {
  period: string;
  packageName: string | null;
  aiChatboxFeature: boolean;
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
  recentEvents: AiUsageEvent[];
  retailRates: AiRetailRate[];
  markupMultiplier: number;
  fxVndPerUsd: number;
}

@Injectable({
  providedIn: 'root'
})
export class AiUsageService {
  private apiUrl = `${environment.apiUrl}/ai-usage`;

  constructor(private http: HttpClient) {}

  getMyUsage(): Observable<{ success: boolean; data: AiUsageSummary }> {
    return this.http.get<{ success: boolean; data: AiUsageSummary }>(`${this.apiUrl}/me`);
  }

  getRates(): Observable<{ success: boolean; data: any }> {
    return this.http.get<{ success: boolean; data: any }>(`${this.apiUrl}/rates`);
  }
}
