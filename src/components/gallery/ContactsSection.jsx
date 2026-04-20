import { useState, useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { contactsService } from '../../services';
import { decryptContact } from '../../utils/crypto';
import { useAuth } from '../../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faTrash, faSync, faDownload, faUpload, faChevronLeft, faChevronRight, faSearch, faClipboard, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { faGoogle as faGoogleBrand } from '@fortawesome/free-brands-svg-icons';

const PAGE_LIMIT = 20;
const MIN_SEARCH_CHARS = 3;
const SEARCH_DEBOUNCE_MS = 400;

export const ContactsSection = () => {
  const { getMasterKey } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState(null);
  const csvInputRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedField, setCopiedField] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const shouldSearch = searchTerm.length === 0 || searchTerm.length >= MIN_SEARCH_CHARS;
    if (shouldSearch) {
      debounceRef.current = setTimeout(() => {
        setCurrentPage(1);
        setActiveQuery(searchTerm);
      }, SEARCH_DEBOUNCE_MS);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadPage(currentPage, activeQuery);
  }, [currentPage, activeQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPage = async (page, query) => {
    try {
      setLoading(true);
      setError(null);
      const masterKey = getMasterKey();
      if (!masterKey) {
        setError('Master key not available. Please re-login to decrypt contacts.');
        setContacts([]);
        return;
      }
      const result = query.length >= MIN_SEARCH_CHARS
        ? await contactsService.searchContacts(query, masterKey, page, PAGE_LIMIT)
        : await contactsService.getContacts(page, PAGE_LIMIT);
      const decrypted = await Promise.all(
        result.data.map(c => decryptContact(c, masterKey))
      );
      setContacts(decrypted);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      if (query.length < MIN_SEARCH_CHARS) {
        setTotalContacts(result.total);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSuccess = async (tokenResponse) => {
    if (!tokenResponse.access_token) {
      setError('No access token received from Google');
      return;
    }
    const masterKey = getMasterKey();
    if (!masterKey) {
      setError('Master key not available. Please re-login before syncing.');
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      await contactsService.syncContacts(tokenResponse.access_token, masterKey);
      setLastSync(new Date());
      setSearchTerm('');
      setActiveQuery('');
      setCurrentPage(1);
      await loadPage(1, '');
    } catch (err) {
      setError(err.message || err.response?.data?.message || 'Failed to sync contacts');
    } finally {
      setSyncing(false);
    }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = '';

    const masterKey = getMasterKey();
    if (!masterKey) {
      setError('Master key not available. Please re-login before importing.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const result = await contactsService.importCSV(file, masterKey);
      setLastSync(new Date());
      setSearchTerm('');
      setActiveQuery('');
      setCurrentPage(1);
      await loadPage(1, '');
    } catch (err) {
      setError(err.message || 'Failed to import CSV contacts');
    } finally {
      setImporting(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleSyncSuccess,
    onError: () => setError('Google authentication failed'),
    scope: 'https://www.googleapis.com/auth/contacts.readonly',
    flow: 'implicit',
  });

  const handleGoogleLogin = () => {
    googleLogin();
  };

  const handleCopy = async (text, fieldId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleExportCSV = async () => {
    if (totalContacts === 0) return;

    try {
      setError(null);
      const masterKey = getMasterKey();
      if (!masterKey) {
        setError('Master key not available. Please re-login to export contacts.');
        return;
      }

      // Fetch ALL contacts, not just the current page
      const allContacts = [];
      let page = 1;
      let totalPages = 1;
      do {
        const result = await contactsService.getContacts(page, 100);
        const decrypted = await Promise.all(
          result.data.map(c => decryptContact(c, masterKey))
        );
        allContacts.push(...decrypted);
        totalPages = result.totalPages;
        page++;
      } while (page <= totalPages);

      if (allContacts.length === 0) return;

    const headers = ['Name', 'Nickname', 'Phone', 'Email', 'Address', 'Organization', 'Occupation', 'Birthday', 'Bio', 'URLs', 'Photo URL'];
    const rows = allContacts.map(contact => [
      contact.name || '',
      contact.nickname || '',
      contact.phone || '',
      contact.email || '',
      contact.address || '',
      contact.organization || '',
      contact.occupation || '',
      contact.birthday || '',
      contact.bio || '',
      contact.urls || '',
      contact.photoUrl || ''
    ]);

    // Create CSV content with proper Unicode handling
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Convert to string and handle Unicode properly
        const cellStr = String(cell);
        // Always wrap in quotes and escape existing quotes for proper Unicode support
        return `"${cellStr.replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    // Create and download the file with UTF-8 BOM for proper Unicode support
    const BOM = '\uFEFF'; // UTF-8 Byte Order Mark
    const csvWithBOM = BOM + csvContent;
    
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contacts_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export contacts:', err);
      setError('Failed to export contacts');
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete all synced contacts?')) {
      return;
    }

    try {
      await contactsService.deleteAllContacts();
      setContacts([]);
      setTotal(0);
      setTotalPages(0);
      setTotalContacts(0);
      setLastSync(null);
      setSearchTerm('');
      setActiveQuery('');
      setCurrentPage(1);
    } catch (err) {
      setError('Failed to delete contacts');
    }
  };

  const isSearchMode = activeQuery.length >= MIN_SEARCH_CHARS;

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(p => p + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden file input - always rendered so ref works in empty state too */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleCSVImport}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faUsers} className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Google Contacts
          </h2>
        </div>
        {totalContacts > 0 && (
          <button
            onClick={handleDeleteAll}
            className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
            Delete All
          </button>
        )}
      </div>



      {/* Contacts List */}
      {(totalContacts > 0 || isSearchMode) && (
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, phone, or email..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full px-4 py-2 pl-10 border border-gray-300 dark:bg-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <div className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500">
                <FontAwesomeIcon icon={faSearch} className="w-5 h-5" />
              </div>
            </div>
            {searchTerm.length > 0 && searchTerm.length < MIN_SEARCH_CHARS && (
              <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
                Type {MIN_SEARCH_CHARS - searchTerm.length} more character{MIN_SEARCH_CHARS - searchTerm.length !== 1 ? 's' : ''} to search
              </p>
            )}

            {/* Status Info */}
            {lastSync && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Last synced: {lastSync.toLocaleTimeString()}
              </div>
            )}
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            )}

            {/* Header with Actions */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {isSearchMode
                  ? `${total} result${total !== 1 ? 's' : ''} for "${activeQuery}"`
                  : `Contacts (${total})`
                }
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => csvInputRef.current?.click()}
                  disabled={importing || syncing}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Import from Google Contacts CSV"
                >
                  <FontAwesomeIcon icon={faUpload} className={`w-4 h-4 ${importing ? 'animate-pulse' : ''}`} />
                  {importing ? 'Importing...' : 'Import CSV'}
                </button>
                <button
                  onClick={handleGoogleLogin}
                  disabled={syncing || importing}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    totalContacts > 0
                      ? ' text-white hover:bg-gray-700'
                      : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {totalContacts > 0 ? (
                    <>
                      <FontAwesomeIcon icon={faSync} className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Sync'}
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faGoogleBrand} className="w-4 h-4" />
                      {syncing ? 'Syncing...' : 'Connect Google'}
                    </>
                  )}
                </button>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-3 py-2 text-sm  text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {isSearchMode && total === 0 && !loading && (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No results for &ldquo;{activeQuery}&rdquo;
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Search requires contacts to be synced with the latest version.{' '}
                <button
                  onClick={handleGoogleLogin}
                  className="underline hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Re-sync now
                </button>
                {' '}to enable search.
              </p>
            </div>
          )}
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-center gap-3 py-2">
                {/* Avatar */}
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                  {contact.photoUrl ? (
                    <img 
                      src={contact.photoUrl} 
                      alt="" 
                      className="w-full h-full rounded-full object-cover" 
                      onError={(e) => { 
                        e.target.style.display = 'none'; 
                        e.target.parentElement.innerHTML = `<span class="text-xs text-gray-600 dark:text-gray-400">${contact.name?.[0]?.toUpperCase() || '?'}</span>`;
                      }}
                    />
                  ) : (
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {contact.name?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                
                {/* Contact Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {contact.name || 'No name'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {contact.phone || contact.email || 'No contact info'}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1">
                  {/* Copy phone if available */}
                  {contact.phone && (
                    <button 
                      onClick={() => handleCopy(contact.phone, `phone-${contact.id}`)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      title="Copy phone"
                    >
                      {copiedField === `phone-${contact.id}` ? (
                        <span className="text-xs text-green-600">✓</span>
                      ) : (
                        <FontAwesomeIcon icon={faClipboard} className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  
                  {/* Copy email if available and no phone */}
                  {!contact.phone && contact.email && (
                    <button 
                      onClick={() => handleCopy(contact.email, `email-${contact.id}`)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      title="Copy email"
                    >
                      {copiedField === `email-${contact.id}` ? (
                        <span className="text-xs text-green-600">✓</span>
                      ) : (
                        <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-zinc-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Page {currentPage} of {totalPages} &mdash; {total} total
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 1 || loading}
                  className="p-2 rounded-lg border border-gray-300 dark:border-zinc-600 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages || loading}
                  className="p-2 rounded-lg border border-gray-300 dark:border-zinc-600 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {totalContacts === 0 && !loading && !isSearchMode && (
        <div className="text-center py-12 bg-gray-50 dark:bg-zinc-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-700">
          <FontAwesomeIcon icon={faUsers} className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No contacts synced yet. Connect your Google account or import a CSV file to get started.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleGoogleLogin}
              disabled={syncing || importing}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faGoogleBrand} className="w-4 h-4" />
              {syncing ? 'Syncing...' : 'Connect Google'}
            </button>
            <button
              onClick={() => csvInputRef.current?.click()}
              disabled={importing || syncing}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faUpload} className="w-4 h-4" />
              {importing ? 'Importing...' : 'Import CSV'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsSection;
