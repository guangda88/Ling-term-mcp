/**
 * Global Jest setup — runs before any test file.
 *
 * Redirects rejection log to a temp file so tests never pollute
 * the production rejection log (~/.ling-term-mcp/rejections.jsonl).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ling-term-test-'));
process.env['LING_TERM_REJECTION_LOG'] = path.join(tmpDir, 'rejections.jsonl');
