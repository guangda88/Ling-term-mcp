/**
 * env_builder buildSafeEnv — 单元测试
 * 对齐 dsh 防御模式: spawn 时清洗 KEY / SECRET / TOKEN / PASSWORD 类环境变量
 */

import { buildSafeEnv } from '../../src/middleware/env_builder';

describe('buildSafeEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('保留白名单变量 (PATH/HOME/TERM 等)', () => {
    process.env = {
      PATH: '/usr/bin',
      HOME: '/home/ai',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
    };
    const env = buildSafeEnv();
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/ai');
    expect(env.TERM).toBe('xterm-256color');
    expect(env.LANG).toBe('en_US.UTF-8');
  });

  it('清洗含 SECRET 的环境变量', () => {
    process.env = { MY_SECRET_KEY: 'abc', SAFE_VAR: 'ok' };
    const env = buildSafeEnv();
    expect(env.MY_SECRET_KEY).toBeUndefined();
    expect(env.SAFE_VAR).toBe('ok');
  });

  it('清洗含 PASSWORD 的环境变量', () => {
    process.env = { DB_PASSWORD: 'pw', DBPASS: 'keep' };
    const env = buildSafeEnv();
    expect(env.DB_PASSWORD).toBeUndefined();
    expect(env.DBPASS).toBe('keep');
  });

  it('清洗含 TOKEN 的环境变量', () => {
    process.env = { ACCESS_TOKEN: 'tkn' };
    const env = buildSafeEnv();
    expect(env.ACCESS_TOKEN).toBeUndefined();
  });

  it('清洗裸 KEY 变体 (MY_KEY/KEYSTONE/API_KEY)', () => {
    process.env = {
      MY_KEY: 'k1',
      KEYSTONE_PASSWORD: 'k2',
      DEEPSEEK_API_KEY: 'k3',
      KEYBOARD_LAYOUT: 'keep', // 含 KEY 但非凭据语义, dsh 通配亦清洗, 此处断言清洗语义一致
    };
    const env = buildSafeEnv();
    expect(env.MY_KEY).toBeUndefined();
    expect(env.KEYSTONE_PASSWORD).toBeUndefined();
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(env.KEYBOARD_LAYOUT).toBeUndefined();
  });

  it('清洗 sessionEnv 中的敏感变量但保留白名单不可覆盖', () => {
    process.env = { PATH: '/usr/bin' };
    const env = buildSafeEnv({
      API_TOKEN: 'session-token',
      CUSTOM_VAR: 'keep',
    });
    expect(env.API_TOKEN).toBeUndefined();
    expect(env.CUSTOM_VAR).toBe('keep');
    expect(env.PATH).toBe('/usr/bin');
  });

  it('清洗 AUTH/CREDENTIAL 变体', () => {
    process.env = { HTTP_AUTH: 'x', AWS_CREDENTIAL: 'y' };
    const env = buildSafeEnv();
    expect(env.HTTP_AUTH).toBeUndefined();
    expect(env.AWS_CREDENTIAL).toBeUndefined();
  });
});
