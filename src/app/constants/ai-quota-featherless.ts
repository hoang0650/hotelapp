/**
 * Phân bổ quota AI PHHotel theo Featherless request pricing
 * (https://featherless.ai/docs/request-pricing-and-credits).
 *
 * Chiến lược tối đa lợi nhuận:
 * 1) Sales / MXH volume cao → model rẻ (DeepSeek-V4-Flash $0.14/$0.28 / 1M).
 * 2) OpenClaw agent phức tạp → MiniMax-M2.5 ($0.295/$1.20) khi cần chất lượng.
 * 3) Quota gắn gói sao cho AI COGS mục tiêu ≤ ~8–12% giá gói (còn lại là biên).
 *
 * Ước lượng turn (token):
 * - Sales/chat MXH: ~800 in + 300 out
 * - Chatbox nội bộ: ~1.500 in + 500 out
 * - OpenClaw agent: ~8.000 in + 1.500 out
 *
 * FX tham chiếu: 26.000đ / USD (làm tròn khi báo cáo).
 */

export type AiModelRole = 'sales' | 'chatbox' | 'openclaw' | 'fallback';

export interface FeatherlessModelTier {
  /** ID HuggingFace-style trên Featherless API */
  id: string;
  /** Alias OpenClaw / nội bộ */
  alias: string;
  role: AiModelRole;
  /** USD / 1M input tokens (Featherless class hoặc model-specific) */
  inputPer1M: number;
  /** USD / 1M output tokens */
  outputPer1M: number;
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
  note: string;
}

/** Stack model tối ưu biên lợi nhuận (cập nhật theo bảng giá Featherless Jul 2026). */
export const FEATHERLESS_PROFIT_MODEL_TIERS: FeatherlessModelTier[] = [
  {
    id: 'deepseek-ai/DeepSeek-V4-Flash',
    alias: 'phhotel-main',
    role: 'sales',
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    contextWindow: 262144,
    maxTokens: 16384,
    reasoning: true,
    note: 'Default + sales MXH: rẻ nhất trong nhóm frontier có tools (V4-Flash model-specific).'
  },
  {
    id: 'Qwen/Qwen3.6-35B-A3B',
    alias: 'phhotel-sales',
    role: 'chatbox',
    inputPer1M: 0.1612,
    outputPer1M: 1.0,
    contextWindow: 131072,
    maxTokens: 8192,
    note: 'Chatbox / fallback tiếng Việt; class gần qwen3-5-moevl-35b.'
  },
  {
    id: 'MiniMaxAI/MiniMax-M2.5',
    alias: 'phhotel-premium',
    role: 'openclaw',
    inputPer1M: 0.295,
    outputPer1M: 1.2,
    contextWindow: 200000,
    maxTokens: 30000,
    reasoning: true,
    note: 'OpenClaw premium / tác vụ agent nặng (class minimax-m25).'
  }
];

export interface PackageAiQuota {
  /** Tên gói khớp RECOMMENDED_PACKAGE_ORDER */
  packageName: string;
  /** Tổng lượt AI / tháng (sales + chatbox + openclaw gộp, soft quota) */
  monthlyTurns: number;
  /** Gợi ý tách sales MXH */
  salesTurns: number;
  /** Gợi ý chatbox nội bộ */
  chatboxTurns: number;
  /** Gợi ý OpenClaw agent turns */
  openclawTurns: number;
  /** Model mặc định cho gói */
  preferredModelAlias: string;
  /** COGS ước tính USD / tháng ở mức dùng hết quota (Flash + premium mix) */
  estimatedCogsUsd: number;
  /** Biên AI còn lại so với giá gói (ước lượng) */
  targetAiMarginNote: string;
}

/**
 * Quota mềm theo gói — đủ dùng bán hàng, COGS thấp nhờ Flash.
 * Enterprise = 0 nghĩa là theo hợp đồng (unlimited / custom).
 */
export const PACKAGE_AI_QUOTAS: PackageAiQuota[] = [
  {
    packageName: 'Dùng Thử',
    monthlyTurns: 50,
    salesTurns: 40,
    chatboxTurns: 10,
    openclawTurns: 0,
    preferredModelAlias: 'phhotel-main',
    estimatedCogsUsd: 0.02,
    targetAiMarginNote: 'Demo hấp thụ cost; không bán AI.'
  },
  {
    packageName: 'Khởi Đầu',
    monthlyTurns: 0,
    salesTurns: 0,
    chatboxTurns: 0,
    openclawTurns: 0,
    preferredModelAlias: 'phhotel-main',
    estimatedCogsUsd: 0,
    targetAiMarginNote: 'Không gồm AI — upsell Tăng Trưởng / add-on.'
  },
  {
    packageName: 'Vận Hành',
    monthlyTurns: 0,
    salesTurns: 0,
    chatboxTurns: 0,
    openclawTurns: 0,
    preferredModelAlias: 'phhotel-main',
    estimatedCogsUsd: 0,
    targetAiMarginNote: 'Không gồm AI — giữ biên PMS thuần.'
  },
  {
    packageName: 'Tăng Trưởng',
    monthlyTurns: 1200,
    salesTurns: 1000,
    chatboxTurns: 200,
    openclawTurns: 0,
    preferredModelAlias: 'phhotel-main',
    estimatedCogsUsd: 0.35,
    targetAiMarginNote: 'Giá 1.49tr; AI COGS ~0.4% → biên AI rất cao.'
  },
  {
    packageName: 'AI Pro',
    monthlyTurns: 5000,
    salesTurns: 3500,
    chatboxTurns: 500,
    openclawTurns: 1000,
    preferredModelAlias: 'phhotel-premium',
    estimatedCogsUsd: 3.5,
    targetAiMarginNote: 'Giá 2.99tr (~$115); AI COGS ~3% → còn ≥88% biên gói sau AI.'
  },
  {
    packageName: 'Chuỗi / Enterprise',
    monthlyTurns: 0,
    salesTurns: 0,
    chatboxTurns: 0,
    openclawTurns: 0,
    preferredModelAlias: 'phhotel-premium',
    estimatedCogsUsd: 0,
    targetAiMarginNote: 'Theo HĐ — floor đề xuất ≥ 15.000 turns hoặc unlimited + floor giá 8–15tr.'
  }
];

/** Add-on OpenClaw: +690.000đ/tháng → +2.000 OpenClaw turns (COGS ~$3 với premium mix). */
export const OPENCLAW_ADDON_AI_QUOTA = {
  monthlyPriceVnd: 690000,
  openclawTurns: 2000,
  estimatedCogsUsd: 3.0,
  preferredModelAlias: 'phhotel-premium'
};

export function getPackageAiQuota(packageName: string): PackageAiQuota | undefined {
  const key = String(packageName || '').trim().toLowerCase();
  return PACKAGE_AI_QUOTAS.find((q) => q.packageName.toLowerCase() === key);
}

/** FX tham chiếu khi quy đổi giá bán token (VND). */
export const AI_FX_VND_PER_USD = 26000;

/**
 * Hệ số markup giá bán so với Featherless COGS.
 * 5× ≈ biên gộp ~80% trên token (tối ưu doanh thu, vẫn cạnh tranh hơn hyperscaler).
 */
export const AI_RETAIL_MARKUP_MULTIPLIER = 5;

export interface RetailTokenRate {
  modelId: string;
  alias: string;
  role: AiModelRole;
  /** Featherless COGS USD / 1M */
  cogsInputPer1M: number;
  cogsOutputPer1M: number;
  /** Giá bán khách hàng USD / 1M (= COGS × markup) */
  retailInputPer1MUsd: number;
  retailOutputPer1MUsd: number;
  /** Giá bán VND / 1M tokens */
  retailInputPer1MVnd: number;
  retailOutputPer1MVnd: number;
  markupMultiplier: number;
}

function toRetailRate(tier: FeatherlessModelTier): RetailTokenRate {
  const m = AI_RETAIL_MARKUP_MULTIPLIER;
  const retailIn = +(tier.inputPer1M * m).toFixed(4);
  const retailOut = +(tier.outputPer1M * m).toFixed(4);
  return {
    modelId: tier.id,
    alias: tier.alias,
    role: tier.role,
    cogsInputPer1M: tier.inputPer1M,
    cogsOutputPer1M: tier.outputPer1M,
    retailInputPer1MUsd: retailIn,
    retailOutputPer1MUsd: retailOut,
    retailInputPer1MVnd: Math.round(retailIn * AI_FX_VND_PER_USD),
    retailOutputPer1MVnd: Math.round(retailOut * AI_FX_VND_PER_USD),
    markupMultiplier: m
  };
}

/** Bảng giá bán token PHHotel (luôn cao hơn Featherless theo markup). */
export const PHHOTEL_RETAIL_TOKEN_RATES: RetailTokenRate[] =
  FEATHERLESS_PROFIT_MODEL_TIERS.map(toRetailRate);

/** Ước lượng token / lượt khi API chưa trả usage. */
export const AI_TURN_TOKEN_ESTIMATES: Record<AiModelRole, { input: number; output: number }> = {
  sales: { input: 800, output: 300 },
  chatbox: { input: 1500, output: 500 },
  openclaw: { input: 8000, output: 1500 },
  fallback: { input: 1500, output: 500 }
};

export function estimateRetailCostVnd(
  role: AiModelRole,
  inputTokens: number,
  outputTokens: number
): number {
  const rate =
    PHHOTEL_RETAIL_TOKEN_RATES.find((r) => r.role === role) ||
    PHHOTEL_RETAIL_TOKEN_RATES.find((r) => r.role === 'sales')!;
  const costUsd =
    (inputTokens / 1_000_000) * rate.retailInputPer1MUsd +
    (outputTokens / 1_000_000) * rate.retailOutputPer1MUsd;
  return Math.round(costUsd * AI_FX_VND_PER_USD);
}
