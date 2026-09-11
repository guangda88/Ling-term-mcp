/**
 * Lingxi Sessions — 白盒测试
 *
 * 验证 session_store 的关键路径，使 watchdog (lingflow) 可安全读取
 * 来判断 lingxi 是否处于活跃会话中（豁免 kill 的依据）。
 *
 * 设计动机（184828 决议 + 184826 采纳）：
 *   watchdog kill lingxi 前应先查 lingxi_sessions 表 + 60s 通知窗口
 *   此测试确保 watchdog 依赖的 sessions.json 契约稳定。
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const TMP_DATA_DIR = path.join(
  os.tmpdir(),
  `lingxi-sessions-test-${process.pid}`
);
const SESSIONS_FILE = path.join(TMP_DATA_DIR, 'sessions.json');

type Session = {
  id: string;
  name: string;
  working_directory: string;
  created_at: string;
  status: 'active' | 'inactive' | 'destroyed';
};

let saveSession: (s: Session) => Promise<void>;
let getSessions: () => Promise<Session[]>;

beforeEach(async () => {
  // 隔离模块：每个测试前重置 store 的内存缓存
  jest.resetModules();
  process.env.XDG_DATA_HOME = TMP_DATA_DIR;
  await fs.mkdir(TMP_DATA_DIR, { recursive: true });
  try {
    await fs.unlink(SESSIONS_FILE);
  } catch {
    /* ignore */
  }
  const mod = await import('../../src/sessions/store.js');
  saveSession = mod.saveSession;
  getSessions = mod.getSessions;
});

afterAll(async () => {
  try {
    await fs.rm(TMP_DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const makeSession = (id: string, status: Session['status']): Session => ({
  id,
  name: `test-${id}`,
  working_directory: '/tmp',
  created_at: new Date().toISOString(),
  status,
});

describe('Lingxi sessions — watchdog contract', () => {
  test('sessions.json 文件权限 0600（防越权读取）', async () => {
    await saveSession(makeSession('s1', 'active'));
    const stats = await fs.stat(SESSIONS_FILE);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  test('getSessions 返回所有 sessions 数组（watchdog 遍历用）', async () => {
    await saveSession(makeSession('s1', 'active'));
    const sessions = await getSessions();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('s1');
  });

  test('active status 字段可被 watchdog 过滤', async () => {
    await saveSession(makeSession('s1', 'active'));
    await saveSession(makeSession('s2-active', 'active'));
    await saveSession(makeSession('s3-inactive', 'inactive'));
    await saveSession(makeSession('s4-destroyed', 'destroyed'));

    const sessions = await getSessions();
    const active = sessions.filter((s) => s.status === 'active');
    const activeIds = active.map((s) => s.id).sort();

    expect(activeIds).toEqual(['s1', 's2-active']);
  });

  test('JSON 格式稳定（Python 跨语言读取兼容）', async () => {
    await saveSession(makeSession('s1', 'active'));
    const content = await fs.readFile(SESSIONS_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('status');
    expect(parsed[0]).toHaveProperty('working_directory');
  });

  test('空 store 不抛异常（watchdog 启动时检查）', async () => {
    // 不创建任何 session, 直接查询
    const sessions = await getSessions();
    expect(sessions).toEqual([]);
  });
});

describe('Lingxi sessions — MCP 链路活跃会话查询（watchdog 接口契约）', () => {
  /**
   * watchdog 的 60s 通知窗口功能需要查询：
   *   "当前是否还有活跃 session 依赖 lingxi MCP 链路？"
   *
   * 此测试模拟 watchdog 端查询的查询契约。
   * 注：实际 watchdog 实现是 Python 读 JSON 文件，此处仅保证格式稳定。
   */
  test('可派生查询：has_active_session() 等价表达式', async () => {
    await saveSession(makeSession('mcp-link-active', 'active'));
    await saveSession(makeSession('old-inactive', 'inactive'));

    const sessions = await getSessions();
    const hasActive = sessions.some((s) => s.status === 'active');
    expect(hasActive).toBe(true);

    // watchdog 决策逻辑：
    //   if has_active: 60s 通知窗口 + 跳过 kill (即使 never_restart=False)
    //   if !has_active: 走正常 kill 流程
  });
});
