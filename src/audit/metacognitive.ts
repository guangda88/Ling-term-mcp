/**
 * Metacognitive Audit Framework
 * Evaluates reasoning quality and detects deviations in AI decision-making patterns
 */

import type {
  DecisionRecord,
  MetacognitiveAudit,
  SourceTrace,
  SourceType,
} from '../protocol/types.js';

export interface MetacognitiveMetrics {
  reasoningSpecificity: number; // 0-1: how specific the reasoning is
  reasoningConsistency: number; // 0-1: how consistent reasoning is across decisions
  outcomeAlignment: number; // 0-1: how well outcomes match expectations
  temporalVariation: number; // 0-1: how much reasoning patterns change over time
}

export interface DeviationPattern {
  type: string;
  description: string;
  detected: boolean;
  confidence: number;
  evidence: string[];
}

export interface MetacognitiveConfig {
  minReasoningLength: number;
  minSpecificityScore: number;
  consistencyWindowSize: number;
  deviationThreshold: number;
}

const DEFAULT_CONFIG: MetacognitiveConfig = {
  minReasoningLength: 10,
  minSpecificityScore: 0.5,
  consistencyWindowSize: 10,
  deviationThreshold: 0.3,
};

/**
 * Calculate reasoning specificity based on text analysis
 */
function calculateReasoningSpecificity(
  reasoning: string
): MetacognitiveMetrics['reasoningSpecificity'] {
  if (!reasoning || reasoning.length < DEFAULT_CONFIG.minReasoningLength) {
    return 0;
  }

  const words = reasoning.split(/\s+/);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));

  // Specificity based on:
  // 1. Ratio of unique words (vocabulary diversity)
  // 2. Length relative to minimum
  // 3. Presence of specific markers (numbers, paths, commands)
  const uniqueRatio = uniqueWords.size / words.length;
  const lengthRatio = Math.min(reasoning.length / 100, 1);
  const specificMarkers = /\b\d+\b|\b\/\w+|\b\w+\.\w+\b/.test(reasoning)
    ? 0.2
    : 0;

  return Math.min(uniqueRatio * 0.5 + lengthRatio * 0.3 + specificMarkers, 1);
}

/**
 * Calculate reasoning consistency across a window of decisions
 */
function calculateReasoningConsistency(
  decisions: DecisionRecord[],
  config: MetacognitiveConfig
): MetacognitiveMetrics['reasoningConsistency'] {
  if (decisions.length < 2) return 1;

  const window = decisions.slice(-config.consistencyWindowSize);
  const reasonings = window.map((d) => d.reasoning || '').filter(Boolean);

  if (reasonings.length < 2) return 1;

  // Calculate semantic similarity (simplified version)
  const vectors = reasonings.map((r) => {
    const words = r.toLowerCase().split(/\s+/);
    return new Set(words);
  });

  let totalSimilarity = 0;
  for (let i = 0; i < vectors.length - 1; i++) {
    const intersection = new Set(
      [...vectors[i]].filter((x) => vectors[i + 1].has(x))
    );
    const union = new Set([...vectors[i], ...vectors[i + 1]]);
    totalSimilarity += intersection.size / Math.max(union.size, 1);
  }

  return totalSimilarity / (vectors.length - 1);
}

/**
 * Calculate outcome alignment (how well expectations match reality)
 */
function calculateOutcomeAlignment(
  decisions: DecisionRecord[]
): MetacognitiveMetrics['outcomeAlignment'] {
  if (decisions.length === 0) return 1;

  const successful = decisions.filter((d) => d.success).length;
  return successful / decisions.length;
}

/**
 * Calculate temporal variation in reasoning patterns
 */
function calculateTemporalVariation(
  decisions: DecisionRecord[]
): MetacognitiveMetrics['temporalVariation'] {
  if (decisions.length < 3) return 0;

  // Calculate variation in reasoning length and complexity
  const lengths = decisions.map((d) => (d.reasoning || '').length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((a, l) => a + Math.pow(l - avgLength, 2), 0) /
    lengths.length;
  const stdDev = Math.sqrt(variance);

  // Normalize to 0-1 (using stdDev relative to average)
  return Math.min(stdDev / Math.max(avgLength, 1), 1);
}

/**
 * Detect deviation patterns in decision-making
 */
function detectDeviations(
  metrics: MetacognitiveMetrics,
  decisions: DecisionRecord[],
  config: MetacognitiveConfig
): DeviationPattern[] {
  const patterns: DeviationPattern[] = [];

  // Skip deviation detection if there are not enough decisions
  if (decisions.length < 3) {
    return patterns;
  }

  // Low reasoning specificity
  if (metrics.reasoningSpecificity < config.minSpecificityScore) {
    patterns.push({
      type: 'low_specificity',
      description: 'Reasoning lacks detail and specificity',
      detected: true,
      confidence: 1 - metrics.reasoningSpecificity,
      evidence: decisions
        .filter((d) => (d.reasoning || '').length < config.minReasoningLength)
        .map((d) => `Command: ${d.command}, Reasoning: "${d.reasoning}"`),
    });
  }

  // Inconsistent reasoning
  if (metrics.reasoningConsistency < 1 - config.deviationThreshold) {
    patterns.push({
      type: 'inconsistent_reasoning',
      description: 'Reasoning patterns vary significantly across decisions',
      detected: true,
      confidence: 1 - metrics.reasoningConsistency,
      evidence: [
        `Consistency score: ${metrics.reasoningConsistency.toFixed(2)}`,
        `Deviation threshold: ${config.deviationThreshold}`,
      ],
    });
  }

  // Poor outcome alignment
  if (metrics.outcomeAlignment < 1 - config.deviationThreshold) {
    patterns.push({
      type: 'poor_outcome_alignment',
      description: 'Expected outcomes frequently do not match actual results',
      detected: true,
      confidence: 1 - metrics.outcomeAlignment,
      evidence: [
        `Success rate: ${(metrics.outcomeAlignment * 100).toFixed(1)}%`,
        `${decisions.filter((d) => !d.success).length} failed commands`,
      ],
    });
  }

  // High temporal variation
  if (metrics.temporalVariation > config.deviationThreshold) {
    patterns.push({
      type: 'high_temporal_variation',
      description: 'Reasoning complexity varies significantly over time',
      detected: true,
      confidence: metrics.temporalVariation,
      evidence: [`Variation score: ${metrics.temporalVariation.toFixed(2)}`],
    });
  }

  return patterns.filter((p) => p.detected);
}

/**
 * Create a source trace from a decision
 */
function createSourceTrace(
  decision: DecisionRecord,
  type: SourceType,
  metadata?: Record<string, unknown>
): SourceTrace {
  return {
    type,
    timestamp: decision.timestamp,
    origin: decision.session_id,
    confidence: decision.success ? 0.9 : 0.5,
    metadata: {
      command: decision.command,
      success: decision.success,
      ...metadata,
    },
  };
}

/**
 * Generate recommendations based on detected deviations
 */
function generateRecommendations(
  patterns: DeviationPattern[],
  _metrics: MetacognitiveMetrics
): string[] {
  const recommendations: string[] = [];

  if (patterns.find((p) => p.type === 'low_specificity')) {
    recommendations.push(
      'Increase reasoning specificity by including concrete details, expected outputs, and justification'
    );
  }

  if (patterns.find((p) => p.type === 'inconsistent_reasoning')) {
    recommendations.push(
      'Maintain consistent reasoning patterns and vocabulary across similar operations'
    );
  }

  if (patterns.find((p) => p.type === 'poor_outcome_alignment')) {
    recommendations.push(
      'Improve prediction accuracy by understanding system state and command behavior'
    );
  }

  if (patterns.find((p) => p.type === 'high_temporal_variation')) {
    recommendations.push(
      'Stabilize reasoning complexity and provide consistent level of detail'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Reasoning quality is within acceptable parameters');
  }

  return recommendations;
}

/**
 * Calculate overall reasoning quality score
 */
function calculateOverallScore(metrics: MetacognitiveMetrics): number {
  return (
    (metrics.reasoningSpecificity * 0.3 +
      metrics.reasoningConsistency * 0.3 +
      metrics.outcomeAlignment * 0.3 +
      (1 - metrics.temporalVariation) * 0.1) *
    100
  );
}

/**
 * Perform metacognitive audit on a session
 */
export function performMetacognitiveAudit(
  decisions: DecisionRecord[],
  config: Partial<MetacognitiveConfig> = {}
): MetacognitiveAudit {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Calculate metrics
  const metrics: MetacognitiveMetrics = {
    reasoningSpecificity: calculateReasoningSpecificity(
      decisions[decisions.length - 1]?.reasoning || ''
    ),
    reasoningConsistency: calculateReasoningConsistency(
      decisions,
      mergedConfig
    ),
    outcomeAlignment: calculateOutcomeAlignment(decisions),
    temporalVariation: calculateTemporalVariation(decisions),
  };

  // Detect deviations
  const patterns = detectDeviations(metrics, decisions, mergedConfig);
  const deviationDetected = patterns.length > 0;

  // Create audit trail
  const auditTrail: SourceTrace[] = decisions.map((d) =>
    createSourceTrace(
      d,
      d.success ? ('verified' as SourceType) : ('inferred' as SourceType),
      d.reasoning ? { reasoning_provided: true } : undefined
    )
  );

  // Calculate overall score
  const reasoningQualityScore = calculateOverallScore(metrics);

  // Generate recommendations
  const recommendations = generateRecommendations(patterns, metrics);

  // Get deviation type
  const deviationType = deviationDetected
    ? patterns.map((p) => p.type).join(', ')
    : undefined;

  return {
    audit_id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    session_id: decisions[0]?.session_id || 'unknown',
    reasoning_quality_score: Math.round(reasoningQualityScore),
    deviation_detected: deviationDetected,
    deviation_type: deviationType,
    audit_trail: auditTrail,
    recommendations,
  };
}

export { DEFAULT_CONFIG };
