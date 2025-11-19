import { useEffect } from 'react';
import { Bell, X, UserPlus, KeyRound, UserMinus, Mail } from 'lucide-react';

interface ToastProps {
  message: string;
  keywords: string[];
  onClose: () => void;
  duration?: number;
  onAction?: (action: string, data: any) => void;
}

// Extract names from message (handles multi-line names)
function extractNamesFromMessage(message: string): string[] {
  const lines = message.split('\n').map(line => line.trim());
  const names: string[] = [];

  // Skip common header/footer lines
  const skipPatterns = [
    /^dear/i,
    /^please/i,
    /^thank/i,
    /^regards/i,
    /^best/i,
    /^team/i,
    /^hi/i,
    /^hello/i,
    /^create/i,
    /^reset/i,
    /^delete/i,
    /^password/i,
    /^email/i,
    /^official/i,
    /^new joiner/i,
    /^following/i,
    /^\s*$/  // empty lines
  ];

  for (const line of lines) {
    // Skip if line matches any skip pattern
    if (skipPatterns.some(pattern => pattern.test(line))) {
      continue;
    }

    // Skip if line contains email address (already extracted separately)
    if (line.includes('@')) {
      continue;
    }

    // If line looks like a name (contains letters, possibly spaces, 2-50 chars)
    if (/^[a-zA-Z\s]{2,50}$/.test(line)) {
      names.push(line.trim());
    }
  }

  return names;
}

// Detect action from keywords and message
function detectAction(keywords: string[], message: string): {
  action: string;
  icon: any;
  label: string;
  email?: string;
  names?: string[];
} | null {
  const lowerMessage = message.toLowerCase();

  // Extract email if present
  const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  const email = emailMatch ? emailMatch[1] : '';

  // Extract names from message
  const names = extractNamesFromMessage(message);

  // Detect CREATE action
  if (keywords.includes('create') || lowerMessage.includes('create account') || lowerMessage.includes('new user')) {
    return { action: 'create', icon: UserPlus, label: 'Create Account', email, names };
  }

  // Detect RESET/UPDATE PASSWORD action
  if (keywords.includes('reset') || keywords.includes('password') || lowerMessage.includes('reset password') || lowerMessage.includes('change password')) {
    return { action: 'reset', icon: KeyRound, label: 'Reset Password', email, names };
  }

  // Detect DELETE action
  if (keywords.includes('delete') || keywords.includes('remove') || lowerMessage.includes('delete account') || lowerMessage.includes('remove user')) {
    return { action: 'delete', icon: UserMinus, label: 'Delete Account', email, names };
  }

  // Detect EMAIL action (generic email related)
  if (keywords.includes('email') && email) {
    return { action: 'email', icon: Mail, label: 'Manage Email', email, names };
  }

  return null;
}

export default function Toast({ message, keywords, onClose, onAction, duration = 8000 }: ToastProps) {
  const detectedAction = detectAction(keywords, message);

  useEffect(() => {
    console.log('[Toast] 🎨 Rendering notification toast');
    console.log('[Toast] 📋 Message:', message);
    console.log('[Toast] 🏷️ Keywords:', keywords);
    console.log('[Toast] 🎯 Detected Action:', detectedAction);
    console.log('[Toast] ⏱️ Duration:', duration);

    const timer = setTimeout(() => {
      console.log('[Toast] ⏰ Auto-closing after', duration, 'ms');
      onClose();
    }, duration);

    return () => {
      console.log('[Toast] 🧹 Cleanup timer');
      clearTimeout(timer);
    };
  }, [duration, onClose]);

  console.log('[Toast] 🖼️ Rendering Toast component');

  const handleActionClick = () => {
    if (detectedAction && onAction) {
      console.log('[Toast] 🚀 Executing action:', detectedAction.action);
      console.log('[Toast] 📧 Email:', detectedAction.email);
      console.log('[Toast] 👥 Names:', detectedAction.names);
      onAction(detectedAction.action, {
        email: detectedAction.email,
        names: detectedAction.names || [],
        message: message,
        keywords: keywords
      });
      onClose();
    }
  };

  return (
    <div
      className="fixed bottom-4 left-4 z-[10000] animate-slide-in"
      style={{
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-lg shadow-2xl max-w-sm"
        style={{
          backgroundColor: '#1e1e1c',
          border: '1px solid #3c3c3c',
        }}
      >
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <Bell className="w-4 h-4 text-green-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-200 mb-1">
            Keyword Detected
          </div>
          <div className="flex items-center gap-1 flex-wrap mb-2">
            {keywords.slice(0, 3).map((keyword, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: '#22c55e20',
                  color: '#22c55e',
                }}
              >
                {keyword}
              </span>
            ))}
            {keywords.length > 3 && (
              <span className="text-[10px] text-gray-500">
                +{keywords.length - 3} more
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-400 line-clamp-2">
            {message.length > 60 ? `${message.substring(0, 60)}...` : message}
          </div>

          {/* Action Button */}
          {detectedAction && (
            <button
              onClick={handleActionClick}
              className="mt-2 px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              style={{
                backgroundColor: '#22c55e',
                color: '#000',
              }}
            >
              {detectedAction.icon && <detectedAction.icon className="w-3 h-3" />}
              {detectedAction.label}
            </button>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded hover:bg-gray-800 transition-colors"
        >
          <X className="w-3 h-3 text-gray-500" />
        </button>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
