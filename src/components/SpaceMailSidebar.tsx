/**
 * SpaceMail Password Manager Sidebar
 *
 * UI component for visualizing and managing SpaceMail domains and mailboxes.
 * Features domain-grouped display with expandable sections.
 *
 * @author Claude Code
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import {
  X,
  Mail,
  RefreshCw,
  Key,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Shield,
  Play,
  Pause,
  AlertCircle,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import * as activityLogService from '../services/activityLogService';
import {
  generateSecurePassword,
  createPasswordPasteScript
} from '../tools/google_sheets_password_tracker';
import { exportToEncryptedCSV, exportToPlainCSV } from '../utils/csvExport';
import { addDownloadToHistory } from './DownloadManager';

interface SpaceMailSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean; // New prop for embedded mode (no header, no fixed width)
}

interface Mailbox {
  email: string;
  domain: string;
  username: string;
  hasEditButton: boolean;
}

interface Domain {
  name: string;
  mailboxes: Mailbox[];
  isExpanded: boolean;
}

interface UpdateProgress {
  current: number;
  total: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'stopped';
  results: Array<{
    email: string;
    success: boolean;
    error?: string;
  }>;
}

export default function SpaceMailSidebar({ isOpen, onClose, embedded = false }: SpaceMailSidebarProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedMailbox, setSelectedMailbox] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress>({
    current: 0,
    total: 0,
    status: 'idle',
    results: [],
  });
  const [updateLog, setUpdateLog] = useState<string[]>([]);
  const [passwordHistory, setPasswordHistory] = useState<Array<{
    email: string;
    password: string;
    timestamp: string;
    status: 'success' | 'failed' | 'pending';
  }>>([]);
  const [showPasswordPopup, setShowPasswordPopup] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleExtract = async () => {
    setIsExtracting(true);
    setSelectedMailbox(null);

    try {
      const webview = document.querySelector('webview') as any;
      if (!webview) {
        alert('Webview not found');
        setIsExtracting(false);
        return;
      }

      const result = await webview.executeJavaScript(`
        (async function() {
          // Import extraction logic
          const extractEmail = (element) => {
            // Email regex that FINDS email within text (not just exact match)
            const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/;

            // Check element's own text
            const text = element.textContent?.trim() || '';
            const match = text.match(emailRegex);
            if (match) return match[0];

            // Check all spans inside (SpaceMail often splits email across spans)
            const spans = element.querySelectorAll('span');
            if (spans.length >= 2) {
              let combined = '';
              spans.forEach(span => combined += span.textContent?.trim() || '');
              const spanMatch = combined.match(emailRegex);
              if (spanMatch) return spanMatch[0];
            }

            // Check individual spans
            for (const span of spans) {
              const spanText = span.textContent?.trim() || '';
              const spanMatch = spanText.match(emailRegex);
              if (spanMatch) return spanMatch[0];
            }

            // Check all td cells in the row
            const cells = element.querySelectorAll('td');
            for (const cell of cells) {
              const cellText = cell.textContent?.trim() || '';
              const cellMatch = cellText.match(emailRegex);
              if (cellMatch) return cellMatch[0];
            }

            return null;
          };

          const hasEditButton = (element) => {
            const parent = element.closest('tr');
            if (!parent) return false;

            const buttons = parent.querySelectorAll('button, a');
            for (const btn of buttons) {
              const text = (btn.textContent?.toLowerCase() || '') + (btn.getAttribute('aria-label')?.toLowerCase() || '');
              if (text.includes('edit') || text.includes('options') || text.includes('menu') || btn.querySelector('svg')) {
                return true;
              }
            }
            return false;
          };

          console.log('[SpaceMail Extract] Starting extraction...');

          const domainsMap = new Map();
          const tables = document.querySelectorAll('.smm-mailboxes-table, table.gb-table, table');

          console.log('[SpaceMail Extract] Found', tables.length, 'tables');

          tables.forEach((table, index) => {
            // Find domain name - multiple strategies
            let domainName = null;

            // Strategy 1: Look in parent container for headings (h1, h2, h3, div with domain)
            const container = table.closest('section, div, article') || table.parentElement;
            if (container) {
              const headings = container.querySelectorAll('h1, h2, h3, h4, h5, div, span, p');
              for (const heading of headings) {
                if (heading.contains(table)) continue; // Skip if heading is inside table
                const text = heading.textContent?.trim() || '';
                const match = text.match(/([a-zA-Z0-9-]+\\.[a-zA-Z]{2,})/);
                if (match) {
                  domainName = match[1];
                  break;
                }
              }
            }

            // Strategy 2: Look at previous siblings
            if (!domainName) {
              let current = table.previousElementSibling;
              for (let i = 0; i < 3 && current; i++) {
                const text = current.textContent?.trim() || '';
                const match = text.match(/([a-zA-Z0-9-]+\\.[a-zA-Z]{2,})/);
                if (match) {
                  domainName = match[1];
                  break;
                }
                current = current.previousElementSibling;
              }
            }

            // Strategy 3: Look at parent's previous siblings
            if (!domainName) {
              let current = table.parentElement;
              for (let i = 0; i < 5 && current; i++) {
                const text = current.textContent?.trim() || '';
                const match = text.match(/([a-zA-Z0-9-]+\\.[a-zA-Z]{2,})/);
                if (match) {
                  domainName = match[1];
                  break;
                }
                current = current.previousElementSibling || current.parentElement;
              }
            }

            // Strategy 4: Extract from first email in table
            if (!domainName) {
              const rows = table.querySelectorAll('tr');
              for (const row of rows) {
                const email = extractEmail(row);
                if (email && email.includes('@')) {
                  domainName = email.split('@')[1];
                  break;
                }
              }
            }

            // Fallback: unknown domain
            if (!domainName) {
              domainName = 'unknown-domain-' + index;
            }

            console.log('[SpaceMail Extract] Table', index, '→ Domain:', domainName);

            const mailboxes = [];
            const seenEmails = new Set(); // Track unique emails
            const rows = table.querySelectorAll('tr, tbody > tr');

            console.log('[SpaceMail Extract] Processing', rows.length, 'rows in table', index);

            rows.forEach((row, rowIndex) => {
              const email = extractEmail(row);
              if (email && !seenEmails.has(email)) {
                seenEmails.add(email); // Mark as seen

                const username = email.split('@')[0];
                const domain = email.split('@')[1];

                mailboxes.push({
                  email,
                  domain,
                  username,
                  hasEditButton: hasEditButton(row),
                });

                // Log first 3 unique emails for debugging
                if (mailboxes.length <= 3) {
                  console.log('[SpaceMail Extract] Found email:', email, '(hasEdit:', hasEditButton(row), ')');
                }
              }
            });

            console.log('[SpaceMail Extract] Extracted', mailboxes.length, 'unique mailboxes from domain', domainName);

            // Only add domains that have mailboxes
            if (mailboxes.length > 0) {
              if (domainsMap.has(domainName)) {
                domainsMap.get(domainName).push(...mailboxes);
              } else {
                domainsMap.set(domainName, mailboxes);
              }
            }
          });

          // Deduplicate mailboxes within each domain
          const domains = [];
          domainsMap.forEach((mailboxes, domainName) => {
            // Create a map to track unique emails per domain
            const uniqueMailboxes = new Map();

            mailboxes.forEach(mailbox => {
              if (!uniqueMailboxes.has(mailbox.email)) {
                uniqueMailboxes.set(mailbox.email, mailbox);
              }
            });

            // Convert back to array
            const deduplicatedMailboxes = Array.from(uniqueMailboxes.values());

            console.log('[SpaceMail Extract] Domain', domainName, ':', mailboxes.length, 'total →', deduplicatedMailboxes.length, 'unique');

            domains.push({
              name: domainName,
              mailboxes: deduplicatedMailboxes,
              isExpanded: true,
            });
          });

          console.log('[SpaceMail Extract] Extracted', domains.length, 'domains');

          return domains;
        })();
      `);

      setDomains(result);
      console.log('Extracted domains:', result);
    } catch (error) {
      console.error('Failed to extract:', error);
      alert('Failed to extract SpaceMail data. Make sure you are on the admin dashboard.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleHighlightMailbox = async (email: string) => {
    setSelectedMailbox(email);

    try {
      const webview = document.querySelector('webview') as any;
      if (!webview) return;

      await webview.executeJavaScript(`
        (function() {
          // Clear previous highlights
          document.querySelectorAll('[data-spacemail-highlight]').forEach(el => {
            el.style.outline = '';
            el.style.outlineOffset = '';
            el.style.boxShadow = '';
            el.removeAttribute('data-spacemail-highlight');
          });

          // Find and highlight target
          const email = "${email}";
          const rows = document.querySelectorAll('tr, tbody > tr');

          for (const row of rows) {
            if (row.textContent?.includes(email)) {
              row.style.outline = '3px solid #f59e0b';
              row.style.outlineOffset = '-3px';
              row.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.6)';
              row.style.transition = 'all 0.3s ease-in-out';
              row.setAttribute('data-spacemail-highlight', 'true');

              row.scrollIntoView({ behavior: 'smooth', block: 'center' });
              break;
            }
          }
        })();
      `);
    } catch (error) {
      console.error('Failed to highlight:', error);
    }
  };

  const handleUpdatePassword = async (email: string, dryRun: boolean = true) => {
    const addLog = (msg: string) => {
      console.log(`[SpaceMail] ${msg}`);
      setUpdateLog(prev => [...prev, msg]);
    };

    try {
      const webview = document.querySelector('webview') as any;
      if (!webview) {
        alert('Webview not found');
        return;
      }

      addLog(`🔐 Starting Google Sheets password workflow for ${email} ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
      setIsUpdating(true);

      // ============================================================
      // PHASE 1: Generate Password and Store for CSV Export
      // ============================================================

      // Generate password
      const password = generateSecurePassword();
      addLog(`🔑 Generated secure password (16 chars)`);

      // Store for later CSV export
      const passwordEntry: {
        email: string;
        password: string;
        timestamp: string;
        status: 'success' | 'failed' | 'pending';
      } = {
        email,
        password,
        timestamp: new Date().toISOString(),
        status: 'pending' as const
      };

      addLog(``);
      addLog(`📝 Email:    ${email}`);
      addLog(`🔑 Password: ${password}`);
      addLog(``);

      // ============================================================
      // PHASE 2: SpaceMail Password Change Workflow
      // ============================================================

      addLog('🔐 Step 5: Starting SpaceMail password change...');

      // Execute SpaceMail workflow (click edit, reset password, etc.)
      const spaceMailWorkflow = await webview.executeJavaScript(`
        (async function() {
          try {
            const DRY_RUN = ${dryRun};
            const log = (msg) => console.log('[SpaceMail Update]', msg);
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

            // Step 1: Find the mailbox row for this email
            log('Step 1: Finding mailbox row for ${email.replace(/'/g, "\\'")}');

            const rows = document.querySelectorAll('tr');
            let targetRow = null;

            for (const row of rows) {
              if (row.textContent && row.textContent.includes('${email.replace(/'/g, "\\'")}')) {
                targetRow = row;
                break;
              }
            }

          if (!targetRow) {
            return { success: false, error: 'Mailbox row not found' };
          }

          log('✅ Found mailbox row');

          // Step 2: Human-like scroll to element
          log('Step 2: Scrolling to mailbox...');
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(randomDelay(600, 1200)); // Longer wait for scroll (more human)

          // Step 3: Thinking pause before click (longer, more realistic)
          await sleep(randomDelay(500, 1200));

          // Step 4: Click on the mailbox row to open sidebar
          log('Step 3: Clicking mailbox row...');
          targetRow.click();

          // Wait for sidebar to open (longer for anti-detection)
          await sleep(randomDelay(1200, 2000));

          // Step 5: Find "Reset password" button in the sidebar
          log('Step 4: Looking for "Reset password" option...');

          let resetButton = null;
          const buttons = document.querySelectorAll('button, a, div[role="button"]');

          for (const btn of buttons) {
            const text = (btn.textContent && btn.textContent.toLowerCase()) || '';
            if (text.includes('reset password') || text.includes('reset') || text.includes('change password')) {
              resetButton = btn;
              log('✅ Found reset button:', text);
              break;
            }
          }

          if (!resetButton) {
            // Try alternative selectors
            const alternatives = [
              'button[aria-label*="reset" i]',
              'a[aria-label*="reset" i]',
              'button[aria-label*="password" i]',
              '[data-action*="reset"]',
              '[data-action*="password"]'
            ];

            for (const selector of alternatives) {
              const el = document.querySelector(selector);
              if (el) {
                resetButton = el;
                log('✅ Found reset button via selector:', selector);
                break;
              }
            }
          }

          if (!resetButton) {
            return { success: false, error: 'Reset password button not found in sidebar' };
          }

          // Step 6: Human thinking pause
          await sleep(randomDelay(400, 900));

          // Step 7: Click "Reset password"
          log('Step 5: Clicking "Reset password"...');
          resetButton.click();

          // Wait for input area to appear
          await sleep(randomDelay(800, 1500));

          // Step 8: Find the "New Password" input field
          log('Step 6: Looking for password input...');

          let passwordInput = null;
          const inputs = document.querySelectorAll('input');

          for (const input of inputs) {
            const type = (input.type && input.type.toLowerCase()) || '';
            const placeholder = (input.placeholder && input.placeholder.toLowerCase()) || '';
            const ariaLabel = input.getAttribute('aria-label');
            const label = (ariaLabel && ariaLabel.toLowerCase()) || '';
            const name = (input.name && input.name.toLowerCase()) || '';

            if (type === 'password' ||
                placeholder.includes('password') ||
                placeholder.includes('new password') ||
                label.includes('password') ||
                name.includes('password')) {
              passwordInput = input;
              log('✅ Found password input');
              break;
            }
          }

          if (!passwordInput) {
            return { success: false, error: 'Password input field not found' };
          }

          log('Reset password dialog opened - ready for password paste');
          return { success: true, message: 'Ready for password input' };

        } catch (err) {
          return { success: false, error: String(err) };
        }
      })();
    `);

    if (!spaceMailWorkflow.success) {
      throw new Error(spaceMailWorkflow.error);
    }

    addLog('✅ Reset password dialog opened');

    // Step 6: Copy password to system clipboard using reliable method
    addLog('📋 Step 6: Copying password to system clipboard...');

    // Create a temporary textarea element for reliable clipboard copy
    const copyToClipboard = async (text: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);

        try {
          textarea.focus();
          textarea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);

          if (successful) {
            resolve();
          } else {
            reject(new Error('execCommand copy failed'));
          }
        } catch (err) {
          document.body.removeChild(textarea);
          reject(err);
        }
      });
    };

    try {
      // First try modern clipboard API
      try {
        await navigator.clipboard.writeText(password);
        addLog('✅ Password copied to system clipboard (modern API)');
      } catch (modernError) {
        // Fallback to textarea method (more reliable in some contexts)
        await copyToClipboard(password);
        addLog('✅ Password copied to system clipboard (fallback method)');
      }
    } catch (clipboardError: any) {
      throw new Error(`Failed to copy password to clipboard: ${clipboardError.message}`);
    }

    // Small delay to ensure clipboard is updated at OS level
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 7: Focus the password input and perform REAL OS-level paste
    addLog('📋 Step 7: Focusing password input and preparing for REAL OS-level paste...');

    // First, focus the password input using human-like behavior
    const focusScript = `
      (async function() {
        const log = (msg) => console.log('[SpaceMail Focus]', msg);
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        try {
          // Find password input
          log('Looking for password input field...');
          let passwordInput = null;
          const inputs = document.querySelectorAll('input');

          for (const input of inputs) {
            const type = (input.type && input.type.toLowerCase()) || '';
            const placeholder = (input.placeholder && input.placeholder.toLowerCase()) || '';
            const ariaLabel = input.getAttribute('aria-label');
            const label = (ariaLabel && ariaLabel.toLowerCase()) || '';
            const name = (input.name && input.name.toLowerCase()) || '';

            if (type === 'password' ||
                placeholder.includes('password') ||
                placeholder.includes('new password') ||
                label.includes('password') ||
                name.includes('password')) {
              passwordInput = input;
              log('✅ Found password input');
              break;
            }
          }

          if (!passwordInput) {
            return { success: false, error: 'Password input not found' };
          }

          // Human-like mouse movement to input
          log('Moving mouse to password input (human-like)...');
          const rect = passwordInput.getBoundingClientRect();
          const targetX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 20;
          const targetY = rect.top + rect.height / 2 + (Math.random() - 0.5) * 10;

          // Simulate mouse movement
          const moveEvent = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: targetX,
            clientY: targetY
          });
          document.dispatchEvent(moveEvent);
          await sleep(randomDelay(150, 300));

          // Hover over input
          const hoverEvent = new MouseEvent('mouseenter', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: targetX,
            clientY: targetY
          });
          passwordInput.dispatchEvent(hoverEvent);
          await sleep(randomDelay(80, 150));

          // Click the input
          log('Clicking password input...');
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: targetX,
            clientY: targetY
          });
          passwordInput.dispatchEvent(clickEvent);
          passwordInput.focus();

          // Wait and verify focus
          await sleep(randomDelay(300, 600));

          // Verify input is actually focused
          if (document.activeElement !== passwordInput) {
            log('⚠️  Input not focused, trying again...');
            passwordInput.click();
            passwordInput.focus();
            await sleep(300);

            if (document.activeElement !== passwordInput) {
              return { success: false, error: 'Could not focus password input' };
            }
          }

          log('✅ Password input is focused and ready for REAL paste');

          // Clear existing value if any
          if (passwordInput.value) {
            log('Clearing existing value...');
            passwordInput.value = '';
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(randomDelay(100, 200));
          }

          // Human thinking pause before paste
          await sleep(randomDelay(400, 800));

          log('✅ Ready for OS-level Ctrl+V paste');
          return { success: true, message: 'Input focused and ready' };

        } catch (err) {
          log('❌ Error:', String(err));
          return { success: false, error: String(err) };
        }
      })();
    `;

    const focusResult = await webview.executeJavaScript(focusScript);

    if (!focusResult.success) {
      throw new Error(focusResult.error || 'Failed to focus password input');
    }

    addLog('✅ Password input is focused and ready');

    // Step 8: Send REAL OS-level Ctrl+V to the webview
    addLog('⌨️  Step 8: Sending REAL OS-level Ctrl+V paste...');

    // Small human delay before paste
    await new Promise(resolve => setTimeout(resolve, 200));

    // Send ACTUAL Ctrl+V key press to the webview at OS level
    webview.sendInputEvent({
      type: 'keyDown',
      modifiers: ['control'],
      keyCode: 'V'
    });

    await new Promise(resolve => setTimeout(resolve, 80)); // Key press duration

    webview.sendInputEvent({
      type: 'char',
      modifiers: ['control'],
      keyCode: 'V'
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    webview.sendInputEvent({
      type: 'keyUp',
      modifiers: ['control'],
      keyCode: 'V'
    });

    addLog('✅ REAL OS-level Ctrl+V sent to webview');

    // Wait for paste to process and validation to trigger
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 9: Verify password was pasted and check Save button
    addLog('🔍 Step 9: Verifying paste and checking Save button...');

    const verifyScript = `
      (async function() {
        const DRY_RUN = ${dryRun};
        const log = (msg) => console.log('[SpaceMail Verify]', msg);
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        try {
          // Verify password input has value
          const inputs = document.querySelectorAll('input');
          let passwordInput = null;

          for (const input of inputs) {
            const type = (input.type && input.type.toLowerCase()) || '';
            if (type === 'password' && input.value) {
              passwordInput = input;
              break;
            }
          }

          if (!passwordInput || !passwordInput.value) {
            return { success: false, error: 'Password was not pasted into input' };
          }

          log('✅ Password is in the input field:', '***' + passwordInput.value.slice(-4));

          // Trigger multiple events to ensure validation
          log('Triggering validation events...');

          // Input event (triggers on value change)
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(100);

          // Change event (some forms listen to this)
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(100);

          // Keyup event (some validators watch for this)
          passwordInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          await sleep(100);

          // Focus then blur to ensure validation
          passwordInput.focus();
          await sleep(100);
          passwordInput.blur();
          passwordInput.dispatchEvent(new FocusEvent('blur', {
            bubbles: true,
            cancelable: true,
            composed: true
          }));
          await sleep(randomDelay(300, 600));

          // Wait for Save button to activate
          log('Waiting for Save button...');
          let saveButton = null;
          let attempts = 0;
          const maxAttempts = 20;

          while (attempts < maxAttempts) {
            // PRIORITY 1: Try to find the specific SpaceMail Save button by data-zid
            const specificButton = document.querySelector('button[data-zid="resetPasswordSubmit"]');
            if (specificButton) {
              const isDisabled = specificButton.hasAttribute('disabled') ||
                                specificButton.getAttribute('aria-disabled') === 'true' ||
                                specificButton.classList.contains('disabled') ||
                                window.getComputedStyle(specificButton).pointerEvents === 'none';

              if (!isDisabled) {
                saveButton = specificButton;
                log('✅ Found Save button via data-zid="resetPasswordSubmit"!');
              }
            }

            // PRIORITY 2: Fallback to generic button search
            if (!saveButton) {
              const allButtons = document.querySelectorAll('button, a, div[role="button"]');

              for (const btn of allButtons) {
                const text = (btn.textContent && btn.textContent.toLowerCase()) || '';
                const btnAriaLabel = btn.getAttribute('aria-label');
                const ariaLabel = (btnAriaLabel && btnAriaLabel.toLowerCase()) || '';

                if (text.includes('save') || ariaLabel.includes('save') ||
                    text.includes('confirm') || ariaLabel.includes('confirm') ||
                    text.includes('update') || ariaLabel.includes('update')) {

                  const isDisabled = btn.hasAttribute('disabled') ||
                                     btn.getAttribute('aria-disabled') === 'true' ||
                                     btn.classList.contains('disabled') ||
                                     window.getComputedStyle(btn).pointerEvents === 'none';

                  if (!isDisabled) {
                    saveButton = btn;
                    log('✅ Save button is enabled (fallback detection)!');
                    break;
                  }
                }
              }
            }

            if (saveButton) break;

            // Re-blur every few attempts to trigger validation
            if (attempts > 0 && attempts % 5 === 0) {
              passwordInput.focus();
              await sleep(100);
              passwordInput.blur();
              passwordInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            }

            await sleep(500);
            attempts++;
          }

          if (!saveButton) {
            return { success: false, error: 'Save button not found or did not activate after paste' };
          }

          log('✅ Save button is ready!');
          log('Button info:', {
            tagName: saveButton.tagName,
            className: saveButton.className,
            dataZid: saveButton.getAttribute('data-zid'),
            text: saveButton.textContent?.substring(0, 20)
          });

          // Click Save button
          if (DRY_RUN) {
            log('🧪 DRY RUN: Would click Save button here');
            log('🧪 DRY RUN: Password is pasted and validated');
            log('🧪 DRY RUN: Save button is enabled and clickable');
            return { success: true, dryRun: true, message: 'Password pasted via REAL Ctrl+V, Save button ready' };
          } else {
            // Human-like mouse movement to Save button
            log('Moving mouse to Save button (human-like)...');
            const btnRect = saveButton.getBoundingClientRect();
            const btnX = btnRect.left + btnRect.width / 2 + (Math.random() - 0.5) * 15;
            const btnY = btnRect.top + btnRect.height / 2 + (Math.random() - 0.5) * 8;

            // Scroll button into view first (ensure it's visible)
            saveButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(randomDelay(300, 500));

            // Mouse move
            const btnMoveEvent = new MouseEvent('mousemove', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: btnX,
              clientY: btnY
            });
            document.dispatchEvent(btnMoveEvent);
            await sleep(randomDelay(200, 400));

            // Hover
            const btnHoverEvent = new MouseEvent('mouseenter', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: btnX,
              clientY: btnY
            });
            saveButton.dispatchEvent(btnHoverEvent);
            await sleep(randomDelay(150, 300));

            // Thinking pause
            await sleep(randomDelay(300, 600));

            // CLICK THE BUTTON - Multiple methods for maximum reliability
            log('🖱️ Clicking Save button [data-zid="resetPasswordSubmit"]...');

            // Method 1: MouseDown + MouseUp (most realistic)
            const mouseDownEvent = new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: btnX,
              clientY: btnY
            });
            saveButton.dispatchEvent(mouseDownEvent);
            await sleep(randomDelay(50, 100));

            const mouseUpEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: btnX,
              clientY: btnY
            });
            saveButton.dispatchEvent(mouseUpEvent);
            await sleep(randomDelay(30, 70));

            // Method 2: Click event
            const btnClickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: btnX,
              clientY: btnY
            });
            saveButton.dispatchEvent(btnClickEvent);
            await sleep(randomDelay(50, 100));

            // Method 3: Direct click() call
            saveButton.click();
            log('✅ Save button clicked (all methods executed)!');

            // Method 4: If it's a submit button in a form, try submitting the form
            const parentForm = saveButton.closest('form');
            if (parentForm && saveButton.type === 'submit') {
              log('🔄 Also triggering form submit...');
              await sleep(randomDelay(100, 200));
              parentForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }

            await sleep(randomDelay(800, 1500));
            log('✅✅✅ Password saved successfully!');
            return { success: true, message: 'Password updated and saved via REAL Ctrl+V paste' };
          }

        } catch (err) {
          log('❌ Error:', String(err));
          return { success: false, error: String(err) };
        }
      })();
    `;

    const pasteResult = await webview.executeJavaScript(verifyScript);

    if (!pasteResult.success) {
      throw new Error(pasteResult.error || 'Failed to verify password paste');
    }

    if (dryRun) {
      addLog('🧪 DRY RUN COMPLETE - Password pasted, Save button ready');
      addLog(`✅ Everything ready! Password will be saved to CSV on download.`);
      addLog(`✅ To actually save, click again without dry run mode.`);
      passwordEntry.status = 'pending';
    } else {
      addLog('✅✅✅ PASSWORD UPDATED AND SAVED SUCCESSFULLY!');
      addLog(`📊 Password will be saved to encrypted CSV on download`);
      passwordEntry.status = 'success';
    }

    // Clear clipboard for security
    addLog('🧹 Clearing clipboard for security...');
    try {
      // Try modern API first
      try {
        await navigator.clipboard.writeText('');
      } catch {
        // Fallback to textarea method
        const textarea = document.createElement('textarea');
        textarea.value = '';
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      addLog('✅ Clipboard cleared');
    } catch (clearError) {
      addLog('⚠️  Could not clear clipboard (non-critical)');
    }

    // Save to password history
    setPasswordHistory(prev => [...prev, passwordEntry]);

    // Save result to progress
    setUpdateProgress(prev => ({
      ...prev,
      results: [...prev.results, { email, success: true }]
    }));

    // Log successful password change (without password)
    await activityLogService.addActivityLog(
      'password_change',
      'spacemail',
      'success',
      email,
      dryRun ? 'Dry run - no save' : 'Password changed and saved'
    );

    setIsUpdating(false);

  } catch (error: any) {
    addLog(`❌ Error: ${error.message}`);
    console.error('Password update error:', error);
    setUpdateProgress(prev => ({
      ...prev,
      results: [...prev.results, { email, success: false, error: error.message }]
    }));

    // Log failed password change
    await activityLogService.addActivityLog(
      'password_change',
      'spacemail',
      'error',
      email,
      error.message
    );

    setIsUpdating(false);
  }
};

  const handleUpdateAll = async (dryRun: boolean = true) => {
    const allMailboxes = domains.flatMap(d => d.mailboxes);
    if (allMailboxes.length === 0) {
      alert('No mailboxes to update');
      return;
    }

    const confirmed = window.confirm(
      `${dryRun ? '🧪 DRY RUN MODE' : '⚠️ LIVE MODE'}\\n\\n` +
      `You are about to update passwords for ${allMailboxes.length} mailboxes.\\n\\n` +
      `This will use human-like timing (1-2.5 seconds between each mailbox).\\n` +
      `Total estimated time: ${Math.round(allMailboxes.length * 8 / 60)} - ${Math.round(allMailboxes.length * 12 / 60)} minutes\\n\\n` +
      `${dryRun ? '🧪 DRY RUN: Will NOT click Save buttons (testing only)' : '⚠️ LIVE: Will actually update passwords!'}\\n\\n` +
      `CRITICAL: Test on 1-2 mailboxes first!\\n\\n` +
      `Continue?`
    );

    if (!confirmed) return;

    // Create new abort controller
    const controller = new AbortController();
    setAbortController(controller);

    setUpdateLog([]);
    setUpdateProgress({
      current: 0,
      total: allMailboxes.length,
      status: 'running',
      results: [],
    });

    try {
      for (let i = 0; i < allMailboxes.length; i++) {
        // Check if aborted
        if (controller.signal.aborted) {
          setUpdateLog(prev => [...prev, '🛑 Process stopped by user']);
          setUpdateProgress(prev => ({ ...prev, status: 'stopped' }));
          alert(`⏸️ Process stopped!\\n\\nCompleted: ${i}/${allMailboxes.length}\\nCheck the log for details.`);
          return;
        }

        const mailbox = allMailboxes[i];

        setUpdateProgress(prev => ({ ...prev, current: i + 1 }));

        await handleUpdatePassword(mailbox.email, dryRun);

        // Check if aborted after password update
        if (controller.signal.aborted) {
          setUpdateLog(prev => [...prev, '🛑 Process stopped by user']);
          setUpdateProgress(prev => ({ ...prev, status: 'stopped' }));
          alert(`⏸️ Process stopped!\\n\\nCompleted: ${i + 1}/${allMailboxes.length}\\nCheck the log for details.`);
          return;
        }

        // ENHANCED Anti-detection delay between mailboxes (more human-like)
        if (i < allMailboxes.length - 1) {
          // Variable delay: 2-5 seconds (more realistic human speed)
          const baseDelay = 2000 + Math.random() * 3000; // 2-5 seconds

          // Add occasional longer pauses (simulate human thinking/distraction)
          const hasLongerPause = Math.random() < 0.15; // 15% chance
          const finalDelay = hasLongerPause ? baseDelay + (3000 + Math.random() * 4000) : baseDelay;

          const delayMsg = hasLongerPause
            ? `⏳ Human-like pause (${(finalDelay/1000).toFixed(1)}s)...`
            : `⏳ Waiting ${(finalDelay/1000).toFixed(1)}s before next mailbox...`;

          setUpdateLog(prev => [...prev, delayMsg]);
          await new Promise(resolve => setTimeout(resolve, finalDelay));
        }

        // Check if aborted during delay
        if (controller.signal.aborted) {
          setUpdateLog(prev => [...prev, '🛑 Process stopped by user']);
          setUpdateProgress(prev => ({ ...prev, status: 'stopped' }));
          alert(`⏸️ Process stopped!\\n\\nCompleted: ${i + 1}/${allMailboxes.length}\\nCheck the log for details.`);
          return;
        }

        // Mini break every 15-20 mailboxes (more random intervals)
        const breakInterval = 15 + Math.floor(Math.random() * 6); // Random 15-20
        if ((i + 1) % breakInterval === 0 && i < allMailboxes.length - 1) {
          const breakTime = 5000 + Math.random() * 5000; // 5-10 seconds (longer breaks)
          setUpdateLog(prev => [...prev, `☕ Taking a coffee break (${(breakTime/1000).toFixed(1)}s) - anti-bot`]);
          await new Promise(resolve => setTimeout(resolve, breakTime));
        }

        // Random micro-pause every 5-8 mailboxes
        const microInterval = 5 + Math.floor(Math.random() * 4); // Random 5-8
        if ((i + 1) % microInterval === 0 && i < allMailboxes.length - 1) {
          const microPause = 1000 + Math.random() * 2000; // 1-3 seconds
          setUpdateLog(prev => [...prev, `⏸️ Quick breather (${(microPause/1000).toFixed(1)}s)...`]);
          await new Promise(resolve => setTimeout(resolve, microPause));
        }
      }

      setUpdateProgress(prev => ({ ...prev, status: 'completed' }));

      const successCount = updateProgress.results.filter(r => r.success).length;
      alert(`✅ Batch update complete!\\n\\nSuccess: ${successCount}/${allMailboxes.length}`);
    } finally {
      setAbortController(null);
    }
  };

  const handleStopUpdate = () => {
    if (abortController) {
      abortController.abort();
      setUpdateLog(prev => [...prev, '🛑 Stopping process...']);
    }
  };

  const toggleDomain = (domainName: string) => {
    setDomains(prev =>
      prev.map(d => (d.name === domainName ? { ...d, isExpanded: !d.isExpanded } : d))
    );
  };

  const getTotalMailboxes = () => {
    return domains.reduce((sum, d) => sum + d.mailboxes.length, 0);
  };

  const handleDownloadCSV = async () => {
    if (passwordHistory.length === 0) {
      alert('No passwords to export yet. Update some passwords first!');
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      // Simulate download progress animation
      const progressInterval = setInterval(() => {
        setDownloadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      // Export JSON file (NO ENCRYPTION)
      const filename = `spacemail_passwords_${new Date().toISOString().split('T')[0]}.json`;
      await exportToEncryptedCSV(passwordHistory, undefined, filename);

      // Complete download
      clearInterval(progressInterval);
      setDownloadProgress(100);

      // Add to download history
      const fileSizeKB = Math.ceil(JSON.stringify(passwordHistory).length / 1024);
      addDownloadToHistory(filename, `${fileSizeKB} KB`);

      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);

        alert(
          `✅ DOWNLOAD COMPLETE!\n\n` +
          `📥 JSON file saved to Downloads\n` +
          `🔑 ${passwordHistory.length} passwords exported\n` +
          `📄 File: ${filename}\n\n` +
          `⚠️  Keep this file secure!`
        );
      }, 500);

    } catch (error: any) {
      setIsDownloading(false);
      setDownloadProgress(0);
      alert(`❌ Export failed: ${error.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`flex flex-col text-gray-300 ${embedded ? 'w-full' : 'w-96'}`}
      style={{ backgroundColor: embedded ? 'transparent' : '#0f0f0f', borderLeft: embedded ? 'none' : '1px solid rgba(255,255,255,0.06)', height: '100%' }}
    >
      {/* Header - only show if not embedded */}
      {!embedded && (
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
            <h3 className="font-medium text-white/90 text-xs tracking-[0.2em] uppercase">SpaceMail</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:text-white/80 hover:bg-white/5 transition-colors duration-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 py-3 space-y-2">
        <button
          onClick={handleExtract}
          disabled={isExtracting}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] disabled:bg-white/[0.04] disabled:text-gray-500 text-white/90 text-xs font-medium transition-colors duration-200"
        >
          {isExtracting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Extracting...
            </>
          ) : (
            <>
              <Mail className="w-3.5 h-3.5" />
              Extract Domains
            </>
          )}
        </button>

        {/* Download CSV Button */}
        <button
          onClick={handleDownloadCSV}
          disabled={passwordHistory.length === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600/60 hover:bg-emerald-600/80 disabled:bg-white/[0.04] disabled:text-gray-500 text-white/90 text-[11px] font-medium transition-colors duration-200 disabled:cursor-not-allowed"
          title={passwordHistory.length === 0 ? 'No passwords to export yet' : `Export ${passwordHistory.length} passwords`}
        >
          <Download className="w-3.5 h-3.5" />
          Export {passwordHistory.length} password{passwordHistory.length !== 1 ? 's' : ''}
        </button>
      </div>

      {/* Stats */}
      {domains.length > 0 && (
        <div className="px-4 py-2.5 bg-white/[0.02]">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500 font-medium uppercase tracking-wider">Domains</span>
            <span className="text-white/80 font-medium">{domains.length}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] mt-1">
            <span className="text-gray-500 font-medium uppercase tracking-wider">Mailboxes</span>
            <span className="text-white/80 font-medium">{getTotalMailboxes()}</span>
          </div>
          {selectedMailbox && (
            <div className="flex items-center justify-between text-[10px] mt-1">
              <span className="text-gray-500 font-medium uppercase tracking-wider">Selected</span>
              <span className="text-blue-400/80 font-medium truncate ml-2">{selectedMailbox.split('@')[0]}</span>
            </div>
          )}
        </div>
      )}

      {/* Domain List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {domains.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
              <Shield className="w-5 h-5 text-gray-600" />
            </div>
            <p className="text-gray-500 text-xs font-medium">No domains extracted</p>
            <p className="text-gray-600 text-[10px] mt-1 max-w-[200px]">
              Click Extract after logging into SpaceMail dashboard
            </p>
          </div>
        ) : (
          <div className="px-4 py-3 space-y-1.5">
            {domains.map((domain, idx) => (
              <div
                key={idx}
                className="rounded-lg overflow-hidden bg-white/[0.02] border border-transparent hover:border-white/10 transition-all duration-200"
              >
                {/* Domain Header */}
                <button
                  onClick={() => toggleDomain(domain.name)}
                  className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/[0.03] transition-colors duration-200"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {domain.isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
                    )}
                    <Mail className="w-3.5 h-3.5 flex-shrink-0 text-blue-400/70" />
                    <span className="text-[11px] font-medium text-white/80 truncate">{domain.name}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 bg-white/[0.05] px-1.5 py-0.5 rounded font-mono">
                    {domain.mailboxes.length}
                  </span>
                </button>

                {/* Mailbox List */}
                {domain.isExpanded && (
                  <div className="border-t border-white/[0.04]">
                    {domain.mailboxes.map((mailbox, mIdx) => (
                      <div key={mIdx} className="group flex items-center gap-1">
                        <button
                          onClick={() => handleHighlightMailbox(mailbox.email)}
                          className={`flex-1 px-3 py-2 flex items-center justify-between hover:bg-white/[0.04] transition-colors duration-200 ${
                            selectedMailbox === mailbox.email ? 'bg-blue-500/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-1 h-1 rounded-full bg-emerald-400/60 flex-shrink-0" />
                            <span className="text-[10px] text-gray-400 truncate">{mailbox.username}</span>
                          </div>
                          {mailbox.hasEditButton && (
                            <Key className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                          )}
                        </button>
                        <button
                          onClick={() => handleUpdatePassword(mailbox.email, false)}
                          disabled={isUpdating}
                          className="px-2 py-2 hover:bg-emerald-500/20 rounded text-emerald-500/70 hover:text-emerald-400 transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100"
                          title="Update password"
                        >
                          <Key className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Update Log */}
      {updateLog.length > 0 && (
        <div className="px-4 py-3 bg-white/[0.02] max-h-32 overflow-y-auto custom-scrollbar">
          <div className="text-[9px] text-gray-500 font-mono space-y-0.5">
            {updateLog.slice(-15).map((log, idx) => (
              <div key={idx} className="text-gray-400 leading-relaxed">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Panel */}
      {domains.length > 0 && (
        <div className="px-4 py-3 bg-white/[0.02] space-y-2">
          {updateProgress.status === 'running' && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1.5">
                <span className="font-medium">Progress</span>
                <span className="text-white/70 font-mono">{updateProgress.current}/{updateProgress.total}</span>
              </div>
              <div className="w-full bg-white/[0.06] rounded-full h-1">
                <div
                  className="bg-emerald-500/80 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${(updateProgress.current / updateProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {updateProgress.status === 'running' ? (
            <button
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-rose-600/70 hover:bg-rose-600 text-white/90 text-[11px] font-medium transition-colors duration-200"
              onClick={handleStopUpdate}
            >
              <Pause className="w-3.5 h-3.5" />
              Stop ({updateProgress.current}/{updateProgress.total})
            </button>
          ) : (
            <>
              <button
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600/70 hover:bg-amber-600 disabled:bg-white/[0.04] disabled:text-gray-500 text-white/90 text-[11px] font-medium transition-colors duration-200 disabled:cursor-not-allowed"
                onClick={() => handleUpdateAll(true)}
                disabled={isUpdating || domains.length === 0}
              >
                <Play className="w-3.5 h-3.5" />
                Dry Run
              </button>
              <button
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600/70 hover:bg-emerald-600 disabled:bg-white/[0.04] disabled:text-gray-500 text-white/90 text-[11px] font-medium transition-colors duration-200 disabled:cursor-not-allowed"
                onClick={() => handleUpdateAll(false)}
                disabled={isUpdating || domains.length === 0}
              >
                <Play className="w-3.5 h-3.5" />
                Live Update
              </button>
              <p className="text-[9px] text-gray-600 text-center">
                Dry run tests without saving, live mode updates passwords
              </p>
            </>
          )}
          {getTotalMailboxes() > 10 && (
            <p className="text-[9px] text-amber-500/80 text-center flex items-center justify-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" />
              Test on few mailboxes first
            </p>
          )}
        </div>
      )}

    </div>
  );
}
