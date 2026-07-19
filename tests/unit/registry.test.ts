import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-test-'));
const TMP_YAML = path.join(TMP_DIR, 'security_registry.yaml');

// Set env BEFORE importing registry module (lazy eval via getRegistryPath())
process.env['LING_TERM_REGISTRY_PATH'] = TMP_YAML;
// Disable validator.ts syncFromRegistry from touching real YAML
process.env['LING_TERM_REGISTRY_SKIP_SYNC'] = '1';

import {
  loadRegistry,
  tryLoadRegistry,
  saveRegistry,
  applyRegistryChange,
  resetCache,
} from '../../src/security/registry';

const SAMPLE_YAML = `version: 1
updated: 2026-07-15
source: test

whitelist:
  description: "safe commands"
  commands:
  - ls
  - pwd
  - cat

blacklist:
  description: "forbidden"
  commands:
  - rm
  - sudo

authorizable:
  description: "needs auth"
  commands:
  - kill
  - chmod

red_zone:
  description: "needs dual-sign"
  approvers: ["族长", "灵通"]
  commands:
  - ssh
  - curl

patterns:
  description: "dangerous patterns"
  items:
  - pattern: "rm -rf /"
    type: literal
    category: blacklist
    reason: "root deletion"
`;

describe('security registry', () => {
  afterAll(() => {
    delete process.env['LING_TERM_REGISTRY_PATH'];
    delete process.env['LING_TERM_REGISTRY_SKIP_SYNC'];
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  beforeEach(() => {
    resetCache();
    try {
      fs.unlinkSync(TMP_YAML);
    } catch {
      // may not exist
    }
  });

  describe('loadRegistry', () => {
    it('should load from YAML file', () => {
      fs.writeFileSync(TMP_YAML, SAMPLE_YAML, 'utf-8');
      const reg = loadRegistry();

      expect(reg.version).toBe(1);
      expect(reg.whitelist.commands).toContain('ls');
      expect(reg.whitelist.commands).toContain('cat');
      expect(reg.blacklist.commands).toContain('rm');
      expect(reg.authorizable.commands).toContain('kill');
      expect(reg.red_zone.commands).toContain('ssh');
      expect(reg.red_zone.commands).toContain('curl');
      expect(reg.red_zone.approvers).toContain('族长');
    });

    it('should cache after first load', () => {
      fs.writeFileSync(TMP_YAML, SAMPLE_YAML, 'utf-8');
      const reg1 = loadRegistry();
      fs.unlinkSync(TMP_YAML);
      const reg2 = loadRegistry();
      expect(reg2).toBe(reg1);
    });

    it('should force reload when requested', () => {
      fs.writeFileSync(TMP_YAML, SAMPLE_YAML, 'utf-8');
      const reg1 = loadRegistry();

      const modified = SAMPLE_YAML.replace('- curl', '- curl\n- docker');
      fs.writeFileSync(TMP_YAML, modified, 'utf-8');

      const reg2 = loadRegistry(true);
      expect(reg2.red_zone.commands).toContain('docker');
      expect(reg1.red_zone.commands).not.toContain('docker');
    });
  });

  describe('tryLoadRegistry', () => {
    it('should return null when file is missing', () => {
      const reg = tryLoadRegistry();
      expect(reg).toBeNull();
    });

    it('should return registry when file exists', () => {
      fs.writeFileSync(TMP_YAML, SAMPLE_YAML, 'utf-8');
      const reg = tryLoadRegistry();
      expect(reg).not.toBeNull();
      expect(reg!.whitelist.commands).toContain('ls');
    });
  });

  describe('saveRegistry', () => {
    it('should serialize and write back to YAML', () => {
      fs.writeFileSync(TMP_YAML, SAMPLE_YAML, 'utf-8');
      const reg = loadRegistry();

      reg.whitelist.commands.push('newcmd');
      saveRegistry();

      resetCache();
      const reloaded = loadRegistry();
      expect(reloaded.whitelist.commands).toContain('newcmd');
    });

    it('should throw when no cached registry', () => {
      resetCache();
      expect(() => saveRegistry()).toThrow('No cached registry');
    });
  });

  describe('applyRegistryChange', () => {
    beforeEach(() => {
      fs.writeFileSync(TMP_YAML, SAMPLE_YAML, 'utf-8');
      resetCache();
      loadRegistry();
    });

    it('should add a command to whitelist and persist', () => {
      applyRegistryChange('whitelist', 'add', ['git']);

      resetCache();
      const reloaded = loadRegistry();
      expect(reloaded.whitelist.commands).toContain('git');
    });

    it('should remove a command from red_zone and persist', () => {
      applyRegistryChange('red_zone', 'remove', ['curl']);

      resetCache();
      const reloaded = loadRegistry();
      expect(reloaded.red_zone.commands).not.toContain('curl');
      expect(reloaded.red_zone.commands).toContain('ssh');
    });

    it('should be idempotent when adding existing command', () => {
      applyRegistryChange('whitelist', 'add', ['ls']);

      resetCache();
      const reloaded = loadRegistry();
      const lsCount = reloaded.whitelist.commands.filter(
        (c) => c === 'ls'
      ).length;
      expect(lsCount).toBe(1);
    });

    it('should be idempotent when removing non-existent command', () => {
      applyRegistryChange('blacklist', 'remove', ['nonexistent']);

      resetCache();
      const reloaded = loadRegistry();
      expect(reloaded.blacklist.commands).toContain('rm');
    });
  });

  describe('roundtrip integrity', () => {
    it('should preserve all sections through save/reload cycle', () => {
      fs.writeFileSync(TMP_YAML, SAMPLE_YAML, 'utf-8');
      const original = loadRegistry();

      saveRegistry();
      resetCache();
      const reloaded = loadRegistry();

      expect(reloaded.whitelist.commands).toEqual(original.whitelist.commands);
      expect(reloaded.blacklist.commands).toEqual(original.blacklist.commands);
      expect(reloaded.authorizable.commands).toEqual(
        original.authorizable.commands
      );
      expect(reloaded.red_zone.commands).toEqual(original.red_zone.commands);
      expect(reloaded.red_zone.approvers).toEqual(original.red_zone.approvers);
    });
  });
});
