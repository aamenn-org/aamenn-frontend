import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context';
import { decryptFilename } from '../utils/crypto';

/**
 * Batch-decrypts names for an array of file or folder objects.
 * Results are cached per encrypted-name string so each name is only
 * decrypted once across re-renders.
 *
 * @param {Array}   items    - Array of file or folder objects
 * @param {boolean} isFolder - True when items are folders
 * @returns {Map<string, string>} Map of itemId → decryptedName
 */
const useDecryptedNames = (items = [], isFolder = false) => {
  const { getMasterKey, hasMasterKey } = useAuth();
  const [namesMap, setNamesMap] = useState(() => new Map());
  // Persistent cache keyed by encrypted-name string — survives re-renders
  const cacheRef = useRef(new Map());

  useEffect(() => {
    if (!hasMasterKey() || items.length === 0) {
      setNamesMap(new Map());
      return;
    }

    let cancelled = false;

    const decrypt = async () => {
      const masterKey = getMasterKey();
      const cache = cacheRef.current;
      const result = new Map();
      const toDecrypt = [];

      // Separate already-cached from needs-decrypting
      for (const item of items) {
        const id = isFolder ? item.folderId : (item.fileId || item.id);
        const encKey = isFolder ? item.nameEncrypted : item.fileNameEncrypted;

        if (!encKey) {
          result.set(id, isFolder ? 'Folder' : 'File');
        } else if (cache.has(encKey)) {
          result.set(id, cache.get(encKey));
        } else {
          toDecrypt.push({ id, encKey });
        }
      }

      // Decrypt all pending names in parallel
      if (toDecrypt.length > 0) {
        const decrypted = await Promise.allSettled(
          toDecrypt.map(({ encKey }) => decryptFilename(encKey, masterKey))
        );

        toDecrypt.forEach(({ id, encKey }, i) => {
          const res = decrypted[i];
          const name = res.status === 'fulfilled'
            ? res.value
            : (isFolder ? 'Encrypted Folder' : 'Encrypted File');
          cache.set(encKey, name);
          result.set(id, name);
        });
      }

      if (!cancelled) setNamesMap(result);
    };

    decrypt();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, hasMasterKey, getMasterKey]);

  return namesMap;
};

export default useDecryptedNames;
