import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  emailUser: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  emailUser,
  onConfirm,
  onCancel,
}) => {
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (confirmText === 'DELETE') {
      onConfirm();
      setConfirmText(''); // Reset for next time
    }
  };

  const handleCancel = () => {
    setConfirmText(''); // Reset
    onCancel();
  };

  const isDeleteEnabled = confirmText === 'DELETE';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
      onClick={handleCancel}
    >
      <div
        className="relative w-full max-w-md rounded-xl shadow-2xl border"
        style={{
          backgroundColor: '#1f1f1f',
          borderColor: '#3c3c3c',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-[#2d2d2b] transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {/* Header */}
        <div className="p-6 border-b" style={{ borderColor: '#3c3c3c' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Confirm Account Deletion
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                This action cannot be undone
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
            <p className="text-sm text-gray-300">
              You are about to permanently delete the email account:
            </p>
            <p className="text-base font-semibold text-white mt-2">
              {emailUser.includes('@') ? emailUser : `${emailUser}@entegrasources.com.np`}
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Type <span className="font-bold text-red-500">DELETE</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-4 py-2.5 rounded-lg border text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
              style={{
                backgroundColor: '#232321',
                borderColor: confirmText === 'DELETE' ? '#ef4444' : '#3c3c3c',
              }}
              autoFocus
            />
          </div>

          <div className="text-xs text-gray-400 space-y-1">
            <p>⚠️ All emails and data will be permanently lost</p>
            <p>⚠️ You must type DELETE in capital letters</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex gap-3" style={{ borderColor: '#3c3c3c' }}>
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border text-white text-sm font-medium hover:bg-[#2d2d2b] transition-colors"
            style={{ borderColor: '#3c3c3c' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isDeleteEnabled}
            className={`flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all ${
              isDeleteEnabled
                ? 'bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 shadow-lg'
                : 'bg-gray-700 cursor-not-allowed opacity-50'
            }`}
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
};
