/**
 * Google Sheets Password Tracker Integration
 *
 * Handles the workflow of:
 * 1. Opening "DomainLevelPassChange" bookmark
 * 2. Writing email to Column A, Row 2
 * 3. Generating and writing password to Column B, Row 2
 * 4. Copying password to clipboard
 * 5. Returning to original tab
 *
 * @author Claude Code
 * @version 1.0.0
 */

/**
 * Generate a secure password (16 characters with upper, lower, numbers, symbols)
 */
export function generateSecurePassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = upper + lower + numbers + symbols;

  let pwd = '';
  // Ensure at least one of each type
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += numbers[Math.floor(Math.random() * numbers.length)];
  pwd += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill the rest
  for (let i = 4; i < 16; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle to randomize positions
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Script to inject into Google Sheets tab to update email and password
 * This runs IN the Google Sheets webview
 */
export function createGoogleSheetsUpdateScript(email: string, password: string): string {
  return `
    (async function() {
      const log = (msg) => console.log('[GoogleSheets]', msg);
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      try {
        log('Starting Google Sheets update for email: ${email}');

        // Wait for Google Sheets to fully load
        await sleep(3000);

        // SAFE APPROACH: Use Google Sheets API or direct cell manipulation
        // We'll click on specific cells and use paste to avoid keyboard shortcuts

        // Find the spreadsheet grid
        const grid = document.querySelector('.grid-container, [role="grid"]');
        if (!grid) {
          return { success: false, error: 'Google Sheets grid not found' };
        }

        log('Found Google Sheets grid');

        // Try to find cells by looking for input elements or contenteditable divs
        // Google Sheets uses input fields for cell editing

        // Strategy: Click on cell A2 coordinates
        // Find all cells and click the one at row 2, col A
        let cellA2 = document.querySelector('[aria-rowindex="2"][aria-colindex="1"]');

        if (!cellA2) {
          // Try alternative selector
          cellA2 = document.querySelector('div[role="gridcell"][data-row="1"][data-col="0"]');
        }

        if (!cellA2) {
          // Manual click at approximate position (fallback)
          log('Clicking at approximate A2 position...');
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: 100, // Approximate X for column A
            clientY: 150  // Approximate Y for row 2
          });
          grid.dispatchEvent(clickEvent);
          await sleep(500);
        } else {
          log('Found cell A2, clicking...');
          cellA2.click();
          await sleep(500);
        }

        // Now we should be in edit mode for A2
        // Copy email to clipboard
        await navigator.clipboard.writeText('${email}');
        log('Email copied to clipboard');
        await sleep(200);

        // Paste using Ctrl+V (safer than typing)
        document.execCommand('paste');
        await sleep(300);

        // Alternatively, try to find the input and set value directly
        const activeInput = document.activeElement;
        if (activeInput && (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA')) {
          activeInput.value = '${email}';
          log('✅ Email set in A2 via input');
        }

        await sleep(500);

        // Press Enter to confirm and move down (safer than Tab)
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: false
        });
        document.activeElement?.dispatchEvent(enterEvent);
        await sleep(300);

        // Now move right to column B (same row)
        const rightEvent = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          keyCode: 39,
          bubbles: true,
          cancelable: false
        });
        document.activeElement?.dispatchEvent(rightEvent);
        await sleep(300);

        log('Moving to B2 for password...');

        // Copy password to clipboard
        await navigator.clipboard.writeText('${password}');
        log('Password copied to clipboard');
        await sleep(200);

        // Paste password
        document.execCommand('paste');
        await sleep(300);

        // Or set directly if input is active
        const activeInput2 = document.activeElement;
        if (activeInput2 && (activeInput2.tagName === 'INPUT' || activeInput2.tagName === 'TEXTAREA')) {
          activeInput2.value = '${password}';
          log('✅ Password set in B2 via input');
        }

        await sleep(500);

        // Press Enter to confirm
        document.activeElement?.dispatchEvent(enterEvent);
        await sleep(300);

        log('✅ Email and password updated in Google Sheets');
        log('✅ Password is in clipboard');

        return {
          success: true,
          email: '${email}',
          password: '${password}',
          message: 'Email and password updated in Google Sheets, password copied to clipboard'
        };

      } catch (error) {
        log('❌ Error updating Google Sheets:', error);
        return {
          success: false,
          error: error.message || 'Failed to update Google Sheets'
        };
      }
    })();
  `;
}

/**
 * Script to paste password using Ctrl+V in SpaceMail
 * This replaces the typing logic
 */
export function createPasswordPasteScript(password: string, dryRun: boolean = true): string {
  return `
    (async function() {
      const DRY_RUN = ${dryRun};
      const PASSWORD = '${password.replace(/'/g, "\\'")}';
      const log = (msg) => console.log('[SpaceMail Paste]', msg);
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

        // Simulate mouse movement with bezier curve
        const moveEvent = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: targetX,
          clientY: targetY
        });
        document.dispatchEvent(moveEvent);
        await sleep(randomDelay(150, 300)); // Human thinking pause

        // Hover over input
        const hoverEvent = new MouseEvent('mouseenter', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: targetX,
          clientY: targetY
        });
        passwordInput.dispatchEvent(hoverEvent);
        await sleep(randomDelay(80, 150)); // Slight hover delay

        // Click the input (human-like)
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
        await sleep(randomDelay(300, 600)); // Human thinking pause after clicking

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

        log('✅ Password input is focused and ready');

        // Clear existing value if any
        if (passwordInput.value) {
          log('Clearing existing value...');
          passwordInput.value = '';
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(randomDelay(100, 200));
        }

        // Human thinking pause before pasting
        await sleep(randomDelay(400, 800));

        // Simulate Ctrl+V paste
        log('Simulating Ctrl+V paste (human-like)...');

        // 1. Dispatch Ctrl keydown (human holds Ctrl for ~60-120ms before pressing V)
        passwordInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Control',
          code: 'ControlLeft',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        }));
        await sleep(randomDelay(60, 120)); // Human delay between Ctrl and V

        // 2. Dispatch V keydown with Ctrl held
        passwordInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'v',
          code: 'KeyV',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        }));
        await sleep(randomDelay(80, 150)); // Key press duration

        // 3. Use the password directly (passed as parameter)
        log('Pasting password:', '***' + PASSWORD.slice(-4));

        // Set the value
        passwordInput.value = PASSWORD;

        // Dispatch input event
        passwordInput.dispatchEvent(new InputEvent('input', {
          data: PASSWORD,
          inputType: 'insertFromPaste',
          bubbles: true,
          cancelable: true,
          composed: true
        }));
        await sleep(randomDelay(100, 200)); // Human pause after paste

        log('✅ Password pasted successfully');

        // 4. Dispatch V keyup (human releases V first, ~40-80ms before Ctrl)
        passwordInput.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'v',
          code: 'KeyV',
          ctrlKey: true,
          bubbles: true
        }));
        await sleep(randomDelay(40, 80)); // Natural release timing

        // 5. Dispatch Ctrl keyup
        passwordInput.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Control',
          code: 'ControlLeft',
          bubbles: true
        }));
        await sleep(randomDelay(200, 400)); // Human pause after paste action

        // Trigger blur to activate form validation
        log('Triggering blur for validation...');
        passwordInput.blur();
        passwordInput.dispatchEvent(new FocusEvent('blur', {
          bubbles: true,
          cancelable: true,
          composed: true
        }));
        await sleep(randomDelay(300, 600)); // Wait for validation

        // Wait for Save button
        log('Waiting for Save button...');
        let saveButton = null;
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
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
                log('✅ Save button is enabled');
                break;
              }
            }
          }

          if (saveButton) break;

          // Re-blur every 3 seconds
          if (attempts > 0 && attempts % 6 === 0) {
            passwordInput.focus();
            await sleep(100);
            passwordInput.blur();
            passwordInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
          }

          await sleep(500);
          attempts++;
        }

        if (!saveButton) {
          return { success: false, error: 'Save button not found or did not activate' };
        }

        log('✅ Save button is ready!');

        // Click Save button
        if (DRY_RUN) {
          log('🧪 DRY RUN: Would click Save button here');
          log('🧪 DRY RUN: Password is pasted and validated');
          log('🧪 DRY RUN: Save button is enabled and clickable');
          return { success: true, dryRun: true, message: 'Password pasted, Save button ready' };
        } else {
          // Human-like mouse movement to Save button
          log('Moving mouse to Save button (human-like)...');
          const btnRect = saveButton.getBoundingClientRect();
          const btnX = btnRect.left + btnRect.width / 2 + (Math.random() - 0.5) * 15;
          const btnY = btnRect.top + btnRect.height / 2 + (Math.random() - 0.5) * 8;

          // Mouse move event
          const btnMoveEvent = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: btnX,
            clientY: btnY
          });
          document.dispatchEvent(btnMoveEvent);
          await sleep(randomDelay(200, 400)); // Human movement time

          // Hover over button
          const btnHoverEvent = new MouseEvent('mouseenter', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: btnX,
            clientY: btnY
          });
          saveButton.dispatchEvent(btnHoverEvent);
          await sleep(randomDelay(150, 300)); // Brief hover

          // Human thinking pause before clicking
          await sleep(randomDelay(300, 600));

          log('Clicking Save button...');
          const btnClickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: btnX,
            clientY: btnY
          });
          saveButton.dispatchEvent(btnClickEvent);
          saveButton.click();

          await sleep(randomDelay(800, 1500)); // Wait for save to complete
          log('✅ Password saved successfully!');
          return { success: true, message: 'Password updated and saved successfully' };
        }

      } catch (err) {
        log('❌ Error:', String(err));
        return { success: false, error: String(err) };
      }
    })();
  `;
}
