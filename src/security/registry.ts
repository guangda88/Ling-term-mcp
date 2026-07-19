/**
 * Security Registry Loader
 * Loads security_registry.yaml into runtime config
 * Provides rules for 灵安 command.yaml integration
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RegistryCommandEntry {
  command: string;
  aliases?: string[];
}

export interface RegistryPattern {
  pattern: string;
  type: 'literal' | 'regex';
  category: 'blacklist' | 'red_zone';
  reason: string;
}

export interface SecurityRegistry {
  version: number;
  updated: string;
  source: string;
  whitelist: { description: string; commands: string[] };
  blacklist: { description: string; commands: string[] };
  authorizable: { description: string; commands: string[] };
  red_zone: {
    description: string;
    approvers: string[];
    commands: string[];
  };
  patterns: { description: string; items: RegistryPattern[] };
}

let cachedRegistry: SecurityRegistry | null = null;
function getRegistryPath(): string {
  return (
    process.env['LING_TERM_REGISTRY_PATH'] ||
    path.resolve(__dirname, '..', '..', 'security_registry.yaml')
  );
}

/**
 * Parse a simple YAML-like format into a SecurityRegistry object.
 * Uses line-based parsing (no external YAML dep).
 */
function parseRegistry(content: string): SecurityRegistry {
  const lines = content.split('\n');
  const registry: any = {
    whitelist: { commands: [] },
    blacklist: { commands: [] },
    authorizable: { commands: [] },
    red_zone: { commands: [], approvers: [] },
    patterns: { items: [] },
  };

  let currentSection: string | null = null;
  let currentPattern: any = null;
  let inPatterns = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) continue;

    // Version/updated/source at top
    if (line.startsWith('version:')) {
      registry.version = parseInt(line.split(':')[1].trim(), 10);
      continue;
    }
    if (line.startsWith('updated:')) {
      registry.updated = line.split(':').slice(1).join(':').trim();
      continue;
    }
    if (line.startsWith('source:')) {
      registry.source = line.split(':').slice(1).join(':').trim();
      continue;
    }

    // Section headers
    if (line.endsWith(':') && !line.startsWith('-') && !line.startsWith('  ')) {
      const section = line.slice(0, -1);
      if (
        [
          'whitelist',
          'blacklist',
          'authorizable',
          'red_zone',
          'patterns',
        ].includes(section)
      ) {
        currentSection = section;
        inPatterns = section === 'patterns';
        currentPattern = null;
      }
      continue;
    }

    if (!currentSection) continue;

    // Sub-section fields (description, approvers)
    const fieldMatch = line.match(/^(\w+):\s*(.*)/);
    if (fieldMatch && !line.startsWith('-')) {
      const [, key, val] = fieldMatch;
      if (inPatterns) {
        if (currentPattern) {
          if (key === 'pattern') currentPattern.pattern = val;
          else if (key === 'type') currentPattern.type = val;
          else if (key === 'category') currentPattern.category = val;
          else if (key === 'reason') currentPattern.reason = val;
        }
      } else if (currentSection && registry[currentSection]) {
        if (key === 'description') {
          registry[currentSection].description = val;
        }
        if (key === 'approvers') {
          registry[currentSection].approvers = val
            .replace(/[[\]"]/g, '')
            .split(',')
            .map((s: string) => s.trim());
        }
      }
      continue;
    }

    // List items (commands and patterns)
    const itemMatch = line.match(/^-\s+(.+)/);
    if (!itemMatch) continue;

    const item = itemMatch[1].trim();

    if (inPatterns) {
      // Inside patterns block — items are complex objects
      // We only capture the first field here; the YAML-like multi-line
      // items are parsed differently.
      if (item.startsWith('pattern:')) {
        if (currentPattern) registry.patterns.items.push(currentPattern);
        currentPattern = {
          pattern: item.replace(/^pattern:\s*/, '').replace(/^"(.*)"$/, '$1'),
        };
      }
    } else if (
      currentSection &&
      registry[currentSection] &&
      Array.isArray(registry[currentSection].commands)
    ) {
      registry[currentSection].commands.push(item);
    }
  }

  // Push last pattern if exists
  if (currentPattern) registry.patterns.items.push(currentPattern);

  return registry as SecurityRegistry;
}

/**
 * Load security registry from YAML file.
 * Cached after first load; call with forceReload=true to refresh.
 * Throws if file is missing or corrupt.
 */
export function loadRegistry(forceReload = false): SecurityRegistry {
  if (cachedRegistry && !forceReload) return cachedRegistry;

  const content = fs.readFileSync(getRegistryPath(), 'utf-8');
  cachedRegistry = parseRegistry(content);

  const wl = cachedRegistry.whitelist.commands.length;
  const bl = cachedRegistry.blacklist.commands.length;
  const az = cachedRegistry.authorizable.commands.length;
  const rz = cachedRegistry.red_zone.commands.length;

  console.error(
    `[SecurityRegistry] loaded: ${wl} whitelist / ${bl} blacklist / ${az} authorizable / ${rz} red_zone`
  );

  return cachedRegistry;
}

/**
 * Try to load registry. Returns null if file missing or corrupt (non-throwing).
 */
export function tryLoadRegistry(): SecurityRegistry | null {
  try {
    return loadRegistry();
  } catch {
    return null;
  }
}

// ── Serialization (write back to YAML) ────────────────────────────

function serializeRegistry(registry: SecurityRegistry): string {
  const lines: string[] = [
    '# Security Registry v1',
    '# Auto-managed by lingxi governance dual-sign system',
    `version: ${registry.version}`,
    `updated: ${new Date().toISOString().slice(0, 10)}`,
    `source: src/security/validator.ts + governance runtime`,
    '',
  ];

  const sections: Array<{
    key: keyof SecurityRegistry;
    label: string;
    hasApprovers?: boolean;
  }> = [
    { key: 'whitelist', label: 'whitelist' },
    { key: 'blacklist', label: 'blacklist' },
    { key: 'authorizable', label: 'authorizable' },
    { key: 'red_zone', label: 'red_zone', hasApprovers: true },
  ];

  for (const sec of sections) {
    const data = registry[sec.key] as {
      description?: string;
      commands: string[];
      approvers?: string[];
    };
    lines.push(`${sec.label}:`);
    lines.push(`  description: "${data.description ?? ''}"`);
    if (sec.hasApprovers && data.approvers) {
      lines.push(
        `  approvers: [${data.approvers.map((a) => `"${a}"`).join(', ')}]`
      );
    }
    lines.push('  commands:');
    for (const cmd of data.commands) {
      lines.push(`  - ${cmd}`);
    }
    lines.push('');
  }

  // Patterns section
  lines.push('patterns:');
  lines.push(`  description: "${registry.patterns.description ?? ''}"`);
  lines.push('  items:');
  for (const p of registry.patterns.items) {
    lines.push(`  - pattern: "${p.pattern}"`);
    lines.push(`    type: ${p.type}`);
    lines.push(`    category: ${p.category}`);
    lines.push(`    reason: "${p.reason}"`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Persist the cached registry to the YAML file.
 */
export function saveRegistry(): void {
  if (!cachedRegistry) {
    throw new Error('No cached registry to save');
  }
  const yaml = serializeRegistry(cachedRegistry);
  fs.writeFileSync(getRegistryPath(), yaml, 'utf-8');
  console.error('[SecurityRegistry] saved to disk');
}

/**
 * Apply a runtime change to the registry and persist to YAML.
 * Called by validator.ts applyListChange() after governance dual-sign approval.
 */
export function applyRegistryChange(
  listType: 'whitelist' | 'blacklist' | 'authorizable' | 'red_zone',
  action: 'add' | 'remove',
  entries: string[]
): void {
  if (!cachedRegistry) {
    tryLoadRegistry();
  }
  if (!cachedRegistry) {
    throw new Error('Registry not loaded, cannot apply change');
  }

  const sectionMap: Record<string, keyof SecurityRegistry> = {
    whitelist: 'whitelist',
    blacklist: 'blacklist',
    authorizable: 'authorizable',
    red_zone: 'red_zone',
  };

  const section = cachedRegistry[sectionMap[listType]] as {
    commands: string[];
  };
  for (const entry of entries) {
    const idx = section.commands.indexOf(entry);
    if (action === 'add' && idx === -1) {
      section.commands.push(entry);
    } else if (action === 'remove' && idx !== -1) {
      section.commands.splice(idx, 1);
    }
  }

  saveRegistry();
}

/**
 * Get whitelist from registry (compatible with validator.ts interface)
 */
export function getWhitelist(): string[] {
  return loadRegistry().whitelist.commands;
}

/**
 * Get blacklist from registry
 */
export function getBlacklist(): string[] {
  return loadRegistry().blacklist.commands;
}

/**
 * Get authorizable commands from registry
 */
export function getAuthorizableCommands(): string[] {
  return loadRegistry().authorizable.commands;
}

/**
 * Get red zone commands from registry
 */
export function getRedZoneCommands(): string[] {
  return loadRegistry().red_zone.commands;
}

/**
 * Get red zone approvers
 */
export function getRedZoneApprovers(): string[] {
  return loadRegistry().red_zone.approvers;
}

/**
 * Get all registry patterns (dangerous patterns)
 */
export function getPatterns(): RegistryPattern[] {
  return loadRegistry().patterns.items;
}

/**
 * Get registry as JSON for 灵安 command.yaml integration
 */
export function getRegistryForLingan(): SecurityRegistry {
  return loadRegistry();
}

/**
 * Reset the cache. For testing only.
 */
export function resetCache(): void {
  cachedRegistry = null;
}
