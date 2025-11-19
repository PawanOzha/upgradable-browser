import { AIProvider } from '../services/aiProvider';
import { PageContext } from './types';
import { chat as aiChat } from '../services/aiProvider';

export interface ActionStep {
  step: number;
  tool: string;
  args: Record<string, any>;
  description: string;
  rationale: string;
  expectedResult: string;
  successCriteria?: string;
}

export interface ExecutionPlan {
  goal: string;
  strategy: string;
  steps: ActionStep[];
  totalSteps: number;
  estimatedDifficulty: 'easy' | 'medium' | 'hard';
  contingencyPlans: ContingencyPlan[];
}

export interface ContingencyPlan {
  condition: string;
  alternativeSteps: ActionStep[];
}

/**
 * Advanced Planning Engine
 * Generates multi-step plans with lookahead and contingencies
 */
export class PlanningEngine {
  constructor(private provider: AIProvider) {}

  /**
   * Generate a complete plan to achieve the goal
   */
  async generatePlan(
    goal: string,
    pageContext: PageContext,
    availableTools: string[]
  ): Promise<ExecutionPlan> {
    const prompt = this.buildPlanningPrompt(goal, pageContext, availableTools);

    try {
      const response = await aiChat(
        this.provider,
        '',
        [
          {
            role: 'system',
            content: 'You are an expert web automation planner. Create detailed, step-by-step plans in JSON format.'
          },
          { role: 'user', content: prompt }
        ],
        { title: pageContext.title || '', content: pageContext.content || '' }
      );

      return this.parsePlanResponse(response, goal);
    } catch (error) {
      console.error('Planning error:', error);
      return this.generateFallbackPlan(goal);
    }
  }

  /**
   * Adapt plan based on current progress and obstacles
   */
  async adaptPlan(
    originalPlan: ExecutionPlan,
    currentStep: number,
    obstacle: string,
    pageContext: PageContext
  ): Promise<ExecutionPlan> {
    const prompt = `You are adapting an execution plan due to an obstacle.

ORIGINAL GOAL: ${originalPlan.goal}
ORIGINAL STRATEGY: ${originalPlan.strategy}
CURRENT STEP: ${currentStep + 1} of ${originalPlan.totalSteps}
OBSTACLE ENCOUNTERED: ${obstacle}

COMPLETED STEPS:
${originalPlan.steps.slice(0, currentStep).map(s => `${s.step}. ${s.description}`).join('\n')}

REMAINING STEPS:
${originalPlan.steps.slice(currentStep).map(s => `${s.step}. ${s.description}`).join('\n')}

CURRENT PAGE:
- Title: ${pageContext.title}
- URL: ${pageContext.url}

Generate an adapted plan that works around the obstacle. Respond with JSON:
{
  "strategy": "updated strategy description",
  "steps": [
    {
      "step": 1,
      "tool": "tool_name",
      "args": {},
      "description": "what to do",
      "rationale": "why",
      "expectedResult": "outcome",
      "successCriteria": "how to verify success"
    },
    ...
  ],
  "estimatedDifficulty": "easy|medium|hard"
}`;

    try {
      const response = await aiChat(
        this.provider,
        '',
        [
          { role: 'system', content: 'You are a web automation expert. Respond with JSON only.' },
          { role: 'user', content: prompt }
        ],
        { title: pageContext.title || '', content: pageContext.content || '' }
      );

      const adaptedPlan = this.parsePlanResponse(response, originalPlan.goal);
      // Renumber steps starting from current position
      adaptedPlan.steps = adaptedPlan.steps.map((s, i) => ({
        ...s,
        step: currentStep + i + 1
      }));

      return adaptedPlan;
    } catch (error) {
      // Return simplified remaining steps
      return {
        ...originalPlan,
        steps: originalPlan.steps.slice(currentStep)
      };
    }
  }

  /**
   * Evaluate if plan should be re-planned
   */
  shouldReplan(
    plan: ExecutionPlan,
    currentStep: number,
    consecutiveFailures: number
  ): boolean {
    // Replan if:
    // 1. Multiple consecutive failures
    if (consecutiveFailures >= 2) return true;

    // 2. Stuck at the same step for too long
    // (This would need state tracking in the runtime)

    // 3. Reached a contingency condition
    // (Checked in runtime)

    return false;
  }

  /**
   * Build comprehensive planning prompt
   */
  private buildPlanningPrompt(
    goal: string,
    pageContext: PageContext,
    availableTools: string[]
  ): string {
    return `You are creating a detailed execution plan for web automation.

GOAL: ${goal}

CURRENT CONTEXT:
- URL: ${pageContext.url || 'Unknown'}
- Page Title: ${pageContext.title || 'Unknown'}

AVAILABLE TOOLS: ${availableTools.join(', ')}

TOOL DESCRIPTIONS:
- navigate: Go to a URL (use for "open X", "go to X", "visit X")
- find_text: Find and scroll to text on page
- click_text: Click element containing text
- type_text: Type into input field
- press_enter: Submit form or execute search
- scroll: Scroll page up or down
- wait_ms: Wait for page to load
- extract_links: Get page structure
- smart_click: Intelligently click elements
- smart_fill: Smart form filling
- detect_interactive: Scan page elements

IMPORTANT PATTERNS:
1. If goal is "open X" or "navigate to X" or "go to X" → use navigate tool with URL
2. If goal is "search for X" → use type_text + press_enter
3. If goal is "click X" → use click_text or smart_click
4. If goal is "fill X" → use type_text or smart_fill
5. Keep plans SHORT and DIRECT - avoid unnecessary analysis steps

EXAMPLES:
Goal: "open youtube"
Strategy: "Navigate directly to YouTube"
Steps: [{"step":1,"tool":"navigate","args":{"url":"https://youtube.com"},...}]

Goal: "search for cats"
Strategy: "Type query and submit"
Steps: [{"step":1,"tool":"type_text","args":{"text":"cats"},...}, {"step":2,"tool":"press_enter",...}]

Goal: "click login button"
Strategy: "Find and click login"
Steps: [{"step":1,"tool":"smart_click","args":{"target":"login"},...}]

Create a DIRECT, CONCISE plan (1-4 steps). Avoid over-planning.

Respond with ONLY valid JSON:
{
  "strategy": "direct approach in 1 sentence",
  "steps": [
    {
      "step": 1,
      "tool": "tool_name",
      "args": {"param": "value"},
      "description": "what to do",
      "rationale": "why",
      "expectedResult": "outcome",
      "successCriteria": "how to verify"
    }
  ],
  "estimatedDifficulty": "easy",
  "contingencyPlans": []
}`;
  }

  /**
   * Parse AI response into ExecutionPlan
   */
  private parsePlanResponse(response: string, goal: string): ExecutionPlan {
    try {
      // Clean up markdown code blocks
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      return {
        goal,
        strategy: parsed.strategy || 'Execute steps sequentially',
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        totalSteps: parsed.steps?.length || 0,
        estimatedDifficulty: parsed.estimatedDifficulty || 'medium',
        contingencyPlans: parsed.contingencyPlans || []
      };
    } catch (error) {
      console.error('Failed to parse plan:', error);
      return this.generateFallbackPlan(goal);
    }
  }

  /**
   * Generate a basic fallback plan
   */
  private generateFallbackPlan(goal: string): ExecutionPlan {
    const goalLower = goal.toLowerCase();

    // Detect navigation intent
    const navigationKeywords = ['open', 'go to', 'navigate', 'visit', 'load'];
    const isNavigation = navigationKeywords.some(kw => goalLower.includes(kw));

    if (isNavigation) {
      // Extract potential site name
      const words = goal.split(/\s+/);
      let siteName = words[words.length - 1]; // Last word is usually the site

      // Common site mappings
      const siteMap: Record<string, string> = {
        'youtube': 'https://youtube.com',
        'google': 'https://google.com',
        'facebook': 'https://facebook.com',
        'twitter': 'https://twitter.com',
        'amazon': 'https://amazon.com',
        'reddit': 'https://reddit.com',
        'wikipedia': 'https://wikipedia.org',
        'github': 'https://github.com',
        'linkedin': 'https://linkedin.com',
        'instagram': 'https://instagram.com'
      };

      const url = siteMap[siteName.toLowerCase()] || `https://${siteName}.com`;

      return {
        goal,
        strategy: `Navigate directly to ${siteName}`,
        steps: [
          {
            step: 1,
            tool: 'navigate',
            args: { url },
            description: `Open ${siteName}`,
            rationale: 'Direct navigation to target site',
            expectedResult: `${siteName} homepage loads`,
            successCriteria: 'Page title contains site name'
          }
        ],
        totalSteps: 1,
        estimatedDifficulty: 'easy',
        contingencyPlans: []
      };
    }

    // Detect search intent
    if (goalLower.includes('search')) {
      const searchQuery = goal.replace(/search\s+(for\s+)?/i, '').trim();
      return {
        goal,
        strategy: 'Type search query and submit',
        steps: [
          {
            step: 1,
            tool: 'type_text',
            args: { text: searchQuery, target: 'any' },
            description: 'Enter search query',
            rationale: 'Fill search input',
            expectedResult: 'Query entered',
            successCriteria: 'Input has text'
          },
          {
            step: 2,
            tool: 'press_enter',
            args: {},
            description: 'Submit search',
            rationale: 'Execute search',
            expectedResult: 'Results load',
            successCriteria: 'Results page shown'
          }
        ],
        totalSteps: 2,
        estimatedDifficulty: 'easy',
        contingencyPlans: []
      };
    }

    // Default: extract and analyze
    return {
      goal,
      strategy: 'Analyze page and locate target',
      steps: [
        {
          step: 1,
          tool: 'extract_links',
          args: {},
          description: 'Get page overview',
          rationale: 'Understand available actions',
          expectedResult: 'Links and headings extracted',
          successCriteria: 'Data retrieved'
        }
      ],
      totalSteps: 1,
      estimatedDifficulty: 'medium',
      contingencyPlans: []
    };
  }

  /**
   * Estimate progress toward goal (0-1)
   */
  estimateProgress(
    plan: ExecutionPlan,
    completedSteps: number,
    stepResults: Array<{ success: boolean }>
  ): number {
    if (plan.totalSteps === 0) return 0;

    const stepProgress = completedSteps / plan.totalSteps;
    const successRate = stepResults.filter(r => r.success).length / Math.max(stepResults.length, 1);

    // Weighted: 70% step completion, 30% success rate
    return stepProgress * 0.7 + successRate * 0.3;
  }

  /**
   * Simplify plan (remove redundant steps)
   */
  simplifyPlan(plan: ExecutionPlan): ExecutionPlan {
    // Remove consecutive wait steps
    const simplified = plan.steps.filter((step, i) => {
      if (step.tool === 'wait_ms' && i > 0 && plan.steps[i - 1].tool === 'wait_ms') {
        return false;
      }
      return true;
    });

    return {
      ...plan,
      steps: simplified.map((s, i) => ({ ...s, step: i + 1 })),
      totalSteps: simplified.length
    };
  }

  /**
   * Merge plans (combine multiple strategies)
   */
  mergePlans(plan1: ExecutionPlan, plan2: ExecutionPlan): ExecutionPlan {
    const mergedSteps = [...plan1.steps, ...plan2.steps].map((s, i) => ({
      ...s,
      step: i + 1
    }));

    return {
      goal: plan1.goal,
      strategy: `Combined: ${plan1.strategy} and ${plan2.strategy}`,
      steps: mergedSteps,
      totalSteps: mergedSteps.length,
      estimatedDifficulty: plan1.estimatedDifficulty === 'hard' || plan2.estimatedDifficulty === 'hard'
        ? 'hard'
        : 'medium',
      contingencyPlans: [...plan1.contingencyPlans, ...plan2.contingencyPlans]
    };
  }
}
