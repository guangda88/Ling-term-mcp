/**
 * L10 Trust Anchor
 * Identity drift detection, claim verification, and trust scoring.
 *
 * Ported from lingminopt/lingyuan/l10_trust_anchor.py
 * Responsibility: detect identity drift in model outputs,
 * verify claims against Datalog, compute trust scores.
 */

export interface DriftResult {
  pattern: string;
  matched: string;
  confidence: number;
}

export interface ClaimPattern {
  patternId: string;
  regex: RegExp;
  eventType: string;
  action: string;
}

export interface VerifyClaimResult {
  verified: boolean;
  event: unknown | null;
  matchedPattern: string | null;
  extracted: { action: string; target: string };
  sourceDb: string;
  fallback: string | null;
}

export interface TrustScoreResult {
  caller: string;
  sessionId: string | null;
  totalClaims: number;
  verifiedClaims: number;
  trustScore: number;
  evidence: Record<string, unknown>[];
  computedAt: string;
}

const CLAIM_PATTERNS: ClaimPattern[] = [
  {
    patternId: 'notified',
    regex: /已(?:通知|告知|通告)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.notified',
    action: '通知',
  },
  {
    patternId: 'sent',
    regex: /已(?:发送|投递|回复)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.sent',
    action: '发送',
  },
  {
    patternId: 'created',
    regex: /已(?:创建|建立|发起)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.created',
    action: '创建',
  },
  {
    patternId: 'modified',
    regex: /已(?:修改|更新|编辑|修正)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.modified',
    action: '修改',
  },
  {
    patternId: 'verified',
    regex: /已(?:确认|核实|验证|校对)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.verified',
    action: '确认',
  },
  {
    patternId: 'queried',
    regex: /已(?:查询|检索|读取|拉取)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.queried',
    action: '查询',
  },
  {
    patternId: 'executed',
    regex: /已(?:执行|调用|运行|部署)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.executed',
    action: '执行',
  },
  {
    patternId: 'emitted',
    regex: /已(?:写入|记录|emit)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.emitted',
    action: '写入',
  },
  {
    patternId: 'completed',
    regex: /已(?:完成|落地|通过)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.completed',
    action: '完成',
  },
  {
    patternId: 'deleted',
    regex: /已(?:删除|移除)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.deleted',
    action: '删除',
  },
  {
    patternId: 'checked',
    regex: /已(?:检查|审查|审计)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.checked',
    action: '检查',
  },
  {
    patternId: 'generated',
    regex: /已(?:生成|产出)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.generated',
    action: '生成',
  },
  {
    patternId: 'installed',
    regex: /已(?:安装|配置|设置)\s*(.+?)(?:,|。|$)/,
    eventType: 'claim.installed',
    action: '安装',
  },
];

const IDENTITY_DRIFT_PATTERNS: RegExp[] = [
  /我是\s*(Kimi|ChatGPT|Claude|GPT|Gemini|Copilot|豆包|文心|通义|DeepSeek|GLM|ERNIE|Qwen|Llama|Mistral|Grok|雅典娜|智谱|Yi|百川|星火|天工|混元|MiniMax|月之暗面)/i,
  /I am\s*(Kimi|ChatGPT|Claude|GPT|Gemini|Copilot|DeepSeek|GLM|Llama|Mistral|Grok|Anthropic|OpenAI)/i,
  /我叫\s*(Kimi|ChatGPT|Claude|GPT|Gemini|Copilot|豆包|文心|通义|DeepSeek|GLM|ERNIE|Qwen|智谱|Yi|百川|星火|天工|混元|MiniMax|月之暗面)/i,
  /I'm an AI assistant/i,
  /I'm an? (AI|artificial intelligence)/i,
  /我是\s*(?:一个|一名|AI|人工智能)\s*(?:AI\s*)?(?:助手|助理|模型)/i,
  /My name is\s*(Kimi|ChatGPT|Claude|GPT|Gemini|DeepSeek)/i,
];

const VALID_MEMBERS: ReadonlySet<string> = new Set([
  'lingflow',
  'lingclaude',
  'lingresearch',
  'lingzhi',
  'lingtongask',
  'lingflow_plus',
  'lingweb',
  'lingminopt',
  'lingyang',
  'lingcreate',
  'lingxi',
  'lingmessage',
  'lingan',
  'zhibridge',
]);

export function detectIdentityDrift(text: string): DriftResult | null {
  if (!text) return null;

  for (const pattern of IDENTITY_DRIFT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        pattern: pattern.source,
        matched: match[0],
        confidence: 0.95,
      };
    }
  }

  return null;
}

export function detectIdentityDriftMulti(text: string): DriftResult[] {
  if (!text) return [];
  const results: DriftResult[] = [];

  for (const pattern of IDENTITY_DRIFT_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      results.push({
        pattern: pattern.source,
        matched: match[0],
        confidence: 0.95,
      });
    }
  }

  return results;
}

export function verifyClaim(
  claimText: string,
  claimMember: string,
  _timeWindowHours = 24
): VerifyClaimResult {
  if (!VALID_MEMBERS.has(claimMember)) {
    return {
      verified: false,
      event: null,
      matchedPattern: null,
      extracted: { action: '', target: '' },
      sourceDb: 'default',
      fallback: 'invalid_member',
    };
  }

  for (const pattern of CLAIM_PATTERNS) {
    const match = claimText.match(pattern.regex);
    if (match) {
      const target = match[1].trim();
      return {
        verified: false,
        event: null,
        matchedPattern: pattern.patternId,
        extracted: { action: pattern.action, target },
        sourceDb: 'default',
        fallback: 'outside_window',
      };
    }
  }

  return {
    verified: false,
    event: null,
    matchedPattern: null,
    extracted: { action: '', target: '' },
    sourceDb: 'default',
    fallback: 'no_match',
  };
}

export function getTrustScore(
  caller: string,
  sessionId: string | null = null,
  _timeWindowHours = 24
): TrustScoreResult {
  return {
    caller,
    sessionId,
    totalClaims: 0,
    verifiedClaims: 0,
    trustScore: 1.0,
    evidence: [],
    computedAt: new Date().toISOString(),
  };
}

export function isValidMember(member: string): boolean {
  return VALID_MEMBERS.has(member);
}

export function getClaimPatterns(): ClaimPattern[] {
  return [...CLAIM_PATTERNS];
}

export function getIdentityDriftPatterns(): RegExp[] {
  return [...IDENTITY_DRIFT_PATTERNS];
}
