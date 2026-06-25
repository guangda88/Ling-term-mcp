/**
 * Self-Driven Task Registry Loader
 * Reads boundary rules from the self-driven task registry and provides them
 * as context for behavioral contracts.
 */

import * as fs from 'fs';

export interface TaskBoundary {
  no_publish: boolean;
  no_deploy: boolean;
  no_modify_shared: boolean;
  no_api_cost?: boolean;
  max_duration?: string;
  output_to?: string | null;
  max_output_size?: string;
}

export interface SelfDrivenTask {
  task_id: string;
  name: string;
  category: string;
  prompt: string;
  boundary: TaskBoundary;
  completion_criteria: string;
  runtime?: {
    enabled?: boolean;
    status?: string;
  };
}

interface RegistryMember {
  role: string;
  tasks: SelfDrivenTask[];
}

interface Registry {
  version: string;
  members: Record<string, RegistryMember>;
}

const REGISTRY_PATHS = [
  '/home/ai/lingclaude/.audit/self_driven_tasks_draft.json',
  '/home/ai/.lingflow-plus/self_driven_tasks.json',
];

let cachedRegistry: Registry | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

function loadRegistry(): Registry | null {
  const now = Date.now();
  if (cachedRegistry && now - cacheTime < CACHE_TTL) {
    return cachedRegistry;
  }

  for (const p of REGISTRY_PATHS) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      cachedRegistry = JSON.parse(raw) as Registry;
      cacheTime = now;
      return cachedRegistry;
    } catch {
      continue;
    }
  }
  return null;
}

export function getBoundariesForMember(memberName: string): TaskBoundary[] {
  const registry = loadRegistry();
  if (!registry) {
    // SEC-07: fail-closed — if registry file is missing, assume all restrictions apply
    return [
      {
        no_publish: true,
        no_deploy: true,
        no_modify_shared: true,
      },
    ];
  }
  if (!registry.members[memberName]) return [];

  return registry.members[memberName].tasks
    .filter(
      (t) => t.runtime?.enabled !== false && t.runtime?.status !== 'disabled'
    )
    .map((t) => t.boundary);
}

export function isPublishBlocked(memberName: string): boolean {
  const boundaries = getBoundariesForMember(memberName);
  return boundaries.some((b) => b.no_publish);
}

export function isModifySharedBlocked(memberName: string): boolean {
  const boundaries = getBoundariesForMember(memberName);
  return boundaries.some((b) => b.no_modify_shared);
}

export function getAllowedOutputDir(memberName: string): string | null {
  const boundaries = getBoundariesForMember(memberName);
  const withDir = boundaries.filter((b) => b.output_to);
  return withDir.length > 0 ? withDir[0].output_to! : null;
}

export function getRegistryContext(
  memberName: string
): Record<string, unknown> {
  const registry = loadRegistry();
  if (!registry || !registry.members[memberName]) return {};

  const activeTasks = registry.members[memberName].tasks.filter(
    (t) => t.runtime?.enabled !== false && t.runtime?.status !== 'disabled'
  );

  return {
    caller: memberName,
    allowedOutputDir: getAllowedOutputDir(memberName),
    publishBlocked: isPublishBlocked(memberName),
    modifySharedBlocked: isModifySharedBlocked(memberName),
    activeTaskCount: activeTasks.length,
    activeTaskIds: activeTasks.map((t) => t.task_id),
  };
}
