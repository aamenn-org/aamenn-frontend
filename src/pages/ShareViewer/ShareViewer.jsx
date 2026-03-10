import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { shareService } from '../../services';
import { decryptFileKeyWithShareKey, decryptTextWithShareKey } from '../../utils/crypto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faXmark, faDownload, faCircleExclamation, faImage, faFolder, faFile } from '@fortawesome/free-solid-svg-icons';

// Component that decrypts and displays a single shared file thumbnail
const SharedFileThumbnail = ({ file, shareKeyRaw, encryptedFileKey }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file.thumbSmallUrl || !shareKeyRaw || !encryptedFileKey) return;
    if (!file.mimeType?.startsWith('image/')) return;

    let cancelled = false;

    const decrypt = async () => {
      try {
        setDecrypting(true);

        // Decrypt file key using folder share key
        const fileKey = await decryptFileKeyWithShareKey(shareKeyRaw, encryptedFileKey);

        // Download encrypted thumbnail
        const response = await fetch(file.thumbSmallUrl);
        if (!response.ok) throw new Error('Download failed');
        const encryptedData = await response.arrayBuffer();

        // Decrypt thumbnail: first 12 bytes = IV, rest = ciphertext
        const encArray = new Uint8Array(encryptedData);
        const iv = encArray.slice(0, 12);
        const ciphertext = encArray.slice(12);
        const decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          fileKey,
          ciphertext
        );

        if (!cancelled) {
          const blob = new Blob([decryptedData], { type: 'image/jpeg' });
          setBlobUrl(URL.createObjectURL(blob));
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setDecrypting(false);
      }
    };

    decrypt();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [file.thumbSmallUrl, shareKeyRaw, encryptedFileKey]);

  if (decrypting) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (blobUrl) {
    return <img src={blobUrl} alt="" className="w-full h-full object-cover" />;
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <FontAwesomeIcon icon={failed ? faFile : faImage} className="w-10 h-10 text-gray-300" />
    </div>
  );
};

const ShareViewer = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareData, setShareData] = useState(null);
  const [shareKeyRaw, setShareKeyRaw] = useState(null);
  const [decryptedFilename, setDecryptedFilename] = useState(null);
  const [fileKey, setFileKey] = useState(null);

  // State for single-file share decryption
  const [blobUrl, setBlobUrl] = useState(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState(null);

  // Decrypt single file when we have the file key and share data
  useEffect(() => {
    if (!fileKey || !shareData?.data?.downloadUrl) return;

    let cancelled = false;

    const decryptFile = async () => {
      try {
        setIsDecrypting(true);
        setDecryptError(null);

        const response = await fetch(shareData.data.downloadUrl);
        const encryptedData = await response.arrayBuffer();
        const encArray = new Uint8Array(encryptedData);
        const iv = encArray.slice(0, 12);
        const ciphertext = encArray.slice(12);

        const decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          fileKey,
          ciphertext
        );

        if (!cancelled) {
          const blob = new Blob([decryptedData], { type: shareData.data.mimeType });
          setBlobUrl(URL.createObjectURL(blob));
          setIsDecrypting(false);
        }
      } catch (err) {
        if (!cancelled) {
          setDecryptError(err);
          setIsDecrypting(false);
        }
      }
    };

    decryptFile();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [fileKey, shareData?.data?.downloadUrl]);

  useEffect(() => {
    loadShare();
  }, [slug]);

  const loadShare = async () => {
    try {
      setLoading(true);
      setError(null);

      const fragment = window.location.hash.substring(1);
      const params = new URLSearchParams(fragment);
      const keyFromUrl = params.get('k');

      if (!keyFromUrl) throw new Error('Share key missing from URL');

      setShareKeyRaw(keyFromUrl);

      const response = await shareService.resolveShare(slug);
      setShareData(response);

      if (response.type === 'file') {
        try {
          const decryptedFileKey = await decryptFileKeyWithShareKey(keyFromUrl, response.shareKey);
          setFileKey(decryptedFileKey);
          setDecryptedFilename('Shared File');
        } catch {
          setDecryptedFilename('Shared File');
        }
      } else if (response.type === 'folder') {
        // Decrypt folder name using the share key
        try {
          const folderName = await decryptTextWithShareKey(keyFromUrl, response.shareKey);
          setDecryptedFilename(folderName);
        } catch {
          // Fallback: derive from slug
          setDecryptedFilename(
            slug.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          );
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to load share:', err);
      setError(err.message || 'Failed to load shared content');
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = decryptedFilename || 'shared-file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon icon={faTriangleExclamation} className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Share Not Found</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (shareData?.type === 'file') {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="relative w-full h-full flex items-center justify-center">
          <button onClick={() => navigate('/')} className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors">
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
          </button>
          <button onClick={handleDownload} disabled={isDecrypting || !blobUrl} className="absolute top-4 left-4 z-10 px-4 py-2 bg-black/50 backdrop-blur-sm text-white rounded-lg hover:bg-black/70 transition-colors flex items-center gap-2 disabled:opacity-50">
            <FontAwesomeIcon icon={faDownload} className="w-5 h-5" />
            {isDecrypting ? 'Decrypting...' : 'Download'}
          </button>
          {isDecrypting ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-white">Decrypting...</p>
            </div>
          ) : blobUrl && shareData.data.mimeType?.startsWith('image/') ? (
            <img src={blobUrl} alt="Shared image" className="max-w-full max-h-full object-contain" />
          ) : decryptError ? (
            <div className="text-center text-white">
              <FontAwesomeIcon icon={faCircleExclamation} className="w-8 h-8 text-red-400 mb-4" />
              <p>Failed to decrypt image</p>
            </div>
          ) : (
            <div className="text-center text-white">
              <p className="text-lg mb-2">{decryptedFilename || 'Shared File'}</p>
              <p className="text-sm text-gray-300">
                {(shareData.data.sizeBytes / 1024 / 1024).toFixed(2)} MB • {shareData.data.mimeType}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (shareData?.type === 'folder') {
    const fileKeys = shareData.fileKeys || {};

    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <FontAwesomeIcon icon={faFolder} className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {decryptedFilename || 'Shared Folder'}
                </h1>
                <p className="text-sm text-gray-500">
                  {shareData.data.totalFiles} {shareData.data.totalFiles === 1 ? 'file' : 'files'}
                </p>
              </div>
            </div>

            {shareData.data.files.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>This folder is empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {shareData.data.files.map((file) => (
                  <div
                    key={file.fileId}
                    className="aspect-square rounded-lg overflow-hidden relative group"
                  >
                    <SharedFileThumbnail
                      file={file}
                      shareKeyRaw={shareKeyRaw}
                      encryptedFileKey={fileKeys[file.fileId]}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 text-center text-sm text-gray-500">
              <p>This folder is end-to-end encrypted.</p>
              <p>Only people with this link can access it.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (shareData?.type === 'album') {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Shared Album</h1>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {shareData.data.files.map((file) => (
                <div key={file.fileId} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  {file.thumbSmallUrl ? (
                    <img src={file.thumbSmallUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FontAwesomeIcon icon={faImage} className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 text-center text-sm text-gray-500">
              <p>This album is end-to-end encrypted.</p>
              <p>Only people with this link can access it.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ShareViewer;
