/**
 * Identity Registry
 * Known 灵族 (Ling Family) members for request-source verification
 */

export interface LingMember {
  name: string;
  englishName: string;
  directory: string;
  role: string;
}

export const LING_FAMILY_MEMBERS: readonly LingMember[] = [
  {
    name: '灵通',
    englishName: 'lingflow',
    directory: '/home/ai/LingFlow',
    role: 'AI生态平台',
  },
  {
    name: '灵克',
    englishName: 'lingclaude',
    directory: '/home/ai/LingClaude',
    role: 'AI编程助手',
  },
  {
    name: '灵研',
    englishName: 'lingresearch',
    directory: '/home/ai/lingresearch',
    role: 'AI自主科研框架',
  },
  {
    name: '灵知',
    englishName: 'lingzhi',
    directory: '/home/ai/zhineng-knowledge-system',
    role: '知识管理系统',
  },
  {
    name: '灵通问道',
    englishName: 'lingtongask',
    directory: '/home/ai/lingtongask',
    role: '智能气功播客',
  },
  {
    name: '灵通+',
    englishName: 'lingflow_plus',
    directory: '/home/ai/LingFlow_plus',
    role: '灵族协调者',
  },
  {
    name: '灵犀',
    englishName: 'lingxi',
    directory: '/home/ai/Ling-term-mcp',
    role: 'MCP终端服务器',
  },
  {
    name: '灵信',
    englishName: 'lingmessage',
    directory: '/home/ai/LingMessage',
    role: '消息总线',
  },
  {
    name: '灵网',
    englishName: 'lingweb',
    directory: '/home/ai/LingWeb',
    role: '全栈网站开发',
  },
  {
    name: '灵极优',
    englishName: 'lingminopt',
    directory: '/home/ai/LingMinOpt',
    role: '极简自优化框架',
  },
  {
    name: '灵扬',
    englishName: 'lingyang',
    directory: '/home/ai/LingYang',
    role: '对外联络宣传',
  },
  {
    name: '智桥',
    englishName: 'zhibridge',
    directory: '/home/ai/zhineng-bridge',
    role: '跨平台通信桥梁',
  },
] as const;

const MEMBER_SET: ReadonlySet<string> = new Set(
  LING_FAMILY_MEMBERS.map((m) => m.englishName)
);

const MEMBER_MAP: ReadonlyMap<string, LingMember> = new Map(
  LING_FAMILY_MEMBERS.map((m) => [m.englishName, m])
);

export function isKnownMember(caller: string): boolean {
  return MEMBER_SET.has(caller);
}

export function getMember(caller: string): LingMember | undefined {
  return MEMBER_MAP.get(caller);
}

export function getMemberNames(): string[] {
  return LING_FAMILY_MEMBERS.map((m) => m.englishName);
}
