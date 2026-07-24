/**
 * L7 Cross-Session Memory Bridge
 * Bridges LingBus messages with cross-session memory storage.
 *
 * Ported from lingminopt/lingyuan/lingbus_l7.py
 * Responsibility: extract key info from messages, store/retrieve
 * cross-session context via lingmemory.
 */

export interface L7MemoryEntry {
  key: string;
  value: string;
  source: string;
  sessionId: string;
  trustScore: number;
  timestamp: string;
}

export interface L7Message {
  sender: string;
  body: string;
  subject: string;
  threadId: string;
  recipient?: string;
  timestamp?: string;
}

export interface L7ExtractedInfo {
  task?: string;
  decision?: string;
  blocker?: string;
  hardware?: string;
  deadline?: string;
}

export interface L7ProcessResult {
  status: 'ok' | 'l7_not_available';
  sender: string;
  memoriesStored: number;
  sessionId: string;
}

export interface L7Stats {
  messagesProcessed: number;
  memoriesStored: number;
  contextsRetrieved: number;
}

type L7Store = Map<string, L7MemoryEntry[]>;

const MEMBER_MAP: Record<string, string> = {
  lingflow: '灵通',
  lingminopt: '灵极优',
  lingan: '灵安',
  lingmessage: '灵信',
  lingresearch: '灵研',
  lingclaude: '灵克',
  lingxi: '灵犀',
  lingzhi: '灵知',
  lingyang: '灵扬',
  lingcreate: '灵创',
  lingtongask: '灵通问道',
  lingweb: '灵网',
  lingyi: '灵医',
  zhibridge: '智桥',
  atomcode: 'atomcode',
  lingflow_plus: '灵通+',
};

export class L7Bridge {
  private store: L7Store = new Map();
  private stats: L7Stats = {
    messagesProcessed: 0,
    memoriesStored: 0,
    contextsRetrieved: 0,
  };

  resolveMember(name: string): string {
    return MEMBER_MAP[name] || name;
  }

  extractKeyInfo(text: string, _sender: string): L7ExtractedInfo {
    const info: L7ExtractedInfo = {};

    const taskMatch = text.match(
      /(?:负责|完成|提交|处理)\s*(.{2,30}?)(?:项目|任务|issue|PR|commit)/
    );
    if (taskMatch) info.task = taskMatch[1].trim();

    const decisionMatch = text.match(
      /(?:决定|结论|同意|接受|驳回)\s*(.{2,50}?)(?:,|。|$)/
    );
    if (decisionMatch) info.decision = decisionMatch[1].trim();

    const blockerMatch = text.match(
      /(?:阻塞|卡住|报错)\s*[:：]?\s*(.{2,50}?)(?:,|。|$)/
    );
    if (blockerMatch) info.blocker = blockerMatch[1].trim();

    const hwMatch = text.match(
      /(?:显卡|GPU|显存|内存)\s*[:：]?\s*(\S+(?:\s+\S+){0,3})/
    );
    if (hwMatch) info.hardware = hwMatch[1].trim();

    const dlMatch = text.match(
      /(?:截止日期|ddl|deadline|截止)\s*[:：]?\s*(\S+)/i
    );
    if (dlMatch) info.deadline = dlMatch[1].trim();

    return info;
  }

  processMessage(message: L7Message): L7ProcessResult {
    const sender = message.sender || 'unknown';
    const memberName = this.resolveMember(sender);
    const body = message.body || '';
    const subject = message.subject || '';
    const threadId = message.threadId || '';
    const sessionId = `lingbus:${threadId || sender}`;

    const fullText = `${subject} ${body}`;
    const extracted = this.extractKeyInfo(fullText, memberName);

    let memoriesStored = 0;
    for (const [key, value] of Object.entries(extracted)) {
      if (!value) continue;
      const entryKey = `${memberName}:${key}`;
      if (!this.store.has(entryKey)) {
        this.store.set(entryKey, []);
      }
      this.store.get(entryKey)!.push({
        key: entryKey,
        value,
        source: sender,
        sessionId,
        trustScore: 0.9,
        timestamp: new Date().toISOString(),
      });
      memoriesStored++;
    }

    this.stats.messagesProcessed++;
    this.stats.memoriesStored += memoriesStored;

    return {
      status: 'ok',
      sender,
      memoriesStored,
      sessionId,
    };
  }

  getContext(member: string, topK = 5): L7MemoryEntry[] {
    const memberName = this.resolveMember(member);
    const results: L7MemoryEntry[] = [];

    for (const [key, entries] of this.store) {
      if (key.startsWith(memberName + ':')) {
        results.push(...entries);
      }
    }

    results.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    this.stats.contextsRetrieved++;
    return results.slice(0, topK);
  }

  getAllContext(topK = 10): L7MemoryEntry[] {
    const results: L7MemoryEntry[] = [];
    for (const entries of this.store.values()) {
      results.push(...entries);
    }
    results.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    this.stats.contextsRetrieved++;
    return results.slice(0, topK);
  }

  getStats(): L7Stats {
    return { ...this.stats };
  }

  reset(): void {
    this.store.clear();
    this.stats = {
      messagesProcessed: 0,
      memoriesStored: 0,
      contextsRetrieved: 0,
    };
  }
}

export const l7Bridge = new L7Bridge();
