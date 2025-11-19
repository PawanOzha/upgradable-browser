// cPanel Service - Uses IPC proxy for secure API access
// All credentials and API calls are handled in the main process

declare global {
  interface Window {
    ipc: {
      invoke(channel: string, ...args: any[]): Promise<any>;
    };
  }
}

export interface EmailAccount {
  email: string;
  diskquota?: string;
  diskused?: string;
}

export interface CpanelResponse {
  status: number;
  data?: any;
  errors?: string[];
  messages?: string[];
}

// Helper function to format email properly (avoid double domain)
function formatEmail(emailUser: string): string {
  if (emailUser.includes('@')) {
    return emailUser; // Already has domain
  }
  return `${emailUser}@entegrasources.com.np`;
}

// Check if email account exists
export async function checkEmailExists(emailUser: string): Promise<EmailAccount | null> {
  try {
    const result = await window.ipc.invoke('cpanel:check-email', emailUser);

    if (result.success && result.exists) {
      return result.data;
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to check email');
    }

    return null;
  } catch (err: any) {
    throw new Error(`Failed to check email: ${err.message}`);
  }
}

// Create new email account
export async function createEmailAccount(emailUser: string): Promise<{
  success: boolean;
  email: string;
  password?: string;
  message: string;
}> {
  try {
    const result = await window.ipc.invoke('cpanel:create-account', emailUser);
    return result;
  } catch (err: any) {
    return {
      success: false,
      email: formatEmail(emailUser),
      message: err.message || 'Unknown error',
    };
  }
}

// Update email account password
export async function updateEmailPassword(emailUser: string): Promise<{
  success: boolean;
  email: string;
  password?: string;
  message: string;
}> {
  try {
    const result = await window.ipc.invoke('cpanel:update-password', emailUser);
    return result;
  } catch (err: any) {
    return {
      success: false,
      email: formatEmail(emailUser),
      message: err.message || 'Unknown error',
    };
  }
}

// Delete email account
export async function deleteEmailAccount(emailUser: string): Promise<{
  success: boolean;
  email: string;
  message: string;
  dataLost?: string;
}> {
  try {
    const result = await window.ipc.invoke('cpanel:delete-account', emailUser);
    return result;
  } catch (err: any) {
    return {
      success: false,
      email: formatEmail(emailUser),
      message: err.message || 'Unknown error',
    };
  }
}
