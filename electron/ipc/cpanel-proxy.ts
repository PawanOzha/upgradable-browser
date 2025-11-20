import { ipcMain } from 'electron';
import axios from 'axios';
import { logAuditEvent } from '../../db/database-secure';

// cPanel Configuration
const CPANEL_SERVER = 'https://webhosting3002.is.cc:2083';
const DOMAIN = 'entegrasources.com.np';

interface CpanelCredentials {
  username: string;
  apiToken: string;
}

// Get cPanel credentials from environment
function getCpanelCredentials(): CpanelCredentials {
  // SECURITY: Only use non-VITE_ prefixed variables in main process
  // VITE_ prefixed variables are exposed to renderer process which is insecure
  const username = process.env.CPANEL_USERNAME || '';
  const apiToken = process.env.CPANEL_API_TOKEN || '';

  if (!apiToken || !username) {
    console.error('[cPanel] Credentials not found in environment variables');
    console.error('[cPanel] Required: CPANEL_API_TOKEN, CPANEL_USERNAME (without VITE_ prefix)');
    console.error('[cPanel] Current values:', {
      hasToken: !!apiToken,
      hasUsername: !!username
    });
    throw new Error('cPanel credentials not configured. Check .env file.');
  }

  console.log('[cPanel] Credentials loaded successfully');
  console.log('[cPanel] Username:', username);
  return { username, apiToken };
}

// Generate a strong random password
function generatePassword(length = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()-_=+[]{}';
  const allChars = uppercase + lowercase + numbers + special;

  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Validate and format input
function validateEmailUser(emailUser: string): string {
  if (typeof emailUser !== 'string') {
    throw new Error('Email user must be a string');
  }

  let sanitized = emailUser.trim();

  // Remove domain if user accidentally included it
  if (sanitized.includes('@')) {
    sanitized = sanitized.split('@')[0];
  }

  // Auto-format names: Convert spaces to dots and lowercase
  // e.g., "Pawan Ojha" -> "pawan.ojha"
  if (/\s/.test(sanitized)) {
    sanitized = sanitized
      .toLowerCase()
      .replace(/\s+/g, '.')  // Replace spaces with dots
      .replace(/\.{2,}/g, '.'); // Replace multiple dots with single dot
    console.log(`[cPanel] Auto-formatted name with spaces: "${emailUser}" -> "${sanitized}"`);
  }

  if (sanitized.length === 0) {
    throw new Error('Email user cannot be empty');
  }

  if (sanitized.length > 64) {
    throw new Error('Email user too long');
  }

  // Only allow alphanumeric, dots, hyphens, underscores
  if (!/^[a-zA-Z0-9._-]+$/.test(sanitized)) {
    throw new Error(`Invalid characters in email user: ${sanitized}`);
  }

  return sanitized;
}

// Check if email exists
async function checkEmailExists(emailUser: string): Promise<any> {
  const credentials = getCpanelCredentials();
  const fullEmail = `${emailUser}@${DOMAIN}`;
  const url = `${CPANEL_SERVER}/execute/Email/list_pops`;

  const res = await axios.get(url, {
    headers: {
      Authorization: `cpanel ${credentials.username}:${credentials.apiToken}`,
    },
    timeout: 10000,
  });

  const allEmails = res.data?.data || [];
  return allEmails.find((e: any) => e.email === fullEmail) || null;
}

// Register IPC handlers
export function registerCpanelHandlers() {
  // Check if email exists
  ipcMain.handle('cpanel:check-email', async (event, emailUser: string) => {
    try {
      const sanitized = validateEmailUser(emailUser);
      const exists = await checkEmailExists(sanitized);
      return { success: true, exists: !!exists, data: exists };
    } catch (error: any) {
      console.error('[cPanel] Check email error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Create email account
  ipcMain.handle('cpanel:create-account', async (event, emailUser: string) => {
    try {
      const sanitized = validateEmailUser(emailUser);
      const credentials = getCpanelCredentials();
      const fullEmail = `${sanitized}@${DOMAIN}`;

      // Check if exists
      const exists = await checkEmailExists(sanitized);
      if (exists) {
        // Log that account already exists
        await logAuditEvent('cpanel:create:error', fullEmail, 'Email account already exists');
        return {
          success: false,
          email: fullEmail,
          message: 'Email account already exists',
        };
      }

      // Generate password
      const newPassword = generatePassword(16);

      // Create account
      const url = `${CPANEL_SERVER}/execute/Email/add_pop`;
      const res = await axios.post(
        url,
        null,
        {
          params: {
            email: sanitized,
            password: newPassword,
            quota: 0,
            domain: DOMAIN,
          },
          headers: {
            Authorization: `cpanel ${credentials.username}:${credentials.apiToken}`,
          },
          timeout: 15000,
        }
      );

      if (res.data?.status === 1) {
        // Log successful creation
        await logAuditEvent('cpanel:create:success', fullEmail, 'Email account created');
        return {
          success: true,
          email: fullEmail,
          password: newPassword,
          message: 'Email account created successfully',
        };
      } else {
        // Log failed creation
        const errorMsg = res.data?.errors?.[0] || 'Failed to create email account';
        await logAuditEvent('cpanel:create:error', fullEmail, errorMsg);
        return {
          success: false,
          email: fullEmail,
          message: errorMsg,
        };
      }
    } catch (error: any) {
      console.error('[cPanel] Create account error:', error.message);
      const fullEmail = `${emailUser}@${DOMAIN}`;
      const errorMsg = error.response?.data?.errors?.[0] || error.message || 'Unknown error';
      // Log error
      await logAuditEvent('cpanel:create:error', fullEmail, errorMsg);
      return {
        success: false,
        email: fullEmail,
        message: errorMsg,
      };
    }
  });

  // Update email password
  ipcMain.handle('cpanel:update-password', async (event, emailUser: string) => {
    try {
      const sanitized = validateEmailUser(emailUser);
      const credentials = getCpanelCredentials();
      const fullEmail = `${sanitized}@${DOMAIN}`;

      // Check if exists
      const exists = await checkEmailExists(sanitized);
      if (!exists) {
        // Log that account does not exist
        await logAuditEvent('cpanel:update:error', fullEmail, 'Email account does not exist');
        return {
          success: false,
          email: fullEmail,
          message: 'Email account does not exist',
        };
      }

      // Generate new password
      const newPassword = generatePassword(16);

      // Update password
      const url = `${CPANEL_SERVER}/execute/Email/passwd_pop`;
      const res = await axios.post(
        url,
        null,
        {
          params: {
            email: fullEmail,
            password: newPassword,
            domain: DOMAIN,
          },
          headers: {
            Authorization: `cpanel ${credentials.username}:${credentials.apiToken}`,
          },
          timeout: 15000,
        }
      );

      if (res.data?.status === 1) {
        // Log successful update
        await logAuditEvent('cpanel:update:success', fullEmail, 'Password updated');
        return {
          success: true,
          email: fullEmail,
          password: newPassword,
          message: 'Password updated successfully',
        };
      } else {
        // Log failed update
        const errorMsg = res.data?.errors?.[0] || 'Failed to update password';
        await logAuditEvent('cpanel:update:error', fullEmail, errorMsg);
        return {
          success: false,
          email: fullEmail,
          message: errorMsg,
        };
      }
    } catch (error: any) {
      console.error('[cPanel] Update password error:', error.message);
      const fullEmail = `${emailUser}@${DOMAIN}`;
      const errorMsg = error.response?.data?.errors?.[0] || error.message || 'Unknown error';
      // Log error
      await logAuditEvent('cpanel:update:error', fullEmail, errorMsg);
      return {
        success: false,
        email: fullEmail,
        message: errorMsg,
      };
    }
  });

  // Delete email account
  ipcMain.handle('cpanel:delete-account', async (event, emailUser: string) => {
    try {
      const sanitized = validateEmailUser(emailUser);
      const credentials = getCpanelCredentials();
      const fullEmail = `${sanitized}@${DOMAIN}`;

      // Check if exists
      const emailData = await checkEmailExists(sanitized);
      if (!emailData) {
        // Log that account does not exist
        await logAuditEvent('cpanel:delete:error', fullEmail, 'Email account does not exist');
        return {
          success: false,
          email: fullEmail,
          message: 'Email account does not exist',
        };
      }

      // Delete account
      const url = `${CPANEL_SERVER}/execute/Email/delete_pop`;
      const res = await axios.post(
        url,
        null,
        {
          params: {
            email: fullEmail,
          },
          headers: {
            Authorization: `cpanel ${credentials.username}:${credentials.apiToken}`,
          },
          timeout: 15000,
        }
      );

      if (res.data?.status === 1) {
        // Log successful deletion
        const dataLost = emailData.diskused || '0';
        await logAuditEvent('cpanel:delete:success', fullEmail, `Account deleted (${dataLost} data lost)`);
        return {
          success: true,
          email: fullEmail,
          message: 'Email account deleted successfully',
          dataLost,
        };
      } else {
        // Log failed deletion
        const errorMsg = res.data?.errors?.[0] || 'Failed to delete email account';
        await logAuditEvent('cpanel:delete:error', fullEmail, errorMsg);
        return {
          success: false,
          email: fullEmail,
          message: errorMsg,
        };
      }
    } catch (error: any) {
      console.error('[cPanel] Delete account error:', error.message);
      const fullEmail = `${emailUser}@${DOMAIN}`;
      const errorMsg = error.response?.data?.errors?.[0] || error.message || 'Unknown error';
      // Log error
      await logAuditEvent('cpanel:delete:error', fullEmail, errorMsg);
      return {
        success: false,
        email: fullEmail,
        message: errorMsg,
      };
    }
  });

  console.log('[cPanel] IPC handlers registered');
}
