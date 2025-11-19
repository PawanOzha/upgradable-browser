import { AgentTool, ToolContext } from '../types';
import { registerTool } from '../toolRegistry';

const ok = (output?: any) => ({ success: true, output });
const fail = (error: string) => ({ success: false, error });

/**
 * Smart Click - Intelligently finds and clicks elements using multiple strategies
 */
export const smartClickTool: AgentTool = {
  name: 'smart_click',
  description: 'Intelligently find and click an element using text, role, or visual cues. More reliable than click_text.',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'What to click (text content, aria-label, or description)' },
      strategy: {
        type: 'string',
        enum: ['auto', 'text', 'semantic', 'visual'],
        description: 'Click strategy (auto tries all)'
      }
    },
    required: ['target'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { target: string; strategy?: string }) {
    const target = String(args?.target || '').trim();
    const strategy = args?.strategy || 'auto';

    if (!target) return fail('Missing target');

    ctx.log(`Smart clicking: "${target}" (strategy: ${strategy})`);

    try {
      const result = await ctx.webview.executeJavaScript(`
        (async function() {
          const target = ${JSON.stringify(target)}.toLowerCase();
          const strategy = ${JSON.stringify(strategy)};

          // Helper: Check if element is clickable
          function isClickable(el) {
            if (!el) return false;
            const tagName = el.tagName;
            const role = el.getAttribute('role');
            const style = window.getComputedStyle(el);

            return (
              tagName === 'A' || tagName === 'BUTTON' ||
              tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') ||
              role === 'button' || role === 'link' || role === 'tab' ||
              style.cursor === 'pointer' ||
              el.onclick !== null
            );
          }

          // Helper: Check visibility
          function isVisible(el) {
            if (!el || !el.offsetParent) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   parseFloat(style.opacity) > 0;
          }

          // Helper: Get element score (how good a match it is)
          function scoreElement(el, searchText) {
            let score = 0;

            // Text content match
            const text = (el.textContent || '').toLowerCase().trim();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const title = (el.getAttribute('title') || '').toLowerCase();
            const value = (el.value || '').toLowerCase();

            if (text === searchText) score += 10;
            else if (text.includes(searchText)) score += 5;
            else if (ariaLabel.includes(searchText)) score += 4;
            else if (title.includes(searchText)) score += 3;
            else if (value.includes(searchText)) score += 3;

            // Clickability
            if (isClickable(el)) score += 3;

            // Visibility and position
            if (isVisible(el)) {
              score += 2;
              const rect = el.getBoundingClientRect();
              // Prefer elements in viewport
              if (rect.top >= 0 && rect.top < window.innerHeight) score += 2;
              // Prefer larger elements
              const size = rect.width * rect.height;
              score += Math.min(size / 5000, 2);
            }

            // Semantic importance
            if (el.tagName === 'BUTTON') score += 1;
            if (el.classList.contains('primary') || el.classList.contains('btn-primary')) score += 1;

            return score;
          }

          // Strategy 1: Text-based search
          async function textStrategy() {
            const allElements = Array.from(document.querySelectorAll('*'));
            const candidates = [];

            for (const el of allElements) {
              const score = scoreElement(el, target);
              if (score > 3) {
                candidates.push({ el, score });
              }
            }

            candidates.sort((a, b) => b.score - a.score);
            return candidates[0]?.el;
          }

          // Strategy 2: Semantic search (ARIA, roles)
          async function semanticStrategy() {
            const selectors = [
              \`[aria-label*="\${target}" i]\`,
              \`[title*="\${target}" i]\`,
              \`button:contains("\${target}")\`,
              \`a:contains("\${target}")\`
            ];

            for (const selector of selectors) {
              try {
                const el = document.querySelector(selector);
                if (el && isVisible(el)) return el;
              } catch {}
            }

            // Fallback: manual role search
            const roleElements = document.querySelectorAll('[role="button"], [role="link"], [role="tab"]');
            for (const el of roleElements) {
              const text = (el.textContent || '').toLowerCase();
              const label = (el.getAttribute('aria-label') || '').toLowerCase();
              if (text.includes(target) || label.includes(target)) {
                if (isVisible(el)) return el;
              }
            }

            return null;
          }

          // Strategy 3: Visual prominence
          async function visualStrategy() {
            const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
            const visible = buttons.filter(isVisible);

            // Score by size, position, and styling
            const scored = visible.map(el => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              const area = rect.width * rect.height;

              let score = 0;
              score += Math.min(area / 3000, 5); // Size
              score += rect.top < window.innerHeight ? 3 : 0; // In viewport

              // Check for prominent styling
              if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') score += 2;
              if (el.classList.contains('primary') || el.classList.contains('cta')) score += 3;

              // Check text match
              const text = (el.textContent || '').toLowerCase();
              if (text.includes(target)) score += 10;

              return { el, score };
            });

            scored.sort((a, b) => b.score - a.score);
            return scored[0]?.el;
          }

          // Execute strategy
          let element = null;

          if (strategy === 'auto') {
            element = await textStrategy();
            if (!element) element = await semanticStrategy();
            if (!element) element = await visualStrategy();
          } else if (strategy === 'text') {
            element = await textStrategy();
          } else if (strategy === 'semantic') {
            element = await semanticStrategy();
          } else if (strategy === 'visual') {
            element = await visualStrategy();
          }

          if (!element) {
            return { success: false, error: 'No matching element found' };
          }

          // Scroll to element
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(r => setTimeout(r, 300));

          // Click
          element.click();

          return {
            success: true,
            elementInfo: {
              tag: element.tagName,
              text: (element.textContent || '').substring(0, 50),
              classes: element.className
            }
          };
        })()
      `);

      if (result?.success) {
        return ok(result.elementInfo);
      }
      return fail(result?.error || 'Click failed');
    } catch (e: any) {
      return fail(e?.message || 'Smart click failed');
    }
  },
};

/**
 * Smart Fill - Intelligently fills forms by understanding field context
 */
export const smartFillTool: AgentTool = {
  name: 'smart_fill',
  description: 'Intelligently fill a form field by understanding its purpose (email, name, address, etc.)',
  parameters: {
    type: 'object',
    properties: {
      fieldType: {
        type: 'string',
        enum: ['email', 'name', 'firstname', 'lastname', 'username', 'password', 'phone', 'address', 'city', 'zip', 'auto'],
        description: 'Type of field to fill (auto detects)'
      },
      value: { type: 'string', description: 'Value to fill' }
    },
    required: ['value'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { fieldType?: string; value: string }) {
    const value = String(args?.value || '');
    const fieldType = args?.fieldType || 'auto';

    if (!value) return fail('Missing value');

    ctx.log(`Smart filling ${fieldType} field with value`);

    try {
      const result = await ctx.webview.executeJavaScript(`
        (async function() {
          const fieldType = ${JSON.stringify(fieldType)};
          const value = ${JSON.stringify(value)};

          // Helper: Get field relevance score
          function scoreField(input, targetType) {
            let score = 0;
            const type = (input.type || 'text').toLowerCase();
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const label = findLabel(input);

            // Type matching
            if (targetType === 'email' && type === 'email') score += 10;
            if (targetType === 'password' && type === 'password') score += 10;
            if (targetType === 'phone' && type === 'tel') score += 10;

            // Name/ID matching
            const combinedText = name + id + placeholder + label;

            if (targetType === 'email' && combinedText.includes('email')) score += 8;
            if (targetType === 'username' && (combinedText.includes('user') || combinedText.includes('login'))) score += 8;
            if (targetType === 'firstname' && combinedText.includes('first')) score += 8;
            if (targetType === 'lastname' && combinedText.includes('last')) score += 8;
            if (targetType === 'name' && combinedText.includes('name') && !combinedText.includes('user')) score += 8;
            if (targetType === 'phone' && (combinedText.includes('phone') || combinedText.includes('tel'))) score += 8;
            if (targetType === 'address' && combinedText.includes('address')) score += 8;
            if (targetType === 'city' && combinedText.includes('city')) score += 8;
            if (targetType === 'zip' && (combinedText.includes('zip') || combinedText.includes('postal'))) score += 8;

            // Visibility
            const style = window.getComputedStyle(input);
            if (style.display !== 'none' && style.visibility !== 'hidden') score += 3;

            return score;
          }

          function findLabel(input) {
            // Try label association
            if (input.id) {
              const label = document.querySelector(\`label[for="\${input.id}"]\`);
              if (label) return (label.textContent || '').toLowerCase();
            }
            // Try parent label
            const parent = input.closest('label');
            if (parent) return (parent.textContent || '').toLowerCase();
            return '';
          }

          // Find all input fields
          const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));

          let bestInput = null;
          let bestScore = 0;

          if (fieldType === 'auto') {
            // Auto-detect: find first visible empty input
            bestInput = inputs.find(input => {
              const style = window.getComputedStyle(input);
              return style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     !input.value;
            });
          } else {
            // Find best matching field
            for (const input of inputs) {
              const score = scoreField(input, fieldType);
              if (score > bestScore) {
                bestScore = score;
                bestInput = input;
              }
            }
          }

          if (!bestInput) {
            return { success: false, error: 'No matching field found' };
          }

          // Fill the field
          bestInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(r => setTimeout(r, 200));

          bestInput.focus();
          bestInput.click();
          bestInput.value = value;

          // Trigger events
          bestInput.dispatchEvent(new Event('input', { bubbles: true }));
          bestInput.dispatchEvent(new Event('change', { bubbles: true }));

          return {
            success: true,
            field: {
              type: bestInput.type,
              name: bestInput.name || bestInput.id || 'unknown'
            }
          };
        })()
      `);

      if (result?.success) {
        return ok(result.field);
      }
      return fail(result?.error || 'Fill failed');
    } catch (e: any) {
      return fail(e?.message || 'Smart fill failed');
    }
  },
};

/**
 * Detect Interactive Elements - Find all actionable elements on the page
 */
export const detectInteractiveTool: AgentTool = {
  name: 'detect_interactive',
  description: 'Detect all interactive elements on the page (buttons, links, inputs) with their visual properties',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  async execute(ctx: ToolContext) {
    ctx.log('Detecting interactive elements...');

    try {
      const elements = await ctx.webview.executeJavaScript(`
        (function() {
          function isVisible(el) {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   parseFloat(style.opacity) > 0 &&
                   el.offsetParent !== null;
          }

          function getVisualImportance(el) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);

            let score = 0;

            // Size
            const area = rect.width * rect.height;
            score += Math.min(area / 5000, 3);

            // Position (viewport)
            if (rect.top >= 0 && rect.top < window.innerHeight) score += 3;

            // Color contrast
            if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') score += 2;

            // Classes suggesting importance
            const classes = el.className.toLowerCase();
            if (classes.includes('primary') || classes.includes('cta')) score += 2;
            if (classes.includes('danger') || classes.includes('warning')) score += 1;

            return score;
          }

          const interactive = [];

          // Buttons
          document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(el => {
            if (isVisible(el)) {
              interactive.push({
                type: 'button',
                text: (el.textContent || el.value || '').trim().substring(0, 50),
                importance: getVisualImportance(el),
                attributes: {
                  id: el.id,
                  classes: el.className
                }
              });
            }
          });

          // Links
          document.querySelectorAll('a[href]').forEach(el => {
            if (isVisible(el)) {
              interactive.push({
                type: 'link',
                text: (el.textContent || '').trim().substring(0, 50),
                href: el.href,
                importance: getVisualImportance(el),
                attributes: {
                  id: el.id,
                  classes: el.className
                }
              });
            }
          });

          // Inputs
          document.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(el => {
            if (isVisible(el)) {
              interactive.push({
                type: 'input',
                inputType: el.type || 'text',
                placeholder: el.placeholder || '',
                importance: getVisualImportance(el),
                attributes: {
                  name: el.name,
                  id: el.id
                }
              });
            }
          });

          // Sort by importance
          interactive.sort((a, b) => b.importance - a.importance);

          return interactive.slice(0, 20); // Top 20
        })()
      `);

      return ok({ elements, count: elements.length });
    } catch (e: any) {
      return fail(e?.message || 'Detection failed');
    }
  },
};

// Register smart tools
registerTool(smartClickTool);
registerTool(smartFillTool);
registerTool(detectInteractiveTool);
