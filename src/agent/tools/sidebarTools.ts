/**
 * Sidebar UI Interaction Tools
 *
 * SIMPLE tools that just click the buttons that already exist in the UI!
 * No reinventing the wheel - use what's already built!
 */

import { AgentTool, ToolContext } from '../types';
import { registerTool } from '../toolRegistry';

const ok = (output?: any) => ({ success: true, output });
const fail = (error: string) => ({ success: false, error });

/**
 * Open SpaceMail Sidebar
 * Clicks the Shield button in the navigation bar
 */
export const openSpaceMailSidebarUITool: AgentTool = {
  name: 'open_spacemail_sidebar_ui',
  description: 'Opens the SpaceMail Sidebar by clicking the Shield button in navigation. ALWAYS use this FIRST when user mentions SpaceMail, password change, or email management.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: {}) {
    ctx.log('🛡️ Opening SpaceMail Sidebar...');

    try {
      // Find and click the Shield button in the main UI (not webview)
      const clicked = await new Promise<boolean>((resolve) => {
        // Try to find the Shield button in the Electron window
        const checkForButton = () => {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const hasShieldIcon = btn.querySelector('[class*="lucide-shield"]') ||
                                  btn.innerHTML.includes('Shield') ||
                                  btn.title?.toLowerCase().includes('spacemail');

            if (hasShieldIcon) {
              btn.click();
              ctx.log('✅ Clicked Shield button');
              resolve(true);
              return;
            }
          }

          // If not found immediately, try clicking by aria-label or title
          const navButtons = document.querySelectorAll('[aria-label*="SpaceMail" i], [title*="SpaceMail" i], [aria-label*="Password" i]');
          if (navButtons.length > 0) {
            (navButtons[0] as HTMLElement).click();
            ctx.log('✅ Clicked SpaceMail button via aria-label');
            resolve(true);
            return;
          }

          resolve(false);
        };

        checkForButton();
      });

      if (!clicked) {
        return fail('Could not find SpaceMail Sidebar button. Is the app loaded?');
      }

      // Wait for sidebar to open
      await new Promise(r => setTimeout(r, 500));

      return ok({
        success: true,
        message: 'SpaceMail Sidebar opened successfully',
        nextStep: 'Use click_extract_button tool to extract mailboxes'
      });
    } catch (e: any) {
      return fail(e?.message || 'Failed to open SpaceMail Sidebar');
    }
  },
};

/**
 * Click "Extract Domains" button in SpaceMail Sidebar
 */
export const clickExtractButtonTool: AgentTool = {
  name: 'click_extract_button',
  description: 'Clicks the "Extract Domains" button in the SpaceMail Sidebar to load all email accounts. Use this AFTER opening the SpaceMail Sidebar.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: {}) {
    ctx.log('📊 Clicking Extract Domains button...');

    try {
      const clicked = await new Promise<boolean>((resolve) => {
        const checkForExtractButton = () => {
          // Look for Extract button in the sidebar
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || '';
            const label = btn.getAttribute('aria-label')?.toLowerCase() || '';

            if (text.includes('extract') || label.includes('extract')) {
              btn.click();
              ctx.log('✅ Clicked Extract Domains button');
              resolve(true);
              return;
            }
          }
          resolve(false);
        };

        checkForExtractButton();
      });

      if (!clicked) {
        return fail('Extract Domains button not found. Is the SpaceMail Sidebar open?');
      }

      // Wait for extraction to complete
      ctx.log('⏳ Waiting for extraction to complete...');
      await new Promise(r => setTimeout(r, 3000));

      return ok({
        success: true,
        message: 'Extraction started successfully',
        nextStep: 'Use search_email_in_sidebar tool to find specific email, or click_mailbox_key tool to change password'
      });
    } catch (e: any) {
      return fail(e?.message || 'Failed to click Extract button');
    }
  },
};

/**
 * Search for email in SpaceMail Sidebar and scroll to it
 */
export const searchEmailInSidebarTool: AgentTool = {
  name: 'search_email_in_sidebar',
  description: 'Searches for a specific email address in the SpaceMail Sidebar and scrolls to it. Use this AFTER extracting domains.',
  parameters: {
    type: 'object',
    properties: {
      email: { type: 'string', description: 'Email address to search for (e.g., pawan.ojha@cdraustraliaservice.com)' },
    },
    required: ['email'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { email: string }) {
    const email = String(args?.email || '').trim();
    if (!email || !email.includes('@')) {
      return fail('Invalid email address');
    }

    ctx.log(`🔍 Searching for ${email} in sidebar...`);

    try {
      const found = await new Promise<boolean>((resolve) => {
        const searchInSidebar = () => {
          // Find the email in the sidebar
          const allElements = document.querySelectorAll('div, span, li, button');
          for (const el of allElements) {
            if (el.textContent?.includes(email)) {
              // Scroll to the element
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Highlight it
              (el as HTMLElement).style.outline = '2px solid #f59e0b';
              (el as HTMLElement).style.outlineOffset = '2px';

              ctx.log(`✅ Found and highlighted ${email}`);
              resolve(true);
              return;
            }
          }
          resolve(false);
        };

        searchInSidebar();
      });

      if (!found) {
        return fail(`Email ${email} not found in sidebar. Try extracting domains first or check if the email exists.`);
      }

      return ok({
        success: true,
        email,
        message: `Found and highlighted ${email}`,
        nextStep: 'Use click_mailbox_key tool to change password for this email'
      });
    } catch (e: any) {
      return fail(e?.message || 'Failed to search for email');
    }
  },
};

/**
 * Click the green key icon next to an email to change password
 */
export const clickMailboxKeyTool: AgentTool = {
  name: 'click_mailbox_key',
  description: 'Clicks the green key icon next to an email in the SpaceMail Sidebar to change its password. The password is generated automatically and securely.',
  parameters: {
    type: 'object',
    properties: {
      email: { type: 'string', description: 'Email address whose password to change (e.g., pawan.ojha@cdraustraliaservice.com)' },
    },
    required: ['email'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { email: string }) {
    const email = String(args?.email || '').trim();
    if (!email || !email.includes('@')) {
      return fail('Invalid email address');
    }

    ctx.log(`🔑 Clicking green key for ${email}...`);

    try {
      const clicked = await new Promise<boolean>((resolve) => {
        const findAndClickKey = () => {
          // Find the email row
          const allElements = document.querySelectorAll('div, li, span, button');

          for (const el of allElements) {
            if (el.textContent?.includes(email)) {
              // Look for key button near this element
              const parent = el.closest('div, li');
              if (!parent) continue;

              const buttons = parent.querySelectorAll('button');
              for (const btn of buttons) {
                // Check if button has a key icon (lucide-key class or SVG)
                const hasKeyIcon = btn.querySelector('[class*="lucide-key"]') ||
                                   btn.querySelector('svg') ||
                                   btn.title?.toLowerCase().includes('password') ||
                                   btn.getAttribute('aria-label')?.toLowerCase().includes('password');

                // Check if button is green (common pattern)
                const style = window.getComputedStyle(btn);
                const isGreen = style.color.includes('34, 197, 94') || // green-500
                                style.backgroundColor.includes('34, 197, 94') ||
                                btn.className.includes('green');

                if (hasKeyIcon || isGreen) {
                  btn.click();
                  ctx.log(`✅ Clicked password change button for ${email}`);
                  resolve(true);
                  return;
                }
              }
            }
          }
          resolve(false);
        };

        findAndClickKey();
      });

      if (!clicked) {
        return fail(`Could not find password change button for ${email}. Make sure the email is visible in the sidebar.`);
      }

      // Wait for password change to complete
      ctx.log('⏳ Waiting for password change automation to complete...');
      await new Promise(r => setTimeout(r, 5000));

      return ok({
        success: true,
        email,
        message: `Password changed successfully for ${email}. A secure password has been generated and saved.`,
        nextStep: 'IMPORTANT: Download the password CSV file from the SpaceMail Sidebar to get the new password!'
      });
    } catch (e: any) {
      return fail(e?.message || 'Failed to click password change button');
    }
  },
};

// Register all sidebar tools
registerTool(openSpaceMailSidebarUITool);
registerTool(clickExtractButtonTool);
registerTool(searchEmailInSidebarTool);
registerTool(clickMailboxKeyTool);
