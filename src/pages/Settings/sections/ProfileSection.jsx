import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context';
import { userService, fileService } from '../../../services';
import { getCryptoWorkerPool } from '../../../workers';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faPlus, faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';

const ProfileSection = () => {
  const { t } = useTranslation('settings');
  const { user, setUser, avatarUrl, setAvatarUrl, getMasterKey, getMasterKeyBytes } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  // Avatar states
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  // Check if user is a Google user
  const isGoogleUser = user?.authProvider === 'google';

  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user?.displayName]);

  const resizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 512;
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        }, 'image/jpeg', 0.9);
        
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Image load failed'));
      };
    });
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        setError(t('profile.avatar.typeError'));
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        setError(t('profile.avatar.sizeError'));
        return;
    }

    setAvatarLoading(true);
    setError('');

    try {
      const masterKeyBytes = getMasterKeyBytes();
      if (!masterKeyBytes) {
        throw new Error('Vault is locked. Profile updates require an unlocked vault.');
      }

      // 1. Resize
      const resizedBlob = await resizeImage(file);
      const arrayBuffer = await resizedBlob.arrayBuffer();

      // 2. Encrypt
      const workerPool = getCryptoWorkerPool();
      const encryptionResult = await workerPool.encryptFile(
        arrayBuffer,
        masterKeyBytes,
        'avatar.jpg',
        'image/jpeg'
      );

      // 3. Upload via dedicated avatar endpoint (sets isAvatar=true, updates avatarFileId atomically)
      const result = await userService.uploadAvatar(
        new Blob([encryptionResult.encryptedData], { type: 'application/octet-stream' }),
        {
          fileNameEncrypted: encryptionResult.fileNameEncrypted,
          cipherFileKey: encryptionResult.cipherFileKey,
          mimeType: 'image/jpeg',
          sha1Hash: encryptionResult.sha1Hash,
        }
      );

      setUser((prev) => ({ ...prev, avatarFileId: result.avatarFileId }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setError(err.message || t('profile.avatar.error'));
    } finally {
      setAvatarLoading(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    if (!window.confirm(t('profile.avatar.deleteConfirm'))) return;

    setIsDeletingAvatar(true);
    setError('');

    try {
      const oldAvatarId = user?.avatarFileId;
      
      // 1. Update user profile (remove link)
      const updatedUser = await userService.updateProfile({
        avatarFileId: null
      });

      setUser((prev) => ({ ...prev, ...updatedUser }));
      
      // 2. Clean up file from storage (optional but recommended)
      if (oldAvatarId) {
        try {
            await fileService.deleteFile(oldAvatarId);
        } catch (delErr) {
            console.warn('Failed to delete old avatar file:', delErr);
        }
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(t('profile.updateError'));
    } finally {
      setIsDeletingAvatar(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const updatedUser = await userService.updateProfile({
        displayName: displayName.trim() || null,
      });
      setUser((prev) => ({ ...prev, ...updatedUser }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || t('profile.updateError'));
    } finally {
      setLoading(false);
    }
  };

  const renderAvatarPlaceholder = () => {
    const initials = user?.displayName
      ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : user?.email?.[0].toUpperCase() || '?';
    
    return (
      <div className="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 text-2xl font-bold border-2 border-white dark:border-zinc-800 shadow-sm">
        {initials}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Profile Photo Card */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group">
            {avatarLoading ? (
              <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center">
                <FontAwesomeIcon icon={faSpinner} className="animate-spin h-8 w-8 text-primary-500" />
              </div>
            ) : avatarUrl ? (
              <div className="relative">
                <img 
                  src={avatarUrl} 
                  alt="Profile" 
                  className="w-24 h-24 rounded-full object-cover border-2 border-white dark:border-zinc-800 shadow-sm"
                />
                <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/20 transition-all duration-200" />
              </div>
            ) : (
              renderAvatarPlaceholder()
            )}
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarLoading}
              className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full 
                flex items-center justify-center shadow-lg border-2 border-white dark:border-zinc-800 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('profile.avatar.upload')}
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div className="flex flex-col gap-2 flex-1">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              {user?.displayName || user?.email}
            </h3>

            
            <div className="flex gap-4 mt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarLoading}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
              >
                {t('profile.avatar.upload')}
              </button>
              
              {user?.avatarFileId && (
                <button
                  type="button"
                  onClick={handleDeleteAvatar}
                  disabled={isDeletingAvatar || avatarLoading}
                  className="text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                >
                  {isDeletingAvatar ? t('common:actions.loading') : t('profile.avatar.remove')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Information Card */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {t('profile.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('profile.description')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display Name */}
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('profile.fullName')}
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('profile.fullNamePlaceholder')}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-600 
                text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-lg text-sm 
                transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              maxLength={255}
            />
            {isGoogleUser && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 italic">
                {/* Note: You can now change your display name locally even if you use Google. */}
                This will only change your name on Aamenn.
              </p>
            )}
          </div>

          {/* Email (Read-only) */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('profile.email')}
            </label>
            <input
              id="email"
              type="email"
              value={user?.email || ''}
              readOnly
              disabled
              className="w-full px-4 py-3 bg-gray-100 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-700 
                rounded-lg text-gray-500 dark:text-gray-400 text-sm cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
              {t('profile.emailDescription')}
            </p>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
              <FontAwesomeIcon icon={faCheck} className="w-5 h-5" />
              {t('profile.updateSuccess')}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
              {error}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-primary-500 text-white text-sm font-medium rounded-lg
                hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                dark:focus:ring-offset-zinc-800"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin h-4 w-4" />
                  {t('common:actions.loading')}
                </span>
              ) : (
                t('profile.saveChanges')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileSection;
