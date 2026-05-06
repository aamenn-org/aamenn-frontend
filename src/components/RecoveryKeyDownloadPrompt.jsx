import { useState } from 'react';

/**
 * Simple modal to prompt new users to download their recovery key
 * Shows on first visit to photos/dashboard after registration
 */
const RecoveryKeyDownloadPrompt = ({ recoveryPhrase, onDismiss }) => {
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = () => {
    const content = `Aamenn Recovery Key\n\n${recoveryPhrase}\n\nSave this key safely. You'll need it to recover your account if you forget your password.\n\nGenerated: ${new Date().toLocaleDateString()}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aamenn-recovery-key.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setDownloaded(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">
          🔑 Save Your Recovery Key
        </h2>
        
        <p className="text-gray-600 mb-4">
          Download your recovery key now. You'll need it if you ever forget your password.
        </p>

        <div className="bg-gray-100 rounded p-3 mb-4 font-mono text-sm text-center text-black">
          {recoveryPhrase}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
              downloaded
                ? 'bg-green-500 text-white'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {downloaded ? '✓ Downloaded' : 'Download Key'}
          </button>
          
          <button
            onClick={onDismiss}
            disabled={!downloaded}
            className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
              downloaded
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {downloaded ? 'Continue' : 'Download First'}
          </button>
        </div>

        {!downloaded && (
          <p className="text-xs text-gray-500 mt-3 text-center">
            Please download your recovery key before continuing
          </p>
        )}
      </div>
    </div>
  );
};

export default RecoveryKeyDownloadPrompt;
