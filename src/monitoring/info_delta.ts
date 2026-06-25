/**
 * Information Gain Detector — R5 v7 dual-dimension (repeat_burst × text Jaccard)
 *
 * Distinguishes "functional repetition" (same tool, different content) from
 * "cognitive degradation" (same tool, same content — no information gain).
 *
 * Proposed by 灵犀 (lingxi), validated by 灵研 (lingresearch) in rowid 163198.
 * Empirical finding: 5/5 highest repeat_burst sessions were functional iteration,
 * not degradation — R5 v6 was misreporting them.
 */

/**
 * Compute Jaccard similarity between two strings.
 * J(text1 ∩ text2) / J(text1 ∪ text2)
 * 1.0 = identical, 0.0 = completely different
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));

  // Remove empty strings from sets
  setA.delete('');
  setB.delete('');

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1.0 : intersection / union;
}

export interface CommandPair {
  command: string;
  text: string; // r.stdout or r.stderr output
}

export interface InfoDeltaResult {
  /**
   * Repeat-burst rate: proportion of consecutive tool calls
   * that repeat the same command name.
   * 0.0 = no repeats, 1.0 = all repeats.
   */
  repeatBurstRate: number;

  /**
   * Maximum Jaccard similarity among consecutive same-command pairs.
   * >0.7 with high repeatBurstRate → cognitive repetition (real degradation)
   * <0.3 with high repeatBurstRate → functional iteration (not degradation)
   * >0.7 with low repeatBurstRate → rhetoric loop (new detection in v7)
   */
  maxJaccardSameCommand: number;

  /**
   * Classification based on the dual-dimension matrix.
   */
  classification:
    | 'cognitive_repeat'
    | 'functional_iteration'
    | 'rhetoric_loop'
    | 'healthy';

  /**
   * The pair that triggered the classification (for debugging).
   */
  triggerPair?: { command: string; jaccard: number };
}

/**
 * R5 v7 dual-dimension matrix:
 *
 * | repeatBurst | textJaccard | classification    | R5 v6     | True      |
 * |-------------|-------------|-------------------|-----------|-----------|
 * | high        | high        | cognitive_repeat  | ❌ misreport | ✅ real degradation |
 * | high        | low         | functional_iteration | ✅ correct | ✅ not degradation |
 * | low         | high        | rhetoric_loop     | ❌ missed  | ❌ real degradation |
 * | low         | low         | healthy           | ✅ correct | ✅ healthy |
 *
 * Weight: cognitive_repeat & rhetoric_loop = weight 1.0 (real degradation)
 *         functional_iteration = weight 0 (filtered out)
 */

export function classifyInfoDelta(
  repeatBurstRate: number,
  maxJaccard: number
): InfoDeltaResult['classification'] {
  const HIGH_RB = 0.15;
  const HIGH_J = 0.7;
  const LOW_J = 0.3;

  if (repeatBurstRate > HIGH_RB && maxJaccard > HIGH_J)
    return 'cognitive_repeat';
  if (repeatBurstRate > HIGH_RB && maxJaccard < LOW_J)
    return 'functional_iteration';
  if (repeatBurstRate < HIGH_RB && maxJaccard > HIGH_J) return 'rhetoric_loop';
  return 'healthy';
}

/**
 * Analyze command pairs for information gain.
 * Takes an array of {command, text} pairs in execution order.
 */
export function analyzeInfoDelta(pairs: CommandPair[]): InfoDeltaResult {
  if (pairs.length < 2) {
    return {
      repeatBurstRate: 0,
      maxJaccardSameCommand: 0,
      classification: 'healthy',
    };
  }

  // Count consecutive same-command occurrences
  let sameCommandCount = 0;
  let maxJaccard = 0;
  let triggerPair: { command: string; jaccard: number } | undefined;

  for (let i = 1; i < pairs.length; i++) {
    const prevCmd = pairs[i - 1].command.split(' ')[0];
    const currCmd = pairs[i].command.split(' ')[0];

    if (prevCmd === currCmd) {
      sameCommandCount++;
      const j = jaccardSimilarity(pairs[i - 1].text, pairs[i].text);
      if (j > maxJaccard) {
        maxJaccard = j;
        triggerPair = { command: currCmd, jaccard: j };
      }
    }
  }

  const repeatBurstRate =
    pairs.length > 1 ? sameCommandCount / (pairs.length - 1) : 0;

  return {
    repeatBurstRate: Math.round(repeatBurstRate * 1000) / 1000,
    maxJaccardSameCommand: Math.round(maxJaccard * 1000) / 1000,
    classification: classifyInfoDelta(repeatBurstRate, maxJaccard),
    triggerPair,
  };
}
