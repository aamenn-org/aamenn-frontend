# Upload UI Improvements

## Overview
Simplified the upload progress panel UI and addressed image display issues after upload completion.

## Changes Made

### 1. Simplified Upload Progress Panel

**File:** `src/components/gallery/UploadProgressPanel.jsx`

**Removed:**
- Detailed per-file progress bars
- Individual file status (hashing, encrypting, uploading)
- Verbose status messages
- Separate "Clear Failed" and "Clear Interrupted" buttons

**Simplified To:**
- Clean header with upload count (e.g., "Uploading 3/10")
- Single progress bar showing overall completion
- Simple status: "Uploading..." or "✓ X uploaded" / "✗ X failed"
- Single "Retry Failed" button when failures occur
- Working close (X) button that clears all uploads
- Dark mode support

**New UI Structure:**
```
┌─────────────────────────────┐
│ Uploading      3/10      [X]│ ← Header with close button
├─────────────────────────────┤
│ ████████░░░░░░░░░░░░░░░░░░ │ ← Progress bar only
├─────────────────────────────┤
│ Uploading...                │ ← Simple status
│ ✓ 3 uploaded  ✗ 1 failed   │
├─────────────────────────────┤
│    [Retry Failed]           │ ← Retry button (if failures)
└─────────────────────────────┘
```

### 2. Fixed Button Functionality

**Close Button (X):**
- Now always visible in header
- Calls `onClear()` to close the panel
- Works for both in-progress and completed uploads

**Retry Failed Button:**
- Only shows when `failed > 0`
- Clean blue button with hover effect
- Calls `onRetryFailed()` to retry all failed uploads

**Removed:**
- "Cancel All" button (too destructive, users can close panel)
- "Clear Failed" / "Clear Interrupted" buttons (replaced with single close button)

### 3. Blurred Images After Upload

**Issue:** Uploaded images appear blurred (showing blurhash) instead of small thumbnails

**Root Cause:** 
When files are uploaded, they're added to the gallery immediately via `onFileUploaded` callback. The backend response includes thumbnail URLs (`thumbSmallUrl`, `cipherThumbSmallKey`, etc.), but there may be a delay in loading them or the URLs might not be properly included in the response.

**PhotoCard Logic:**
```javascript
// PhotoCard checks for thumbnail data
if (!fileId || !file.thumbSmallUrl || !file.cipherThumbSmallKey || !hasMasterKey()) {
  return; // Shows blurhash if any of these are missing
}
```

**Verification Needed:**
1. Check that backend upload response includes:
   - `thumbSmallUrl`
   - `cipherThumbSmallKey`
   - `thumbMediumUrl`
   - `cipherThumbMediumKey`
   - `thumbLargeUrl`
   - `cipherThumbLargeKey`

2. Verify `onFileUploaded` callback receives complete file object:
```javascript
onFileUploaded: (uploadedFile) => {
  console.log('[Dashboard] File uploaded:', uploadedFile);
  // Should log thumbnail URLs
  setFiles((prev) => [uploadedFile, ...prev]);
}
```

**Temporary Workaround:**
If thumbnails are missing, PhotoCard will:
1. Show blurhash placeholder
2. Display file icon (image/video)
3. Show loading spinner while attempting to load

**Permanent Fix:**
Ensure backend `uploadFileWithThumbnails` returns complete file object with all thumbnail URLs in the response. The upload endpoint should return the same structure as `getFile` endpoint.

---

## Testing Checklist

- [x] Upload progress panel shows simplified UI
- [x] Close button (X) works and closes panel
- [x] Progress bar updates smoothly
- [x] Status shows "Uploading..." during upload
- [x] Status shows "✓ X uploaded" when complete
- [x] Status shows "✗ X failed" when failures occur
- [x] Retry button appears only when failures exist
- [x] Retry button triggers retry for failed uploads
- [ ] Uploaded images show small thumbnails (not blurhash)
- [ ] Verify backend response includes thumbnail URLs
- [ ] Test with multiple file uploads
- [ ] Test dark mode appearance

---

## Known Issues

### Blurred Images After Upload
**Status:** Needs backend verification

**Steps to Reproduce:**
1. Upload image files
2. Wait for upload to complete
3. Observe images in gallery appear blurred (blurhash only)

**Expected:** Images should show small thumbnails immediately after upload

**Actual:** Images show blurhash placeholder

**Next Steps:**
1. Add console logging to verify backend response structure
2. Check if `thumbSmallUrl` is included in upload response
3. If missing, update backend to include thumbnail URLs in upload response
4. If present, check if there's a caching/loading delay issue

---

## Code Changes Summary

### UploadProgressPanel.jsx
- Removed detailed file list and per-file progress
- Simplified to single progress bar
- Added simple status messages
- Fixed close button to always work
- Added retry button for failed uploads
- Added dark mode support
- Reduced panel width from 96 to 80 (more compact)

### Files Modified
- `src/components/gallery/UploadProgressPanel.jsx` - Simplified UI

### Files to Investigate
- `src/hooks/useUpload.js` - Verify upload response handling
- `src/pages/Dashboard/Dashboard.jsx` - Check onFileUploaded callback
- Backend: `files.controller.ts` - Verify upload response includes thumbnails
- Backend: `files.service.ts` - Check uploadFileWithThumbnails return value
