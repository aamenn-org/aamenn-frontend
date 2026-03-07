import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { shareService } from '../../services';
import { decryptFileKeyWithShareKey, decryptFilename } from '../../utils/crypto';

const ShareViewer = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareData, setShareData] = useState(null);
  const [shareKey, setShareKey] = useState(null);
  const [decryptedFilename, setDecryptedFilename] = useState(null);
  const [fileKey, setFileKey] = useState(null);

  // State for decrypted blob URL
  const [blobUrl, setBlobUrl] = useState(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState(null);

  // Decrypt file when we have the file key and share data
  useEffect(() => {
    if (!fileKey || !shareData?.data?.downloadUrl) {
      return;
    }

    const decryptFile = async () => {
      try {
        setIsDecrypting(true);
        setDecryptError(null);

        console.log('🔐 Starting manual file decryption...');

        // Download encrypted file
        const response = await fetch(shareData.data.downloadUrl);
        const encryptedData = await response.arrayBuffer();

        console.log('📥 File downloaded:', {
          size: encryptedData.byteLength,
          sizeKB: (encryptedData.byteLength / 1024).toFixed(2) + ' KB'
        });

        // Decrypt file using the file key we already have
        const encArray = new Uint8Array(encryptedData);
        const iv = encArray.slice(0, 12);
        const ciphertext = encArray.slice(12);

        console.log('🔐 Decrypting with fileKey...');
        const decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          fileKey,
          ciphertext
        );

        console.log('✅ Decryption successful:', {
          decryptedSize: decryptedData.byteLength,
          decryptedSizeKB: (decryptedData.byteLength / 1024).toFixed(2) + ' KB'
        });

        // Create blob URL
        const blob = new Blob([decryptedData], { type: shareData.data.mimeType });
        const url = URL.createObjectURL(blob);

        setBlobUrl(url);
        setIsDecrypting(false);
      } catch (err) {
        console.error('❌ Manual decryption failed:', err);
        setDecryptError(err);
        setIsDecrypting(false);
      }
    };

    decryptFile();

    // Cleanup
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [fileKey, shareData?.data?.downloadUrl]);

  useEffect(() => {
    loadShare();
  }, [slug]);

  const loadShare = async () => {
    try {
      setLoading(true);
      setError(null);

      // Extract share key from URL fragment
      const fragment = window.location.hash.substring(1);
      const params = new URLSearchParams(fragment);
      const keyFromUrl = params.get('k');

      if (!keyFromUrl) {
        throw new Error('Share key missing from URL');
      }

      setShareKey(keyFromUrl);

      // Resolve share link
      const response = await shareService.resolveShare(slug);
      setShareData(response);

      // Decrypt file key if it's a file share
      if (response.type === 'file') {
        console.log('Share decryption debug:', {
          keyFromUrl: keyFromUrl?.substring(0, 20) + '...',
          shareKeyFromResponse: response.shareKey?.substring(0, 20) + '...',
          keyLength: keyFromUrl?.length,
          responseKeyLength: response.shareKey?.length
        });

        try {
          // Decrypt file key with share key
          const decryptedFileKey = await decryptFileKeyWithShareKey(
            keyFromUrl,
            response.shareKey
          );

          console.log('File key decrypted successfully');
          // Store the decrypted file key for use with useDecryptedBlobUrl
          setFileKey(decryptedFileKey);

          // Note: Filenames are encrypted with master key, not file key
          // For shares, we cannot decrypt filenames without the master key
          // So we show a generic name
          setDecryptedFilename('Shared File');
        } catch (err) {
          console.error('Failed to decrypt file key:', err);
          setDecryptedFilename('Shared File');
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
    if (!shareData || shareData.type !== 'file') return;

    try {
      // Auto-download by creating a temporary link element
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = decryptedFilename || 'shared-file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download file:', err);
    }
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
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Share Not Found
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (shareData?.type === 'file') {
    // Create a file object for PhotoViewer
    const sharedFile = {
      fileId: shareData.data.fileId,
      fileNameEncrypted: shareData.data.fileNameEncrypted,
      mimeType: shareData.data.mimeType,
      sizeBytes: shareData.data.sizeBytes,
      width: shareData.data.width,
      height: shareData.data.height,
      duration: shareData.data.duration,
      // Use decrypted blob URL as display URL
      thumbSmallUrl: blobUrl,
      thumbMediumUrl: blobUrl,
      thumbLargeUrl: blobUrl,
      downloadUrl: shareData.data.downloadUrl,
    };

    return (
      <div className="fixed inset-0 z-50 bg-black">
        {/* Simple PhotoViewer-like interface */}
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Close button */}
          <button
            onClick={() => navigate('/')}
            className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={isDecrypting || !blobUrl}
            className="absolute top-4 left-4 z-10 px-4 py-2 bg-black/50 backdrop-blur-sm text-white rounded-lg hover:bg-black/70 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {isDecrypting ? 'Decrypting...' : 'Download'}
          </button>

          {/* Image display */}
          {isDecrypting ? (
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-white">Decrypting...</p>
              </div>
            </div>
          ) : blobUrl && shareData.data.mimeType.startsWith('image/') ? (
            <img
              src={blobUrl}
              alt="Shared image"
              className="max-w-full max-h-full object-contain"
            />
          ) : decryptError ? (
            <div className="text-center text-white">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <p className="text-white">Failed to decrypt image</p>
              <p className="text-sm text-gray-300 mt-2">You can still download the file.</p>
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

  if (shareData?.type === 'album') {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              Shared Album
            </h1>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {shareData.data.files.map((file) => (
                <div
                  key={file.fileId}
                  className="aspect-square bg-gray-100 rounded-lg overflow-hidden"
                >
                  {file.thumbSmallUrl ? (
                    <img
                      src={file.thumbSmallUrl}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg
                        className="w-12 h-12 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {shareData.data.pagination.totalPages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                <button
                  disabled={shareData.data.pagination.page === 1}
                  className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2">
                  Page {shareData.data.pagination.page} of{' '}
                  {shareData.data.pagination.totalPages}
                </span>
                <button
                  disabled={
                    shareData.data.pagination.page ===
                    shareData.data.pagination.totalPages
                  }
                  className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

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
