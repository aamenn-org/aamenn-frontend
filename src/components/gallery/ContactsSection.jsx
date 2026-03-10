import { useState, useEffect } from 'react';
import { GoogleLogin, useGoogleLogin } from '@react-oauth/google';
import { contactsService } from '../../services';
import config from '../../config';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faTrash, faSync, faDownload, faChevronLeft, faChevronRight, faSearch, faClipboard, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { faGoogle as faGoogleBrand } from '@fortawesome/free-brands-svg-icons';

export const ContactsSection = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedField, setCopiedField] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const contactsPerPage = 10;

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    // 🚨 TODO: Implement zero-knowledge decryption
    // Current: Backend sends plaintext contacts
    // Target: Backend sends encrypted blobs, frontend decrypts with master key
    
    try {
      setLoading(true);
      const data = await contactsService.getContacts();
      // 🚨 SECURITY: Currently receiving plaintext contacts from backend
      // TODO: Decrypt encrypted contact blobs with master key here
      setContacts(data);
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
    setSyncing(true);
    setError(null);
    try {
      await contactsService.syncContacts(tokenResponse.access_token);
      setLastSync(new Date());
      await loadContacts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to sync contacts');
    } finally {
      setSyncing(false);
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

  const handleExportCSV = () => {
    if (contacts.length === 0) return;

    const headers = ['Name', 'Nickname', 'Phone', 'Email', 'Address', 'Organization', 'Occupation', 'Birthday', 'Bio', 'URLs', 'Photo URL'];
    const rows = contacts.map(contact => [
      contact.nameEncrypted || '',
      contact.nicknameEncrypted || '',
      contact.phoneEncrypted || '',
      contact.emailEncrypted || '',
      contact.addressEncrypted || '',
      contact.organizationEncrypted || '',
      contact.occupationEncrypted || '',
      contact.birthdayEncrypted || '',
      contact.bioEncrypted || '',
      contact.urlsEncrypted || '',
      contact.photoUrlEncrypted || ''
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
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete all synced contacts?')) {
      return;
    }

    try {
      await contactsService.deleteAllContacts();
      setContacts([]);
      setLastSync(null);
      setCurrentPage(1);
    } catch (err) {
      setError('Failed to delete contacts');
    }
  };

  // Search filtering logic
  const filteredContacts = contacts.filter(contact => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const name = (contact.nameEncrypted || '').toLowerCase();
    const phone = (contact.phoneEncrypted || '').toLowerCase();
    const email = (contact.emailEncrypted || '').toLowerCase();
    
    return name.includes(searchLower) || 
           phone.includes(searchLower) || 
           email.includes(searchLower);
  });

  // Pagination logic for filtered results
  const indexOfLastContact = currentPage * contactsPerPage;
  const indexOfFirstContact = indexOfLastContact - contactsPerPage;
  const currentContacts = filteredContacts.slice(indexOfFirstContact, indexOfLastContact);
  const totalPages = Math.ceil(filteredContacts.length / contactsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to page 1 when searching
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faUsers} className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Google Contacts
          </h2>
        </div>
        {contacts.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
            Delete All
          </button>
        )}
      </div>



      {/* Contacts List */}
      {contacts.length > 0 && (
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, phone, or email..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <div className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500">
                <FontAwesomeIcon icon={faSearch} className="w-5 h-5" />
              </div>
            </div>

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
                {searchTerm 
                  ? `Found ${filteredContacts.length} of ${contacts.length} contacts`
                  : `Contacts (${contacts.length})`
                }
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGoogleLogin}
                  disabled={syncing}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    contacts.length > 0
                      ? ' text-white hover:bg-gray-700'
                      : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {contacts.length > 0 ? (
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

          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {currentContacts.map((contact) => (
              <div key={contact.id} className="flex items-center gap-3 py-2">
                {/* Avatar */}
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                  {contact.photoUrlEncrypted ? (
                    <img 
                      src={contact.photoUrlEncrypted} 
                      alt="" 
                      className="w-full h-full rounded-full object-cover" 
                      onError={(e) => { 
                        e.target.style.display = 'none'; 
                        e.target.parentElement.innerHTML = `<span class="text-xs text-gray-600 dark:text-gray-400">${contact.nameEncrypted?.[0]?.toUpperCase() || '?'}</span>`;
                      }}
                    />
                  ) : (
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {contact.nameEncrypted?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                
                {/* Contact Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {contact.nameEncrypted || 'No name'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {contact.phoneEncrypted || contact.emailEncrypted || 'No contact info'}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1">
                  {/* Copy phone if available */}
                  {contact.phoneEncrypted && (
                    <button 
                      onClick={() => handleCopy(contact.phoneEncrypted, `phone-${contact.id}`)}
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
                  {!contact.phoneEncrypted && contact.emailEncrypted && (
                    <button 
                      onClick={() => handleCopy(contact.emailEncrypted, `email-${contact.id}`)}
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
                {searchTerm 
                  ? `Page ${currentPage} of ${totalPages} (${filteredContacts.length} results)`
                  : `Page ${currentPage} of ${totalPages}`
                }
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-300 dark:border-zinc-600 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-300 dark:border-zinc-600 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {contacts.length === 0 && (
        <div className="text-center py-12 bg-gray-50 dark:bg-zinc-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-700">
          <FontAwesomeIcon icon={faUsers} className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No contacts synced yet. Connect your Google account to get started.
          </p>
          <button
            onClick={handleGoogleLogin}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
          >
            <FontAwesomeIcon icon={faGoogleBrand} className="w-4 h-4" />
            {syncing ? 'Syncing...' : 'Connect Google'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ContactsSection;
