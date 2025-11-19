import { AgentTool, ToolContext, PageContext } from './types';
import { chat as aiChat, AIProvider } from '../services/aiProvider';

export interface ActionCandidate {
  tool: string;
  args: Record<string, any>;
  reasoning: string;
  confidence: number; // 0-1
  expectedOutcome: string;
  risks: string[];
  alternatives: string[];
}

export interface BestActionResult {
  selectedAction: ActionCandidate;
  allCandidates: ActionCandidate[];
  pageAnalysis: PageAnalysis;
  reasoning: string;
}

export interface PageAnalysis {
  pageType: string; // 'search', 'form', 'article', 'navigation', 'unknown'
  keyElements: ElementInfo[];
  currentGoalProgress: number; // 0-1
  detectedIntents: string[];
  obstacles: string[];
}

export interface ElementInfo {
  type: 'button' | 'link' | 'input' | 'heading' | 'text';
  text: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  importance: number; // 0-1
}

/**
 * Advanced Best Action Selector
 * This is the brain of the super-agentic system.
 * It analyzes the page, generates multiple candidate actions,
 * evaluates them with confidence scores, and selects the optimal action.
 */
export class BestActionSelector {
  constructor(
    private provider: AIProvider,
    private ctx: ToolContext,
    private page: PageContext
  ) {}

  /**
   * Main method: Analyze page and select the best single action
   */
  async selectBestAction(
    goal: string,
    previousActions: string[],
    failedAttempts: string[]
  ): Promise<BestActionResult> {
    // Step 1: Analyze the current page deeply
    const pageAnalysis = await this.analyzePage();

    // Step 2: Generate multiple candidate actions
    const candidates = await this.generateActionCandidates(
      goal,
      pageAnalysis,
      previousActions,
      failedAttempts
    );

    // Step 3: Evaluate and score each candidate
    const scoredCandidates = await this.scoreActionCandidates(
      candidates,
      goal,
      pageAnalysis
    );

    // Step 4: Select the best action (highest confidence)
    const selectedAction = this.selectTopAction(scoredCandidates);

    return {
      selectedAction,
      allCandidates: scoredCandidates,
      pageAnalysis,
      reasoning: this.generateSelectionReasoning(selectedAction, scoredCandidates)
    };
  }

  /**
   * Deep page analysis to understand context
   */
  private async analyzePage(): Promise<PageAnalysis> {
    try {
      const analysis = await this.ctx.webview.executeJavaScript(`
        (function() {
          // Analyze page structure and extract key elements
          const elements = [];

          // Get all interactive elements
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
          const links = Array.from(document.querySelectorAll('a[href]'));
          const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
          const headings = Array.from(document.querySelectorAll('h1, h2, h3'));

          // Helper to check visibility
          function isVisible(el) {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null;
          }

          // Helper to calculate importance (viewport position, size, etc)
          function calculateImportance(el) {
            if (!isVisible(el)) return 0;
            const rect = el.getBoundingClientRect();
            const inViewport = rect.top >= 0 && rect.top <= window.innerHeight;
            const size = rect.width * rect.height;
            const sizeScore = Math.min(size / 10000, 1);
            const positionScore = inViewport ? 1 : 0.3;
            return sizeScore * 0.4 + positionScore * 0.6;
          }

          // Process buttons
          buttons.slice(0, 20).forEach(btn => {
            const text = (btn.textContent || btn.value || '').trim();
            if (text) {
              elements.push({
                type: 'button',
                text: text.substring(0, 100),
                attributes: {
                  class: btn.className,
                  id: btn.id,
                  type: btn.type || 'button'
                },
                isVisible: isVisible(btn),
                importance: calculateImportance(btn)
              });
            }
          });

          // Process links
          links.slice(0, 20).forEach(link => {
            const text = (link.textContent || '').trim();
            if (text) {
              elements.push({
                type: 'link',
                text: text.substring(0, 100),
                attributes: {
                  href: link.href,
                  class: link.className,
                  id: link.id
                },
                isVisible: isVisible(link),
                importance: calculateImportance(link)
              });
            }
          });

          // Process inputs
          inputs.slice(0, 15).forEach(input => {
            elements.push({
              type: 'input',
              text: input.placeholder || input.name || input.id || '',
              attributes: {
                type: input.type || 'text',
                name: input.name,
                id: input.id,
                placeholder: input.placeholder || ''
              },
              isVisible: isVisible(input),
              importance: calculateImportance(input)
            });
          });

          // Process headings
          headings.slice(0, 10).forEach(h => {
            const text = (h.textContent || '').trim();
            if (text) {
              elements.push({
                type: 'heading',
                text: text.substring(0, 100),
                attributes: { level: h.tagName },
                isVisible: isVisible(h),
                importance: calculateImportance(h) * 0.7
              });
            }
          });

          // Detect page type
          let pageType = 'unknown';
          const hasSearchInput = inputs.some(i =>
            i.type === 'search' ||
            (i.placeholder && i.placeholder.toLowerCase().includes('search'))
          );
          const hasLoginInputs = inputs.some(i => i.type === 'password');
          const hasForm = document.querySelector('form') !== null;
          const hasArticle = document.querySelector('article, main') !== null;

          if (hasSearchInput) pageType = 'search';
          else if (hasLoginInputs) pageType = 'form-login';
          else if (hasForm) pageType = 'form';
          else if (hasArticle) pageType = 'article';
          else if (links.length > 20) pageType = 'navigation';

          // Detect potential obstacles
          const obstacles = [];
          if (document.querySelector('.modal, .popup, [role="dialog"]')) {
            obstacles.push('Modal or popup detected');
          }
          if (document.querySelector('.loading, .spinner')) {
            obstacles.push('Loading indicator present');
          }

          return {
            pageType,
            keyElements: elements.sort((a, b) => b.importance - a.importance).slice(0, 30),
            obstacles,
            detectedIntents: []
          };
        })()
      `);

      return {
        ...analysis,
        currentGoalProgress: 0,
        detectedIntents: this.detectIntents(analysis)
      };
    } catch (error) {
      this.ctx.log(`Page analysis error: ${error}`);
      return {
        pageType: 'unknown',
        keyElements: [],
        currentGoalProgress: 0,
        detectedIntents: [],
        obstacles: ['Failed to analyze page']
      };
    }
  }

  /**
   * Detect user intents based on page structure
   */
  private detectIntents(analysis: any): string[] {
    const intents: string[] = [];

    if (analysis.pageType === 'search') {
      intents.push('user_wants_to_search');
    }
    if (analysis.pageType === 'form-login') {
      intents.push('authentication_required');
    }
    if (analysis.keyElements.some((e: ElementInfo) =>
      e.type === 'button' && e.text.toLowerCase().includes('sign'))) {
      intents.push('registration_or_login_available');
    }

    return intents;
  }

  /**
   * Generate multiple candidate actions using AI
   */
  private async generateActionCandidates(
    goal: string,
    pageAnalysis: PageAnalysis,
    previousActions: string[],
    failedAttempts: string[]
  ): Promise<ActionCandidate[]> {
    const { listTools: getTools } = await import('./toolRegistry');
    const tools = getTools();
    const toolDescriptions = tools.map(t => `${t.name}: ${t.description}`).join('\n');

    const prompt = `You are an expert web automation strategist. Analyze this situation and propose 3-5 different action candidates to progress toward the goal.

GOAL: ${goal}

PAGE CONTEXT:
- Type: ${pageAnalysis.pageType}
- URL: ${this.page.url}
- Title: ${this.page.title}
- Key Elements: ${JSON.stringify(pageAnalysis.keyElements.slice(0, 15), null, 2)}
- Obstacles: ${pageAnalysis.obstacles.join(', ') || 'None'}

HISTORY:
- Previous actions: ${previousActions.join(' → ') || 'None yet'}
- Failed attempts: ${failedAttempts.join(', ') || 'None'}

AVAILABLE TOOLS:
${toolDescriptions}

Generate 3-5 diverse action candidates. For each, provide:
1. tool: name of the tool
2. args: arguments for the tool
3. reasoning: why this action makes sense
4. expectedOutcome: what should happen
5. risks: potential issues
6. alternatives: what else could work

Respond with ONLY a JSON array of candidates:
[
  {
    "tool": "tool_name",
    "args": {...},
    "reasoning": "why this is good",
    "expectedOutcome": "what happens next",
    "risks": ["risk1", "risk2"],
    "alternatives": ["alt1", "alt2"]
  },
  ...
]`;

    try {
      const response = await aiChat(
        this.provider,
        '',
        [
          { role: 'system', content: 'You are a web automation expert. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        { title: this.page.title || '', content: this.page.content || '' }
      );

      const candidates = this.parseJSONResponse(response);
      return candidates.map((c: any) => ({
        ...c,
        confidence: 0 // Will be scored in next step
      }));
    } catch (error) {
      this.ctx.log(`Failed to generate candidates: ${error}`);
      // Fallback: generate basic candidates
      return this.generateFallbackCandidates(goal, pageAnalysis);
    }
  }

  /**
   * Score each candidate action based on multiple factors
   */
  private async scoreActionCandidates(
    candidates: ActionCandidate[],
    goal: string,
    pageAnalysis: PageAnalysis
  ): Promise<ActionCandidate[]> {
    return candidates.map(candidate => {
      let confidence = 0.5; // Base confidence

      // Factor 1: Relevance to goal
      const goalWords = goal.toLowerCase().split(/\s+/);
      const reasoningWords = candidate.reasoning.toLowerCase();
      const goalRelevance = goalWords.filter(w => reasoningWords.includes(w)).length / goalWords.length;
      confidence += goalRelevance * 0.2;

      // Factor 2: Element availability
      if (candidate.tool === 'click_text' || candidate.tool === 'find_text') {
        const targetText = (candidate.args.text || '').toLowerCase();
        const hasElement = pageAnalysis.keyElements.some(
          el => el.text.toLowerCase().includes(targetText)
        );
        confidence += hasElement ? 0.2 : -0.3;
      }

      // Factor 3: Risk assessment
      confidence -= candidate.risks.length * 0.05;

      // Factor 4: Page type alignment
      if (pageAnalysis.pageType === 'search' && candidate.tool === 'type_text') {
        confidence += 0.15;
      }
      if (pageAnalysis.pageType === 'form' &&
          (candidate.tool === 'type_text' || candidate.tool === 'press_enter')) {
        confidence += 0.15;
      }

      // Factor 5: Has alternatives (shows thoughtfulness)
      confidence += candidate.alternatives.length * 0.03;

      // Clamp confidence to [0, 1]
      confidence = Math.max(0, Math.min(1, confidence));

      return { ...candidate, confidence };
    });
  }

  /**
   * Select the top action from scored candidates
   */
  private selectTopAction(candidates: ActionCandidate[]): ActionCandidate {
    // Sort by confidence descending
    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
    return sorted[0] || this.getEmergencyAction();
  }

  /**
   * Generate reasoning for the selection
   */
  private generateSelectionReasoning(
    selected: ActionCandidate,
    allCandidates: ActionCandidate[]
  ): string {
    const others = allCandidates.filter(c => c !== selected).slice(0, 2);
    let reasoning = `Selected: ${selected.tool} with confidence ${(selected.confidence * 100).toFixed(0)}%\n`;
    reasoning += `Reason: ${selected.reasoning}\n`;

    if (others.length > 0) {
      reasoning += `\nAlternatives considered:\n`;
      others.forEach(alt => {
        reasoning += `- ${alt.tool} (${(alt.confidence * 100).toFixed(0)}%): ${alt.reasoning.substring(0, 60)}...\n`;
      });
    }

    return reasoning;
  }

  /**
   * Parse JSON from AI response (handle markdown code blocks)
   */
  private parseJSONResponse(response: string): any[] {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  /**
   * Fallback candidates when AI generation fails
   */
  private generateFallbackCandidates(
    goal: string,
    pageAnalysis: PageAnalysis
  ): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];

    // Suggest extracting links to understand page
    candidates.push({
      tool: 'extract_links',
      args: {},
      reasoning: 'Extract links to understand page structure',
      confidence: 0.6,
      expectedOutcome: 'Get overview of available links',
      risks: [],
      alternatives: ['scroll', 'find_text']
    });

    // If there are visible buttons, suggest clicking first one
    const firstButton = pageAnalysis.keyElements.find(e => e.type === 'button' && e.isVisible);
    if (firstButton) {
      candidates.push({
        tool: 'click_text',
        args: { text: firstButton.text },
        reasoning: `Click prominent button: "${firstButton.text}"`,
        confidence: 0.5,
        expectedOutcome: 'Navigate or trigger action',
        risks: ['May not be the right button'],
        alternatives: ['find_text', 'scroll']
      });
    }

    return candidates;
  }

  /**
   * Emergency action when all else fails
   */
  private getEmergencyAction(): ActionCandidate {
    return {
      tool: 'extract_links',
      args: {},
      reasoning: 'Emergency fallback: extract page structure',
      confidence: 0.3,
      expectedOutcome: 'Get basic page information',
      risks: ['May not progress toward goal'],
      alternatives: []
    };
  }
}
