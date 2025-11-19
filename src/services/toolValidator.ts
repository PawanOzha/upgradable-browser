/**
 * Step-by-Step Tool Execution Validator
 * Ensures tools execute properly with retry logic and validation
 */

export interface ToolResult {
  success: boolean;
  found?: boolean;
  data?: any;
  error?: string;
  message?: string;
}

export interface ValidationConfig {
  maxRetries?: number;
  retryDelay?: number;
  requireSuccess?: boolean;
  requireFound?: boolean;
  onRetry?: (attempt: number, error: string) => void;
  onSuccess?: (result: ToolResult) => void;
  onFailure?: (result: ToolResult) => void;
}

const DEFAULT_CONFIG: Required<ValidationConfig> = {
  maxRetries: 3,
  retryDelay: 1000,
  requireSuccess: true,
  requireFound: false,
  onRetry: () => {},
  onSuccess: () => {},
  onFailure: () => {},
};

/**
 * Tool execution validator with retry logic
 */
export class ToolValidator {
  /**
   * Execute a tool with validation and retry logic
   */
  static async execute<T = any>(
    toolName: string,
    toolFunction: () => Promise<ToolResult>,
    config: ValidationConfig = {}
  ): Promise<ToolResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    let lastResult: ToolResult | null = null;
    let attempt = 0;

    while (attempt < cfg.maxRetries) {
      attempt++;

      try {
        console.log(`[ToolValidator] Executing ${toolName} (attempt ${attempt}/${cfg.maxRetries})`);

        // Execute the tool
        const result = await toolFunction();
        lastResult = result;

        // Check if result meets requirements
        const meetsRequirements = this.validateResult(result, cfg);

        if (meetsRequirements) {
          console.log(`[ToolValidator] ${toolName} succeeded on attempt ${attempt}`);
          cfg.onSuccess(result);
          return result;
        }

        // Result doesn't meet requirements - retry if attempts remaining
        if (attempt < cfg.maxRetries) {
          const error = result.error || 'Requirements not met';
          console.log(`[ToolValidator] ${toolName} failed: ${error}, retrying...`);
          cfg.onRetry(attempt, error);

          // Wait before retry
          await this.delay(cfg.retryDelay);
        }
      } catch (error) {
        console.error(`[ToolValidator] ${toolName} threw error:`, error);
        lastResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };

        if (attempt < cfg.maxRetries) {
          cfg.onRetry(attempt, lastResult.error!);
          await this.delay(cfg.retryDelay);
        }
      }
    }

    // All retries exhausted
    console.error(`[ToolValidator] ${toolName} failed after ${cfg.maxRetries} attempts`);
    cfg.onFailure(lastResult || { success: false, error: 'Unknown error' });

    return lastResult || { success: false, error: 'Tool execution failed' };
  }

  /**
   * Validate tool result against requirements
   */
  private static validateResult(result: ToolResult, config: Required<ValidationConfig>): boolean {
    if (config.requireSuccess && !result.success) {
      return false;
    }

    if (config.requireFound && !result.found) {
      return false;
    }

    return true;
  }

  /**
   * Delay helper
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute multiple tools in sequence with validation
   */
  static async executeSequence(
    steps: Array<{
      name: string;
      fn: () => Promise<ToolResult>;
      config?: ValidationConfig;
    }>,
    onStepComplete?: (stepIndex: number, stepName: string, result: ToolResult) => void
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[ToolValidator] Executing sequence step ${i + 1}/${steps.length}: ${step.name}`);

      const result = await this.execute(step.name, step.fn, step.config);
      results.push(result);

      if (onStepComplete) {
        onStepComplete(i, step.name, result);
      }

      // If step failed and required success, stop sequence
      if (!result.success && step.config?.requireSuccess !== false) {
        console.error(`[ToolValidator] Sequence stopped at step ${i + 1}: ${step.name} failed`);
        break;
      }
    }

    return results;
  }
}

/**
 * Common tool wrappers with built-in validation
 */
export class ValidatedTools {
  /**
   * Find text with retry logic
   */
  static async findText(
    text: string,
    webview: any,
    options: {
      caseInsensitive?: boolean;
      partialMatch?: boolean;
      maxRetries?: number;
      scrollBetweenRetries?: boolean;
    } = {}
  ): Promise<ToolResult> {
    return ToolValidator.execute(
      `findText("${text}")`,
      async () => {
        try {
          const script = `
            (function() {
              const searchText = "${text.replace(/"/g, '\\"')}";
              const caseInsensitive = ${options.caseInsensitive || false};
              const partialMatch = ${options.partialMatch || false};

              const elements = document.querySelectorAll('*');
              for (const el of elements) {
                const textContent = el.textContent || '';
                const searchIn = caseInsensitive ? textContent.toLowerCase() : textContent;
                const searchFor = caseInsensitive ? searchText.toLowerCase() : searchText;

                if (partialMatch ? searchIn.includes(searchFor) : searchIn === searchFor) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  return {
                    success: true,
                    found: true,
                    data: {
                      text: textContent.trim(),
                      tagName: el.tagName
                    }
                  };
                }
              }

              return {
                success: false,
                found: false,
                error: 'Text not found'
              };
            })()
          `;

          const result = await webview.executeJavaScript(script);
          return result;
        } catch (error) {
          return {
            success: false,
            found: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      {
        maxRetries: options.maxRetries || 3,
        requireFound: true,
        onRetry: async (attempt) => {
          if (options.scrollBetweenRetries) {
            // Scroll down between retries
            try {
              await webview.executeJavaScript('window.scrollBy(0, 300)');
            } catch (e) {
              // Ignore scroll errors
            }
          }
        },
      }
    );
  }

  /**
   * Click element with text
   */
  static async clickText(
    text: string,
    webview: any,
    options: {
      caseInsensitive?: boolean;
      maxRetries?: number;
    } = {}
  ): Promise<ToolResult> {
    return ToolValidator.execute(
      `clickText("${text}")`,
      async () => {
        try {
          const script = `
            (function() {
              const searchText = "${text.replace(/"/g, '\\"')}";
              const caseInsensitive = ${options.caseInsensitive || false};

              const elements = document.querySelectorAll('*');
              for (const el of elements) {
                const textContent = (el.textContent || '').trim();
                const searchIn = caseInsensitive ? textContent.toLowerCase() : textContent;
                const searchFor = caseInsensitive ? searchText.toLowerCase() : searchText;

                if (searchIn.includes(searchFor)) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => el.click(), 500);
                  return {
                    success: true,
                    found: true,
                    message: 'Element clicked'
                  };
                }
              }

              return {
                success: false,
                found: false,
                error: 'Element not found'
              };
            })()
          `;

          const result = await webview.executeJavaScript(script);
          return result;
        } catch (error) {
          return {
            success: false,
            found: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      {
        maxRetries: options.maxRetries || 3,
        requireSuccess: true,
      }
    );
  }

  /**
   * Scroll with validation
   */
  static async scroll(
    direction: 'up' | 'down',
    webview: any,
    amount: number = 300
  ): Promise<ToolResult> {
    return ToolValidator.execute(
      `scroll(${direction})`,
      async () => {
        try {
          const delta = direction === 'down' ? amount : -amount;
          await webview.executeJavaScript(`window.scrollBy(0, ${delta})`);

          return {
            success: true,
            message: `Scrolled ${direction} by ${amount}px`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      {
        maxRetries: 1, // No retry for scroll
        requireSuccess: true,
      }
    );
  }
}
