# File Object Structure - Standard Reference

This document defines the **canonical structure** of file objects returned by the backend API to eliminate uncertainty in variable access patterns.

## Standard File Object

All file objects returned from the backend API (`/files`, `/files/:id`, etc.) follow this structure:

```typescript
interface File {
  // Primary identifier - ALWAYS use this
  fileId: string;                    // UUID - PRIMARY KEY
  
  // Encrypted metadata
  fileNameEncrypted: string;         // Base64 encrypted filename
  cipherFileKey: string;             // Base64 encrypted file key
  
  // File properties
  mimeType: string;                  // MIME type (e.g., 'image/jpeg', 'application/pdf')
  sizeBytes: number;                 // File size in bytes
  sha1Hash: string;                  // SHA1 hash of encrypted content
  
  // Timestamps
  createdAt: string;                 // ISO 8601 timestamp
  updatedAt: string;                 // ISO 8601 timestamp
  
  // Download URLs (signed, time-limited)
  downloadUrl: string;               // Signed B2 URL for encrypted file
  
  // Thumbnail URLs (for images/videos only)
  thumbSmallUrl?: string;            // Signed B2 URL for small thumbnail
  thumbMediumUrl?: string;           // Signed B2 URL for medium thumbnail
  cipherThumbSmallKey?: string;      // Encrypted thumbnail key
  cipherThumbMediumKey?: string;     // Encrypted thumbnail key
  
  // Image/Video metadata (optional)
  width?: number;                    // Original width in pixels
  height?: number;                   // Original height in pixels
  duration?: number;                 // Video duration in seconds
  blurhash?: string;                 // Blurhash for placeholder
  
  // User metadata
  isFavorite: boolean;               // Favorite status
  userId: string;                    // Owner user ID
}
```

## Coding Standards

### ✅ CORRECT - Use these patterns:

```javascript
// File ID access
const fileId = file.fileId;

// Filename access (after decryption)
const fileName = decryptedFileName || 'Unknown';

// Direct property access
const mimeType = file.mimeType;
const size = file.sizeBytes;
const isFavorite = file.isFavorite;
```

### ❌ INCORRECT - Avoid these patterns:

```javascript
// DON'T use uncertain fallback chains
const fileId = file.fileId || file.id;  // ❌ file.id doesn't exist
const fileName = file.fileName || file.name || file.originalName;  // ❌ Confusing

// DON'T use non-existent properties
const id = file.id;  // ❌ Use file.fileId
const name = file.name;  // ❌ Use decrypted filename
```

## Decrypted Filename Handling

Filenames are **always encrypted** on the backend. To display them:

1. **Decrypt** using `decryptFilename(file.fileNameEncrypted, masterKey)`
2. **Store** in local state (e.g., `decryptedFileName`)
3. **Display** with simple fallback: `decryptedFileName || 'Unknown'`

```javascript
// Example pattern
const [decryptedFileName, setDecryptedFileName] = useState(null);

useEffect(() => {
  const decrypt = async () => {
    if (!file?.fileNameEncrypted || !getMasterKey()) {
      setDecryptedFileName(null);
      return;
    }
    try {
      const name = await decryptFilename(file.fileNameEncrypted, getMasterKey());
      setDecryptedFileName(name);
    } catch (err) {
      console.warn('Failed to decrypt filename:', err);
      setDecryptedFileName(null);
    }
  };
  decrypt();
}, [file?.fileNameEncrypted, getMasterKey]);

// Usage
const displayName = decryptedFileName || 'Unknown';
```

## File Identification

**Always use `file.fileId` as the unique identifier:**

```javascript
// ✅ Correct
files.map((file) => <Component key={file.fileId} file={file} />)

// ✅ Correct
const index = files.findIndex((f) => f.fileId === targetFile.fileId);

// ✅ Correct
await fileService.updateFile(file.fileId, { isFavorite: true });
```

## Common Operations

### Comparing Files
```javascript
// ✅ Correct
if (fileA.fileId === fileB.fileId) { ... }

// ❌ Incorrect
if ((fileA.fileId || fileA.id) === (fileB.fileId || fileB.id)) { ... }
```

### Selecting Files
```javascript
// ✅ Correct
const fileId = file.fileId;
setSelectedFiles((prev) => [...prev, fileId]);

// ❌ Incorrect
const fileId = file.fileId || file.id;
```

### Updating Files
```javascript
// ✅ Correct - Rename
await fileService.updateFile(file.fileId, {
  fileNameEncrypted: encryptedNewName,
});

// ✅ Correct - Toggle favorite
await fileService.updateFile(file.fileId, {
  isFavorite: !file.isFavorite,
});
```

## Why This Matters

1. **Type Safety**: Consistent property names prevent runtime errors
2. **Maintainability**: Single source of truth for data structure
3. **Performance**: No unnecessary fallback checks
4. **Clarity**: Code is self-documenting and predictable

## Migration Checklist

When working with file objects, verify:

- [ ] Using `file.fileId` (not `file.id`)
- [ ] Decrypting `file.fileNameEncrypted` for display
- [ ] No uncertain fallback chains (`||` operators)
- [ ] Direct property access without optional chaining where guaranteed
- [ ] Consistent patterns across all components

## Backend API Endpoints

All these endpoints return file objects with the structure above:

- `GET /files` - List files (paginated)
- `GET /files/:fileId` - Get single file
- `POST /files/batch` - Get multiple files
- `PATCH /files/:fileId` - Update file metadata
- `DELETE /files/:fileId` - Delete file
- `GET /files?favorite=true` - List favorites

## Last Updated

February 15, 2026 - Standardized after removing all uncertain variable access patterns
