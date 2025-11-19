/**
 * Learning System - Learns from action outcomes and improves decision-making
 */

export interface ActionMemory {
  tool: string;
  args: Record<string, any>;
  pageType: string;
  context: string; // brief context
  success: boolean;
  errorReason?: string;
  timestamp: number;
}

export interface PatternLearning {
  pattern: string;
  successRate: number;
  totalAttempts: number;
  bestPractice: string;
  commonMistakes: string[];
}

export class LearningSystem {
  private memory: ActionMemory[] = [];
  private patterns: Map<string, PatternLearning> = new Map();
  private maxMemorySize = 200; // Keep last 200 actions

  /**
   * Record an action and its outcome
   */
  recordAction(
    tool: string,
    args: Record<string, any>,
    pageType: string,
    context: string,
    success: boolean,
    errorReason?: string
  ): void {
    const memory: ActionMemory = {
      tool,
      args,
      pageType,
      context: context.substring(0, 200),
      success,
      errorReason,
      timestamp: Date.now()
    };

    this.memory.push(memory);

    // Keep memory bounded
    if (this.memory.length > this.maxMemorySize) {
      this.memory = this.memory.slice(-this.maxMemorySize);
    }

    // Update patterns
    this.updatePatterns(memory);
  }

  /**
   * Get success rate for a specific tool on a page type
   */
  getSuccessRate(tool: string, pageType: string): number {
    const relevant = this.memory.filter(
      m => m.tool === tool && m.pageType === pageType
    );

    if (relevant.length === 0) return 0.5; // Neutral if no data

    const successful = relevant.filter(m => m.success).length;
    return successful / relevant.length;
  }

  /**
   * Get recommendations based on learned patterns
   */
  getRecommendations(pageType: string, goal: string): string[] {
    const recommendations: string[] = [];

    // Find successful patterns for this page type
    const successfulActions = this.memory
      .filter(m => m.pageType === pageType && m.success)
      .slice(-20); // Last 20 successful

    // Count tool frequencies
    const toolFrequency = new Map<string, number>();
    successfulActions.forEach(action => {
      toolFrequency.set(action.tool, (toolFrequency.get(action.tool) || 0) + 1);
    });

    // Sort by frequency
    const sortedTools = Array.from(toolFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    sortedTools.forEach(([tool, count]) => {
      recommendations.push(
        `Tool '${tool}' has worked ${count} times on ${pageType} pages`
      );
    });

    // Add pattern-based recommendations
    this.patterns.forEach((learning, pattern) => {
      if (learning.successRate > 0.7 && learning.totalAttempts >= 3) {
        recommendations.push(learning.bestPractice);
      }
    });

    return recommendations;
  }

  /**
   * Get common mistakes to avoid
   */
  getCommonMistakes(tool: string): string[] {
    const mistakes: string[] = [];

    const failedAttempts = this.memory
      .filter(m => m.tool === tool && !m.success && m.errorReason)
      .slice(-10);

    // Group by error reason
    const errorCounts = new Map<string, number>();
    failedAttempts.forEach(attempt => {
      if (attempt.errorReason) {
        errorCounts.set(
          attempt.errorReason,
          (errorCounts.get(attempt.errorReason) || 0) + 1
        );
      }
    });

    // Get top errors
    Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([error, count]) => {
        mistakes.push(`${error} (occurred ${count} times)`);
      });

    return mistakes;
  }

  /**
   * Should retry an action based on historical performance?
   */
  shouldRetry(
    tool: string,
    args: Record<string, any>,
    attemptCount: number
  ): boolean {
    // Don't retry more than 2 times
    if (attemptCount >= 2) return false;

    // Check if similar actions have succeeded in the past
    const similar = this.memory.filter(m => {
      if (m.tool !== tool) return false;

      // Simple similarity check on args
      const argKeys = Object.keys(args);
      const similarArgs = argKeys.some(key =>
        m.args[key] === args[key]
      );

      return similarArgs;
    });

    if (similar.length === 0) return true; // No data, worth trying

    const successRate = similar.filter(m => m.success).length / similar.length;
    return successRate > 0.3; // Retry if >30% success rate
  }

  /**
   * Get confidence boost/penalty based on learning
   */
  getConfidenceModifier(
    tool: string,
    pageType: string,
    args: Record<string, any>
  ): number {
    const successRate = this.getSuccessRate(tool, pageType);

    // Convert success rate to confidence modifier (-0.2 to +0.2)
    return (successRate - 0.5) * 0.4;
  }

  /**
   * Analyze recent performance
   */
  getPerformanceAnalysis(): {
    totalActions: number;
    successRate: number;
    mostSuccessfulTool: string;
    mostProblematicTool: string;
    recentTrend: 'improving' | 'declining' | 'stable';
  } {
    const recentActions = this.memory.slice(-20);

    if (recentActions.length === 0) {
      return {
        totalActions: 0,
        successRate: 0,
        mostSuccessfulTool: 'none',
        mostProblematicTool: 'none',
        recentTrend: 'stable'
      };
    }

    const successCount = recentActions.filter(a => a.success).length;
    const successRate = successCount / recentActions.length;

    // Find most successful tool
    const toolStats = new Map<string, { success: number; total: number }>();
    recentActions.forEach(action => {
      const stats = toolStats.get(action.tool) || { success: 0, total: 0 };
      stats.total++;
      if (action.success) stats.success++;
      toolStats.set(action.tool, stats);
    });

    let bestTool = 'none';
    let bestRate = 0;
    let worstTool = 'none';
    let worstRate = 1;

    toolStats.forEach((stats, tool) => {
      const rate = stats.success / stats.total;
      if (rate > bestRate && stats.total >= 2) {
        bestRate = rate;
        bestTool = tool;
      }
      if (rate < worstRate && stats.total >= 2) {
        worstRate = rate;
        worstTool = tool;
      }
    });

    // Determine trend
    const firstHalf = recentActions.slice(0, Math.floor(recentActions.length / 2));
    const secondHalf = recentActions.slice(Math.floor(recentActions.length / 2));

    const firstHalfSuccess = firstHalf.filter(a => a.success).length / firstHalf.length;
    const secondHalfSuccess = secondHalf.filter(a => a.success).length / Math.max(secondHalf.length, 1);

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (secondHalfSuccess > firstHalfSuccess + 0.1) trend = 'improving';
    else if (secondHalfSuccess < firstHalfSuccess - 0.1) trend = 'declining';

    return {
      totalActions: this.memory.length,
      successRate,
      mostSuccessfulTool: bestTool,
      mostProblematicTool: worstTool,
      recentTrend: trend
    };
  }

  /**
   * Update pattern learnings
   */
  private updatePatterns(memory: ActionMemory): void {
    // Create pattern key
    const patternKey = `${memory.pageType}:${memory.tool}`;

    const existing = this.patterns.get(patternKey) || {
      pattern: patternKey,
      successRate: 0,
      totalAttempts: 0,
      bestPractice: '',
      commonMistakes: []
    };

    existing.totalAttempts++;

    // Update success rate (running average)
    const prevSuccesses = existing.successRate * (existing.totalAttempts - 1);
    const newSuccesses = prevSuccesses + (memory.success ? 1 : 0);
    existing.successRate = newSuccesses / existing.totalAttempts;

    // Update best practice
    if (memory.success && existing.successRate > 0.7) {
      existing.bestPractice = `On ${memory.pageType} pages, ${memory.tool} works well`;
    }

    // Track common mistakes
    if (!memory.success && memory.errorReason) {
      if (!existing.commonMistakes.includes(memory.errorReason)) {
        existing.commonMistakes.push(memory.errorReason);
        if (existing.commonMistakes.length > 5) {
          existing.commonMistakes.shift(); // Keep only last 5
        }
      }
    }

    this.patterns.set(patternKey, existing);
  }

  /**
   * Export learning data (for persistence)
   */
  exportData(): { memory: ActionMemory[]; patterns: Array<[string, PatternLearning]> } {
    return {
      memory: this.memory,
      patterns: Array.from(this.patterns.entries())
    };
  }

  /**
   * Import learning data (from storage)
   */
  importData(data: { memory: ActionMemory[]; patterns: Array<[string, PatternLearning]> }): void {
    this.memory = data.memory || [];
    this.patterns = new Map(data.patterns || []);
  }

  /**
   * Clear all learning data
   */
  clear(): void {
    this.memory = [];
    this.patterns.clear();
  }

  /**
   * Get insights summary
   */
  getInsights(): string[] {
    const insights: string[] = [];
    const analysis = this.getPerformanceAnalysis();

    insights.push(`Total actions recorded: ${analysis.totalActions}`);
    insights.push(`Overall success rate: ${(analysis.successRate * 100).toFixed(1)}%`);

    if (analysis.mostSuccessfulTool !== 'none') {
      insights.push(`Most reliable tool: ${analysis.mostSuccessfulTool}`);
    }

    if (analysis.recentTrend === 'improving') {
      insights.push('Performance is improving over time');
    } else if (analysis.recentTrend === 'declining') {
      insights.push('Recent performance has declined - may need strategy adjustment');
    }

    // Add pattern insights
    let highSuccessPatterns = 0;
    this.patterns.forEach(pattern => {
      if (pattern.successRate > 0.8 && pattern.totalAttempts >= 5) {
        highSuccessPatterns++;
      }
    });

    if (highSuccessPatterns > 0) {
      insights.push(`Discovered ${highSuccessPatterns} highly reliable patterns`);
    }

    return insights;
  }
}
