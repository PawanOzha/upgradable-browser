import { AIProvider } from '../services/aiProvider';
import { AgentRunOptions, AgentRunResult, ToolContext } from './types';
import { getTool } from './toolRegistry';
import { BestActionSelector, BestActionResult } from './bestActionSelector';
import { PlanningEngine, ExecutionPlan } from './planningEngine';
import { EnhancedPlanner, EnhancedPlan } from './enhancedPlanner';
import { LearningSystem } from './learningSystem';

/**
 * Super-Agentic Runtime
 * Advanced agent runtime with:
 * - Intelligent action selection
 * - Multi-step planning
 * - Learning from outcomes
 * - Self-reflection and correction
 */

export interface SuperAgenticOptions extends AgentRunOptions {
  enablePlanning?: boolean;
  enableLearning?: boolean;
  enableReflection?: boolean;
  verbose?: boolean;
}

export interface StepResult {
  step: number;
  action: string;
  tool: string;
  args: any;
  success: boolean;
  error?: string;
  confidence: number;
  reasoning: string;
  reflection?: string;
}

export class SuperAgenticRuntime {
  private learningSystem: LearningSystem;
  private planningEngine: PlanningEngine;
  private enhancedPlanner: EnhancedPlanner;
  private executionPlan?: ExecutionPlan | EnhancedPlan;
  private stepResults: StepResult[] = [];
  private consecutiveFailures = 0;

  constructor(private options: SuperAgenticOptions) {
    this.learningSystem = new LearningSystem();
    this.planningEngine = new PlanningEngine(options.provider);
    this.enhancedPlanner = new EnhancedPlanner(options.provider);
  }

  /**
   * Main execution method
   */
  async run(): Promise<AgentRunResult> {
    const {
      provider,
      prompt,
      webview,
      page,
      maxSteps = 10,
      onLog,
      enablePlanning = true,
      enableLearning = true,
      enableReflection = true,
      verbose = false
    } = this.options;

    const log = (line: string) => {
      if (onLog) onLog(line);
      if (verbose) console.log(`[SuperAgent] ${line}`);
    };

    // Ensure tools are loaded
    await this.loadTools();

    const ctx: ToolContext = { webview, page, log };

    log(`🎯 Goal: ${prompt}`);
    log(`🤖 AI Provider: ${provider}`);
    log(`⚙️  Super-Agentic mode: Planning=${enablePlanning}, Learning=${enableLearning}, Reflection=${enableReflection}`);

    // Step 1: Create execution plan (if enabled)
    if (enablePlanning) {
      log('📋 Generating PERFECT execution plan with optimal tool selection...');
      try {
        // Always use Enhanced Planner for better tool selection
        log('🧠 Using Enhanced Planner (smart tool selection)');
        this.executionPlan = await this.enhancedPlanner.generatePerfectPlan(prompt, page);

        log(`📝 Plan: ${this.executionPlan.strategy}`);
        log(`📊 Steps: ${this.executionPlan.totalSteps}, Difficulty: ${this.executionPlan.estimatedDifficulty}`);

        // Show risk factors if using enhanced planner
        if ('riskFactors' in this.executionPlan && this.executionPlan.riskFactors.length > 0) {
          log(`⚠️  Risk Factors: ${this.executionPlan.riskFactors.join(', ')}`);
        }

        if (verbose) {
          this.executionPlan.steps.forEach(step => {
            const confidence = 'confidence' in step ? ` (${Math.round((step as any).confidence * 100)}% confidence)` : '';
            log(`  ${step.step}. ${step.description}${confidence}`);
            if ('rationale' in step) {
              log(`     → ${(step as any).rationale}`);
            }
          });
        }
      } catch (error) {
        log(`⚠️  Planning failed, continuing with adaptive approach`);
      }
    }

    // Step 2: Execute actions step by step
    const previousActions: string[] = [];
    const failedAttempts: string[] = [];

    for (let step = 0; step < maxSteps; step++) {
      log(`\n🔄 Step ${step + 1}/${maxSteps}`);

      // Check if we should replan
      if (this.executionPlan && this.planningEngine.shouldReplan(
        this.executionPlan,
        step,
        this.consecutiveFailures
      )) {
        log('🔀 Replanning due to obstacles...');
        const lastError = this.stepResults[this.stepResults.length - 1]?.error || 'Unknown error';
        this.executionPlan = await this.planningEngine.adaptPlan(
          this.executionPlan,
          step,
          lastError,
          page
        );
        log(`📝 New plan: ${this.executionPlan.strategy}`);
      }

      // Get learning insights (if enabled)
      if (enableLearning && step > 0) {
        const recommendations = this.learningSystem.getRecommendations(
          'unknown', // Would need page type detection
          prompt
        );
        if (recommendations.length > 0 && verbose) {
          log(`💡 Learning: ${recommendations[0]}`);
        }
      }

      // Select best action
      log('🤔 Analyzing page and selecting best action...');
      const selector = new BestActionSelector(provider, ctx, page);

      let actionResult: BestActionResult;
      try {
        actionResult = await selector.selectBestAction(
          prompt,
          previousActions,
          failedAttempts
        );

        if (verbose) {
          log(`📊 Page type: ${actionResult.pageAnalysis.pageType}`);
          log(`🎯 Key elements: ${actionResult.pageAnalysis.keyElements.length}`);
        }

        const selected = actionResult.selectedAction;
        log(`✨ Selected: ${selected.tool} (confidence: ${(selected.confidence * 100).toFixed(0)}%)`);
        log(`💭 Reasoning: ${selected.reasoning}`);

        // Apply learning boost/penalty
        if (enableLearning) {
          const modifier = this.learningSystem.getConfidenceModifier(
            selected.tool,
            actionResult.pageAnalysis.pageType,
            selected.args
          );
          if (Math.abs(modifier) > 0.05) {
            log(`📈 Learning modifier: ${(modifier * 100).toFixed(0)}%`);
          }
        }

        // Check if this is a "done" signal
        if (selected.tool === 'final' || selected.tool === 'done') {
          log(`✅ Agent signaled completion`);
          return {
            finalText: selected.expectedOutcome || 'Task completed',
            steps: this.stepResults
          };
        }

        // Execute the selected action
        const tool = getTool(selected.tool);
        if (!tool) {
          log(`❌ Tool not found: ${selected.tool}`);
          failedAttempts.push(`${selected.tool} (not found)`);
          this.consecutiveFailures++;
          continue;
        }

        log(`⚡ Executing: ${tool.name}...`);
        const toolResult = await tool.execute(ctx, selected.args);

        const stepResult: StepResult = {
          step: step + 1,
          action: selected.reasoning,
          tool: selected.tool,
          args: selected.args,
          success: toolResult.success,
          error: toolResult.error,
          confidence: selected.confidence,
          reasoning: actionResult.reasoning
        };

        // Record in learning system
        if (enableLearning) {
          this.learningSystem.recordAction(
            selected.tool,
            selected.args,
            actionResult.pageAnalysis.pageType,
            prompt,
            toolResult.success,
            toolResult.error
          );
        }

        if (toolResult.success) {
          log(`✅ Success! ${JSON.stringify(toolResult.output || {})}`);
          previousActions.push(`${selected.tool}(${JSON.stringify(selected.args)})`);
          this.consecutiveFailures = 0;

          // Self-reflection (if enabled)
          if (enableReflection) {
            const reflection = await this.reflect(
              prompt,
              previousActions,
              page,
              this.executionPlan
            );
            stepResult.reflection = reflection;

            if (reflection.includes('GOAL_ACHIEVED')) {
              log(`🎉 Reflection: Goal appears to be achieved!`);
              this.stepResults.push(stepResult);
              return {
                finalText: `Goal achieved after ${step + 1} steps`,
                steps: this.stepResults
              };
            }

            if (verbose && reflection) {
              log(`🪞 Reflection: ${reflection.substring(0, 100)}...`);
            }
          }
        } else {
          log(`❌ Failed: ${toolResult.error}`);
          failedAttempts.push(`${selected.tool} (${toolResult.error})`);
          this.consecutiveFailures++;

          // Check if we should retry
          if (enableLearning && this.learningSystem.shouldRetry(
            selected.tool,
            selected.args,
            this.consecutiveFailures
          )) {
            log(`🔄 Learning system suggests retry is worthwhile`);
          }

          // If too many consecutive failures, try to recover
          if (this.consecutiveFailures >= 3) {
            log(`⚠️  Multiple failures, attempting recovery...`);
            const recoveryAction = await this.attemptRecovery(ctx, page, failedAttempts);
            if (recoveryAction) {
              log(`🔧 Recovery action: ${recoveryAction}`);
              previousActions.push(recoveryAction);
              this.consecutiveFailures = 0;
            }
          }
        }

        this.stepResults.push(stepResult);

        // Check plan progress
        if (this.executionPlan) {
          const progress = this.planningEngine.estimateProgress(
            this.executionPlan,
            step + 1,
            this.stepResults
          );
          if (verbose) {
            log(`📊 Plan progress: ${(progress * 100).toFixed(0)}%`);
          }

          // If we've achieved significant progress and recent actions are successful
          if (progress > 0.8 && this.consecutiveFailures === 0) {
            log(`✅ High progress achieved, checking if goal is met...`);
            // Could add goal verification here
          }
        }

      } catch (error: any) {
        log(`❌ Step error: ${error?.message || error}`);
        this.consecutiveFailures++;
        failedAttempts.push(`error: ${error?.message}`);
      }

      // Small delay between steps
      await new Promise(r => setTimeout(r, 500));
    }

    // Max steps reached
    log(`⏱️  Max steps (${maxSteps}) reached`);

    // Final learning insights
    if (enableLearning) {
      const insights = this.learningSystem.getInsights();
      log(`\n📚 Learning Insights:`);
      insights.forEach(insight => log(`  - ${insight}`));
    }

    return {
      finalText: `Stopped after ${maxSteps} steps. ${this.stepResults.filter(s => s.success).length} successful actions.`,
      steps: this.stepResults
    };
  }

  /**
   * Self-reflection: Analyze progress and decide if goal is achieved
   */
  private async reflect(
    goal: string,
    actions: string[],
    page: any,
    plan?: ExecutionPlan
  ): Promise<string> {
    // Simple reflection for now
    // In a full implementation, this would call the AI to analyze progress

    const successfulActions = this.stepResults.filter(s => s.success).length;
    const totalActions = this.stepResults.length;
    const successRate = successfulActions / Math.max(totalActions, 1);

    if (successRate > 0.8 && totalActions >= 3) {
      // High success rate, likely making good progress
      if (plan) {
        const planProgress = this.planningEngine.estimateProgress(
          plan,
          totalActions,
          this.stepResults
        );
        if (planProgress > 0.9) {
          return 'GOAL_ACHIEVED: Plan nearly complete with high success rate';
        }
      }
      return 'PROGRESS_GOOD: Actions are succeeding, continue current approach';
    }

    if (successRate < 0.3 && totalActions >= 3) {
      return 'PROGRESS_POOR: Many failures, consider changing strategy';
    }

    return 'PROGRESS_NORMAL: Continue execution';
  }

  /**
   * Attempt to recover from multiple failures
   */
  private async attemptRecovery(
    ctx: ToolContext,
    page: any,
    recentFailures: string[]
  ): Promise<string | null> {
    // Recovery strategies:
    // 1. Extract page info to understand current state
    // 2. Scroll to find more content
    // 3. Wait for page to finish loading

    try {
      // Try extracting links to understand page
      const extractTool = getTool('extract_links');
      if (extractTool) {
        await extractTool.execute(ctx, {});
        return 'extract_links (recovery)';
      }

      // Try waiting
      const waitTool = getTool('wait_ms');
      if (waitTool) {
        await waitTool.execute(ctx, { ms: 2000 });
        return 'wait_ms (recovery)';
      }
    } catch {
      // Recovery failed
    }

    return null;
  }

  /**
   * Load all agent tools
   */
  private async loadTools(): Promise<void> {
    await import('./tools/webTools');
    await import('./tools/smartElementTools');
    await import('./tools/searchAgentTools');
    await import('./tools/spaceMailTools');
  }

  /**
   * Get learning system (for external access)
   */
  getLearningSystem(): LearningSystem {
    return this.learningSystem;
  }

  /**
   * Get step results
   */
  getStepResults(): StepResult[] {
    return this.stepResults;
  }

  /**
   * Get execution plan
   */
  getExecutionPlan(): ExecutionPlan | undefined {
    return this.executionPlan;
  }
}

/**
 * Convenience function to run super-agentic automation
 */
export async function runSuperAgent(options: SuperAgenticOptions): Promise<AgentRunResult> {
  const runtime = new SuperAgenticRuntime(options);
  return await runtime.run();
}
