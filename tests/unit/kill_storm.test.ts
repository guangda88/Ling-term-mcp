/**
 * Kill Storm Alert Tests
 * Tests for lingshell restart_count anomaly detection
 */

import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanLingshellKillStorm } from '../../src/tools/audit_report';

describe('scanLingshellKillStorm', () => {
  let fakeHome: string;
  let realHome: string | undefined;

  beforeEach(() => {
    realHome = process.env.HOME;
    fakeHome = mkdtempSync(join(tmpdir(), 'lingxi-test-'));
    process.env.HOME = fakeHome;
  });

  afterEach(() => {
    if (realHome !== undefined) {
      process.env.HOME = realHome;
    }
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('should return empty array when lingshell state dir does not exist', () => {
    const result = scanLingshellKillStorm();
    expect(result).toEqual([]);
  });

  it('should return empty array when no state files exist', () => {
    const runDir = join(fakeHome, '.lingshell', 'run');
    mkdirSync(runDir, { recursive: true });
    const result = scanLingshellKillStorm();
    expect(result).toEqual([]);
  });

  it('should detect WARNING when restart_count >= 3', () => {
    const runDir = join(fakeHome, '.lingshell', 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'lingtest.state.json'),
      JSON.stringify({ name: 'lingtest', restart_count: 5, pid: 12345 })
    );
    const result = scanLingshellKillStorm();
    expect(result).toHaveLength(1);
    expect(result[0].member).toBe('lingtest');
    expect(result[0].restart_count).toBe(5);
    expect(result[0].severity).toBe('WARNING');
  });

  it('should detect CRITICAL when restart_count >= 8', () => {
    const runDir = join(fakeHome, '.lingshell', 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'lingtong_plus.state.json'),
      JSON.stringify({ name: 'lingtong_plus', restart_count: 8, pid: 999 })
    );
    const result = scanLingshellKillStorm();
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('CRITICAL');
    expect(result[0].restart_count).toBe(8);
  });

  it('should ignore members with restart_count < 3', () => {
    const runDir = join(fakeHome, '.lingshell', 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'lingxi.state.json'),
      JSON.stringify({ name: 'lingxi', restart_count: 1, pid: 123 })
    );
    writeFileSync(
      join(runDir, 'lingflow.state.json'),
      JSON.stringify({ name: 'lingflow', restart_count: 2, pid: 456 })
    );
    const result = scanLingshellKillStorm();
    expect(result).toEqual([]);
  });

  it('should sort alerts by restart_count descending', () => {
    const runDir = join(fakeHome, '.lingshell', 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'a.state.json'),
      JSON.stringify({ name: 'member_a', restart_count: 4 })
    );
    writeFileSync(
      join(runDir, 'b.state.json'),
      JSON.stringify({ name: 'member_b', restart_count: 10 })
    );
    writeFileSync(
      join(runDir, 'c.state.json'),
      JSON.stringify({ name: 'member_c', restart_count: 6 })
    );
    const result = scanLingshellKillStorm();
    expect(result).toHaveLength(3);
    expect(result[0].restart_count).toBe(10);
    expect(result[1].restart_count).toBe(6);
    expect(result[2].restart_count).toBe(4);
  });

  it('should handle malformed state files gracefully', () => {
    const runDir = join(fakeHome, '.lingshell', 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'broken.state.json'), 'not valid json{');
    writeFileSync(
      join(runDir, 'good.state.json'),
      JSON.stringify({ name: 'good', restart_count: 7 })
    );
    const result = scanLingshellKillStorm();
    expect(result).toHaveLength(1);
    expect(result[0].member).toBe('good');
  });

  it('should use filename as member name when name field missing', () => {
    const runDir = join(fakeHome, '.lingshell', 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'unknown_member.state.json'),
      JSON.stringify({ restart_count: 5 })
    );
    const result = scanLingshellKillStorm();
    expect(result).toHaveLength(1);
    expect(result[0].member).toBe('unknown_member');
  });
});
