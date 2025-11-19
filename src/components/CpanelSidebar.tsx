import { useState, useEffect } from 'react';
import { X, KeyRound, AlertCircle, CheckCircle2, Loader2, Download, UserPlus, UserMinus } from 'lucide-react';

interface CpanelAction {
  action: string;
  email: string;
  names?: string[];
  data: any;
}

interface CpanelSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  initialAction?: CpanelAction | null;
  onActionComplete?: () => void;
}

interface LogEntry {
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  timestamp: Date;
}

interface PasswordChange {
  email: string;
  newPassword: string;
  timestamp: string;
  status: 'success' | 'failed';
}

export default function CpanelSidebar({ isOpen, onClose, initialAction, onActionComplete }: CpanelSidebarProps) {
  const [emailInput, setEmailInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [passwordChanges, setPasswordChanges] = useState<PasswordChange[]>([]);
  const [showNoResultModal, setShowNoResultModal] = useState(false);
  const [currentAction, setCurrentAction] = useState<string>('reset'); // 'reset', 'create', 'delete'

  // Handle initial action from notification
  useEffect(() => {
    if (initialAction && isOpen) {
      console.log('[cPanel] 📥 Received initial action:', initialAction);

      // Set the action type
      setCurrentAction(initialAction.action);
      addLog('info', `Action set to: ${initialAction.action}`);

      let emailsToProcess = '';

      // Handle email or names
      if (initialAction.email) {
        emailsToProcess = initialAction.email;
        setEmailInput(initialAction.email);
        addLog('info', `Auto-filled email: ${initialAction.email}`);
      } else if (initialAction.names && initialAction.names.length > 0) {
        // Join names with newlines for bulk operations
        const namesText = initialAction.names.join('\n');
        emailsToProcess = namesText;
        setEmailInput(namesText);
        addLog('info', `Auto-filled ${initialAction.names.length} name(s) for bulk operation`);
      }

      // Auto-format and execute
      if (emailsToProcess) {
        setTimeout(() => {
          // Auto-format the names first
          const lines = emailsToProcess.split('\n').map(line => line.trim()).filter(line => line.length > 0);

          if (lines.length === 1) {
            const line = lines[0];
            if (!line.includes('@')) {
              const formatted = formatNameToEmail(line);
              setEmailInput(formatted);
              addLog('info', `Auto-formatted: "${line}" → "${formatted}"`);

              // Execute action after formatting
              setTimeout(() => {
                executeAction(initialAction.action, formatted);
              }, 300);
            } else {
              executeAction(initialAction.action, line);
            }
          } else if (lines.length > 1) {
            const formatted = lines.map(line => {
              if (!line.includes('@')) {
                return formatNameToEmail(line);
              }
              return line;
            });
            const formattedText = formatted.join('\n');
            setEmailInput(formattedText);
            addLog('info', `Auto-formatted ${lines.length} names`);

            // Execute action after formatting
            setTimeout(() => {
              executeAction(initialAction.action, formattedText);
            }, 300);
          }
        }, 500);
      }
    }
  }, [initialAction, isOpen]);

  // Format name to email username (e.g., "Pawan Ojha" -> "pawan.ojha")
  const formatNameToEmail = (input: string): string => {
    // If already contains @, return as is
    if (input.includes('@')) {
      return input;
    }

    // Convert to lowercase, trim, and replace spaces with dots
    return input
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '.')  // Replace one or more spaces with a single dot
      .replace(/\.{2,}/g, '.'); // Replace multiple consecutive dots with single dot
  };

  // Handle email input change with auto-formatting
  const handleEmailInputChange = (value: string) => {
    setEmailInput(value);
  };

  // Auto-format email when user leaves the input field (onBlur)
  const handleEmailInputBlur = () => {
    if (!emailInput) return;

    // Check if it's multi-line (bulk operation)
    const lines = emailInput.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 1) {
      // Single line - format if not an email
      const line = lines[0];
      if (!line.includes('@')) {
        const formatted = formatNameToEmail(line);
        setEmailInput(formatted);
        if (formatted !== line) {
          addLog('info', `Auto-formatted: "${line}" → "${formatted}"`);
        }
      }
    } else if (lines.length > 1) {
      // Multi-line - format each line if needed
      const formatted = lines.map(line => {
        if (!line.includes('@')) {
          return formatNameToEmail(line);
        }
        return line;
      });
      setEmailInput(formatted.join('\n'));
      addLog('info', `Auto-formatted ${lines.length} names`);
    }
  };

  // Generate strong random password
  const generatePassword = (): string => {
    const length = 16;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()-_=+[]{}';
    const allChars = uppercase + lowercase + numbers + special;

    let password = '';
    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  // Add log entry
  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { type, message, timestamp: new Date() }]);
  };

  // Save password change to state
  const savePasswordChange = (email: string, newPassword: string, status: 'success' | 'failed') => {
    setPasswordChanges(prev => [...prev, {
      email,
      newPassword,
      timestamp: new Date().toISOString(),
      status
    }]);
  };

  // Download passwords as JSON
  const handleDownloadPasswords = () => {
    if (passwordChanges.length === 0) {
      addLog('warning', 'No password changes to download');
      return;
    }

    const data = {
      version: '1.0',
      encrypted: false,
      exportDate: new Date().toISOString(),
      entries: passwordChanges
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpanel_passwords_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addLog('success', `Downloaded ${passwordChanges.length} password changes`);
  };

  // Execute action based on type
  const executeAction = async (action: string, emailData: string) => {
    console.log('[cPanel] 🚀 Executing action:', action, 'for:', emailData);

    // Update the emailInput state to ensure handlers use the correct data
    setEmailInput(emailData);

    // Small delay to ensure state is updated
    await new Promise(resolve => setTimeout(resolve, 100));

    switch (action) {
      case 'reset':
      case 'password':
        await handleChangePassword();
        break;
      case 'create':
        await handleCreateAccount();
        break;
      case 'delete':
        await handleDeleteAccount();
        break;
      default:
        addLog('warning', `Unknown action: ${action}`);
    }

    if (onActionComplete) {
      onActionComplete();
    }
  };

  const handleCreateAccount = async () => {
    if (!emailInput.trim()) {
      addLog('error', 'Please enter an email address or name');
      return;
    }

    setIsProcessing(true);

    try {
      // Parse input - could be single or multiple lines
      const lines = emailInput.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      addLog('info', `Processing ${lines.length} account(s)...`);

      let successCount = 0;
      let failCount = 0;

      for (const line of lines) {
        const newPassword = generatePassword();

        try {
          addLog('info', `Creating account for: ${line}`);

          const response = await (window as any).ipcRenderer.invoke(
            'cpanel:create-account',
            line
          );

          if (response.success) {
            addLog('success', `✓ Account created: ${line}`);
            addLog('info', `🔑 Password: ${response.password}`);
            savePasswordChange(line, response.password, 'success');
            successCount++;
          } else {
            addLog('error', `✗ Failed: ${line} - ${response.message || 'Unknown error'}`);
            failCount++;
          }
        } catch (error: any) {
          addLog('error', `✗ Error: ${line} - ${error.message}`);
          savePasswordChange(line, newPassword, 'failed');
          failCount++;
        }

        // Small delay between bulk operations
        if (lines.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      addLog('info', `Completed: ${successCount} success, ${failCount} failed`);

      if (successCount === lines.length) {
        setEmailInput('');
      }
    } catch (error: any) {
      addLog('error', error.message || 'Failed to process accounts');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!emailInput.trim()) {
      addLog('error', 'Please enter an email address or name');
      return;
    }

    setIsProcessing(true);

    try {
      // Parse input - could be single or multiple lines
      const lines = emailInput.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      addLog('info', `Processing ${lines.length} account(s) for deletion...`);

      let successCount = 0;
      let failCount = 0;

      for (const line of lines) {
        try {
          addLog('info', `Deleting account: ${line}`);

          const response = await (window as any).ipcRenderer.invoke(
            'cpanel:delete-account',
            line
          );

          if (response.success) {
            addLog('success', `✓ Account deleted: ${line}`);
            successCount++;
          } else {
            addLog('error', `✗ Failed: ${line} - ${response.message || 'Unknown error'}`);
            failCount++;
          }
        } catch (error: any) {
          addLog('error', `✗ Error: ${line} - ${error.message}`);
          failCount++;
        }

        // Small delay between bulk operations
        if (lines.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      addLog('info', `Completed: ${successCount} success, ${failCount} failed`);

      if (successCount === lines.length) {
        setEmailInput('');
      }
    } catch (error: any) {
      addLog('error', error.message || 'Failed to process deletions');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangePassword = async () => {
    if (!emailInput.trim()) {
      addLog('error', 'Please enter an email address');
      return;
    }

    setIsProcessing(true);
    setShowNoResultModal(false);
    addLog('info', `Starting password change for: ${emailInput}`);

    // Generate password before starting
    const newPassword = generatePassword();
    addLog('success', `Generated secure password: ${newPassword}`);

    try {
      const webview = document.querySelector('webview') as any;
      if (!webview) {
        addLog('error', 'Webview not found. Please make sure cPanel is loaded.');
        setIsProcessing(false);
        return;
      }

      // Execute the automation inside the webview
      const result = await webview.executeJavaScript(`
        (async function() {
          const log = [];
          const emailToSearch = '${emailInput.replace(/'/g, "\\'")}';
          const newPassword = '${newPassword.replace(/'/g, "\\'")}';

          // Helper: Human-like delay
          const humanDelay = (min, max) => {
            const delay = min + Math.random() * (max - min);
            return new Promise(resolve => setTimeout(resolve, delay));
          };

          // Helper: Human-like typing
          const humanType = async (element, text) => {
            element.focus();
            await humanDelay(200, 400);

            for (let i = 0; i < text.length; i++) {
              element.value = text.substring(0, i + 1);

              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text[i] }));

              await humanDelay(50, 150);

              if (Math.random() < 0.1) {
                await humanDelay(200, 500);
              }
            }

            await humanDelay(150, 350);
          };

          // Helper: Human-like click
          const humanClick = async (element) => {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await humanDelay(400, 700);

            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            const mouseEnter = new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y });
            element.dispatchEvent(mouseEnter);
            await humanDelay(150, 300);

            const mouseOver = new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y });
            element.dispatchEvent(mouseOver);
            await humanDelay(50, 100);

            const mouseDown = new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 });
            element.dispatchEvent(mouseDown);
            await humanDelay(50, 120);

            const mouseUp = new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y, button: 0 });
            element.dispatchEvent(mouseUp);
            await humanDelay(50, 100);

            const click = new MouseEvent('click', { bubbles: true, clientX: x, clientY: y, button: 0 });
            element.dispatchEvent(click);

            if (typeof element.click === 'function') {
              element.click();
            }

            await humanDelay(250, 450);
          };

          try {
            // STEP 1: Click Email Accounts link
            log.push({ type: 'info', message: '🔍 Step 1: Looking for Email Accounts link...' });

            let emailAccountsLink = document.querySelector('a[id="item_email_accounts"]');
            if (!emailAccountsLink) {
              emailAccountsLink = document.querySelector('a#item_email_accounts');
            }
            if (!emailAccountsLink) {
              emailAccountsLink = document.querySelector('a[href*="email_accounts"]');
            }
            if (!emailAccountsLink) {
              const links = Array.from(document.querySelectorAll('a'));
              emailAccountsLink = links.find(a =>
                a.textContent && a.textContent.toLowerCase().includes('email accounts')
              );
            }

            if (!emailAccountsLink) {
              log.push({ type: 'error', message: '❌ Email Accounts link not found. Make sure you are on cPanel home page.' });
              return { success: false, logs: log };
            }

            log.push({ type: 'success', message: '✅ Found Email Accounts link' });
            log.push({ type: 'info', message: '👆 Clicking Email Accounts...' });

            await humanClick(emailAccountsLink);

            // STEP 2: Find and type in search input (with retry logic)
            log.push({ type: 'info', message: '⏳ Waiting for Email Accounts page...' });

            let searchInput = null;
            let attempts = 0;
            const maxAttempts = 10;

            // Try to find search input with multiple attempts (wait for page to load)
            while (!searchInput && attempts < maxAttempts) {
              await humanDelay(500, 800); // Short delay between attempts

              searchInput = document.querySelector('input#email_table_search_input');
              if (!searchInput) {
                searchInput = document.querySelector('input[id*="email_table_search"]');
              }
              if (!searchInput) {
                searchInput = document.querySelector('input[placeholder*="Search"][type="text"]');
              }

              attempts++;

              if (!searchInput && attempts < maxAttempts) {
                log.push({ type: 'info', message: \`🔍 Looking for search input (attempt \${attempts}/\${maxAttempts})...\` });
              }
            }

            if (!searchInput) {
              log.push({ type: 'error', message: '❌ Search input not found after waiting. Page may not be fully loaded.' });
              return { success: false, logs: log };
            }

            log.push({ type: 'success', message: \`✅ Found search input (email_table_search_input) after \${attempts} attempt(s)\` });

            // IMPORTANT: Click on the search input first to ensure it's focused and ready
            log.push({ type: 'info', message: '👆 Clicking search input to activate it...' });
            await humanClick(searchInput);

            // Clear existing value first
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            await humanDelay(300, 500);

            log.push({ type: 'info', message: \`⌨️  Typing: \${emailToSearch}\` });
            await humanType(searchInput, emailToSearch);

            // Trigger Angular model update
            const angularEvent = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(angularEvent);

            // Wait for search to filter results
            log.push({ type: 'info', message: '⏳ Waiting for search results...' });
            await humanDelay(1500, 2500);

            // STEP 3: Validate search results
            log.push({ type: 'info', message: '🔍 Step 3: Validating search results...' });

            // Find visible table rows
            const allRows = document.querySelectorAll('tbody tr, tr[ng-repeat]');
            const visibleRows = Array.from(allRows).filter(row => {
              const style = window.getComputedStyle(row);
              const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              const hasContent = row.textContent && row.textContent.trim().length > 0;
              return isVisible && hasContent;
            });

            log.push({ type: 'info', message: \`📊 Found \${visibleRows.length} visible result(s)\` });

            // If no results or multiple results, try username-only search
            if (visibleRows.length === 0 || visibleRows.length > 1) {
              const emailParts = emailToSearch.split('@');
              if (emailParts.length === 2) {
                const username = emailParts[0];
                const domain = emailParts[1];

                log.push({ type: 'warning', message: \`⚠️ \${visibleRows.length === 0 ? 'No results' : 'Multiple results'} found. Trying username only: \${username}\` });

                // Clear and search again with username
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                await humanDelay(400, 600);

                await humanType(searchInput, username);
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                await humanDelay(1500, 2500);

                // Re-check results
                const newRows = Array.from(document.querySelectorAll('tbody tr, tr[ng-repeat]')).filter(row => {
                  const style = window.getComputedStyle(row);
                  const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                  const hasContent = row.textContent && row.textContent.trim().length > 0;
                  return isVisible && hasContent;
                });

                log.push({ type: 'info', message: \`📊 After username search: \${newRows.length} result(s)\` });

                if (newRows.length === 0) {
                  log.push({ type: 'error', message: '❌ No email account found with this ID' });
                  return { success: false, logs: log, noResults: true };
                } else if (newRows.length > 1) {
                  log.push({ type: 'warning', message: \`⚠️ Still \${newRows.length} results. Looking for exact domain match...\` });
                }
              } else {
                if (visibleRows.length === 0) {
                  log.push({ type: 'error', message: '❌ No email account found' });
                  return { success: false, logs: log, noResults: true };
                }
              }
            }

            // STEP 4: Find and click Manage button
            log.push({ type: 'info', message: '🔍 Step 4: Looking for Manage button...' });
            await humanDelay(500, 800);

            let manageButton = document.querySelector('button[data-testid="manageEmailAccountButton"]');
            if (!manageButton) {
              manageButton = document.querySelector('button[id*="email_table"][id*="manage"]');
            }
            if (!manageButton) {
              const buttons = Array.from(document.querySelectorAll('button'));
              manageButton = buttons.find(btn =>
                btn.textContent && btn.textContent.toLowerCase().includes('manage') &&
                !btn.hasAttribute('disabled')
              );
            }

            if (!manageButton) {
              log.push({ type: 'error', message: '❌ Manage button not found' });
              return { success: false, logs: log };
            }

            // Check if button is disabled
            if (manageButton.hasAttribute('disabled') || manageButton.getAttribute('aria-disabled') === 'true') {
              log.push({ type: 'error', message: '❌ Manage button is disabled (temporary domain or restricted account)' });
              return { success: false, logs: log };
            }

            log.push({ type: 'success', message: '✅ Found Manage button' });
            log.push({ type: 'info', message: '👆 Clicking Manage button...' });

            await humanClick(manageButton);

            log.push({ type: 'info', message: '⏳ Waiting for account management page...' });
            await humanDelay(2500, 4000);

            // STEP 5: Find password input and enter new password
            log.push({ type: 'info', message: '🔍 Step 5: Looking for password input field...' });

            let passwordInput = document.querySelector('input#txtEmailPassword');
            if (!passwordInput) {
              passwordInput = document.querySelector('input[name="txtEmailPassword"]');
            }
            if (!passwordInput) {
              passwordInput = document.querySelector('input[type="password"][autocomplete*="new"]');
            }

            if (!passwordInput) {
              log.push({ type: 'error', message: '❌ Password input field not found' });
              return { success: false, logs: log };
            }

            log.push({ type: 'success', message: '✅ Found password input field' });
            log.push({ type: 'info', message: '🔑 Entering new password...' });

            // Clear existing password
            passwordInput.value = '';
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            await humanDelay(300, 500);

            // Type new password
            await humanType(passwordInput, newPassword);

            // Trigger validation events
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('blur', { bubbles: true }));

            log.push({ type: 'success', message: '✅ Password entered successfully' });
            await humanDelay(800, 1200);

            // STEP 6: Click Update Email Settings button
            log.push({ type: 'info', message: '🔍 Step 6: Looking for Update button...' });

            let updateButton = document.querySelector('button#btnUpdateEmailEmailAccount');
            if (!updateButton) {
              updateButton = document.querySelector('button[data-testid="updateEmailAccountSettings"]');
            }
            if (!updateButton) {
              const buttons = Array.from(document.querySelectorAll('button'));
              updateButton = buttons.find(btn =>
                (btn.textContent && btn.textContent.toLowerCase().includes('update')) ||
                (btn.getAttribute('title') && btn.getAttribute('title').toLowerCase().includes('update email'))
              );
            }

            if (!updateButton) {
              log.push({ type: 'error', message: '❌ Update button not found' });
              return { success: false, logs: log };
            }

            // Check if button is disabled
            if (updateButton.hasAttribute('disabled') || updateButton.getAttribute('aria-disabled') === 'true') {
              log.push({ type: 'error', message: '❌ Update button is disabled. Password may not meet requirements.' });
              return { success: false, logs: log };
            }

            log.push({ type: 'success', message: '✅ Found Update Email Settings button' });
            log.push({ type: 'info', message: '👆 Clicking Update button...' });

            await humanClick(updateButton);

            log.push({ type: 'success', message: '🎉 Password update submitted!' });
            log.push({ type: 'info', message: '⏳ Waiting for confirmation...' });
            await humanDelay(2000, 3000);

            return {
              success: true,
              logs: log,
              passwordChanged: true,
              newPassword: newPassword
            };

          } catch (error) {
            log.push({ type: 'error', message: '❌ Error: ' + error.message });
            return { success: false, logs: log, error: error.message };
          }
        })();
      `);

      // Process logs from webview
      if (result.logs) {
        result.logs.forEach((entry: any) => {
          addLog(entry.type, entry.message);
        });
      }

      if (result.noResults) {
        setShowNoResultModal(true);
      } else if (result.success && result.passwordChanged) {
        addLog('success', '✅ Password changed successfully!');
        addLog('info', `📝 New password: ${newPassword}`);
        savePasswordChange(emailInput, newPassword, 'success');
      } else {
        addLog('error', result.error || 'Failed to complete the operation');
        savePasswordChange(emailInput, newPassword, 'failed');
      }

    } catch (error: any) {
      addLog('error', `Failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  if (!isOpen) return null;

  return (
    <div
      className="w-96 flex flex-col text-gray-200"
      style={{ backgroundColor: "#232321", borderLeft: "1px solid #3c3c3c", height: "100%" }}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-700 rounded-lg">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">cPanel Password Manager</h3>
            <p className="text-xs text-gray-400">Change email account passwords</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#3c3c3c]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Tabs */}
      <div className="p-4 border-b border-[#3c3c3c]">
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentAction('reset')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              currentAction === 'reset'
                ? 'bg-orange-600 text-white'
                : 'bg-[#2d2d2b] text-gray-400 hover:text-gray-200'
            }`}
          >
            <KeyRound className="w-3 h-3" />
            Reset Password
          </button>
          <button
            onClick={() => setCurrentAction('create')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              currentAction === 'create'
                ? 'bg-green-600 text-white'
                : 'bg-[#2d2d2b] text-gray-400 hover:text-gray-200'
            }`}
          >
            <UserPlus className="w-3 h-3" />
            Create Account
          </button>
          <button
            onClick={() => setCurrentAction('delete')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              currentAction === 'delete'
                ? 'bg-red-600 text-white'
                : 'bg-[#2d2d2b] text-gray-400 hover:text-gray-200'
            }`}
          >
            <UserMinus className="w-3 h-3" />
            Delete Account
          </button>
        </div>
      </div>

      {/* Email Input Section */}
      <div className="p-4 border-b border-[#3c3c3c] space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Email Address or Names (one per line for bulk)
          </label>
          <textarea
            value={emailInput}
            onChange={(e) => handleEmailInputChange(e.target.value)}
            onBlur={handleEmailInputBlur}
            placeholder="user@domain.com or Full Name&#10;Multiple names (one per line)&#10;Pawan Ojha&#10;John Doe"
            rows={4}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[#2d2d2b] border border-[#3c3c3c] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none font-mono"
            disabled={isProcessing}
          />
        </div>

        {/* Dynamic Action Button */}
        {currentAction === 'reset' && (
          <button
            onClick={handleChangePassword}
            disabled={isProcessing || !emailInput.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-orange-700 hover:from-orange-600 hover:to-orange-800 disabled:from-gray-600 disabled:to-gray-700 text-white text-sm font-medium transition-colors shadow-lg disabled:shadow-none disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                Change Password
              </>
            )}
          </button>
        )}

        {currentAction === 'create' && (
          <button
            onClick={handleCreateAccount}
            disabled={isProcessing || !emailInput.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 text-white text-sm font-medium transition-colors shadow-lg disabled:shadow-none disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Create Account
              </>
            )}
          </button>
        )}

        {currentAction === 'delete' && (
          <button
            onClick={handleDeleteAccount}
            disabled={isProcessing || !emailInput.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 text-white text-sm font-medium transition-colors shadow-lg disabled:shadow-none disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <UserMinus className="w-4 h-4" />
                Delete Account
              </>
            )}
          </button>
        )}

        {/* Download Passwords Button */}
        {passwordChanges.length > 0 && (
          <button
            onClick={handleDownloadPasswords}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Passwords ({passwordChanges.length})
          </button>
        )}
      </div>

      {/* Logs Section */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-300">Activity Log</h4>
          {logs.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-[#3c3c3c]"
            >
              Clear
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No activity yet</p>
            <p className="text-xs mt-1">Enter an email and click Change Password</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg text-xs ${
                  log.type === 'error'
                    ? 'bg-red-900/20 border border-red-800/30 text-red-300'
                    : log.type === 'success'
                    ? 'bg-green-900/20 border border-green-800/30 text-green-300'
                    : log.type === 'warning'
                    ? 'bg-yellow-900/20 border border-yellow-800/30 text-yellow-300'
                    : 'bg-blue-900/20 border border-blue-800/30 text-blue-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {log.type === 'error' && <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                  {log.type === 'success' && <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <p>{log.message}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {log.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* No Results Modal */}
      {showNoResultModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="bg-[#232321] border border-[#3c3c3c] rounded-lg p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <h3 className="text-lg font-semibold text-white">No Mail ID Found</h3>
            </div>
            <p className="text-gray-400 text-sm mb-6">
              The email address <span className="text-white font-medium">{emailInput}</span> was not found in cPanel.
              Please verify the email address and try again.
            </p>
            <button
              onClick={() => setShowNoResultModal(false)}
              className="w-full px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
