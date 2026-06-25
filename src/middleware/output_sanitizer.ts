/**
 * Output Sanitizer Middleware
 * COM-01 fix: redact API keys, tokens, passwords from audit output.
 * Runs before auditLogger to ensure no secrets are persisted.
 */

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Bearer tokens
  {
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    replacement: 'Bearer [REDACTED]',
  },
  // API keys (sk-, ghp_, ghs_, github_pat_)
  { pattern: /\bsk-[A-Za-z0-9]{16,}/g, replacement: 'sk-[REDACTED]' },
  { pattern: /\bghp_[A-Za-z0-9]{30,}/g, replacement: 'ghp_[REDACTED]' },
  { pattern: /\bghs_[A-Za-z0-9]{30,}/g, replacement: 'ghs_[REDACTED]' },
  {
    pattern: /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
    replacement: 'github_pat_[REDACTED]',
  },
  // Generic key=value patterns for passwords/tokens/secrets
  {
    pattern:
      /(?<=password|passwd|pwd|token|secret|api_key|apikey|access_key)\s*[=:]\s*["']?[^\s"']{4,}/gi,
    replacement: '$1=[REDACTED]',
  },
  // Authorization headers
  {
    pattern: /Authorization\s*:\s*[^\s]{4,}/gi,
    replacement: 'Authorization: [REDACTED]',
  },
  // X-API-Key headers
  {
    pattern: /X-API-Key\s*:\s*[^\s]{4,}/gi,
    replacement: 'X-API-Key: [REDACTED]',
  },
  // Private keys (BEGIN ... END blocks)
  {
    pattern:
      /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
    replacement: '[PRIVATE KEY REDACTED]',
  },
];

export function sanitizeOutput(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function sanitizeCommand(command: string): string {
  return sanitizeOutput(command);
}
