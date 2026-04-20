import api from './api';
import { encryptContact, deriveContactSearchKey, computeContactSearchTokens, computeQueryTokens } from '../utils/crypto';

const GOOGLE_PEOPLE_API = 'https://people.googleapis.com/v1/people/me/connections';
const PERSON_FIELDS = 'names,nicknames,phoneNumbers,emailAddresses,addresses,organizations,occupations,birthdays,biographies,photos,urls';
const PAGE_SIZE = 1000;

/**
 * Fetch all contacts from Google People API directly in the browser.
 * The access_token never leaves the client.
 */
async function fetchAllGoogleContacts(accessToken) {
  const allConnections = [];
  let pageToken = undefined;

  do {
    const url = new URL(GOOGLE_PEOPLE_API);
    url.searchParams.set('personFields', PERSON_FIELDS);
    url.searchParams.set('pageSize', PAGE_SIZE);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const status = res.status;
      if (status === 401) throw new Error('Google token expired or invalid. Please sign in again.');
      if (status === 403) throw new Error('Google People API not enabled or insufficient scope.');
      if (status === 429) throw new Error('Google API quota exceeded. Please try again later.');
      throw new Error(err.error?.message || 'Failed to fetch Google contacts.');
    }

    const data = await res.json();
    allConnections.push(...(data.connections || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allConnections;
}

/**
 * Map a Google People API person object to a flat plaintext contact object.
 */
function mapGooglePerson(person) {
  return {
    googleContactId: person.resourceName,
    name: person.names?.[0]?.displayName,
    nickname: person.nicknames?.[0]?.value,
    phone: person.phoneNumbers?.map(p => p.value).join(', '),
    email: person.emailAddresses?.map(e => e.value).join(', '),
    address: person.addresses?.[0]
      ? [
          person.addresses[0].streetAddress,
          person.addresses[0].city,
          person.addresses[0].country,
        ]
          .filter(Boolean)
          .join(', ')
      : undefined,
    organization: person.organizations?.[0]?.name,
    occupation: person.occupations?.[0]?.value,
    birthday: person.birthdays?.[0]?.date
      ? `${person.birthdays[0].date.year ?? ''}-${String(person.birthdays[0].date.month ?? '').padStart(2, '0')}-${String(person.birthdays[0].date.day ?? '').padStart(2, '0')}`
      : undefined,
    bio: person.biographies?.[0]?.value,
    urls: person.urls?.map(u => u.value).join(', '),
    photoUrl: person.photos?.[0]?.url,
  };
}

/**
 * Parse a Google Contacts CSV file into flat contact objects.
 * Handles the standard Google Contacts export format with columns like:
 * First Name, Middle Name, Last Name, Nickname, Organization Name,
 * E-mail 1 - Value, Phone 1 - Value, etc.
 */
function parseGoogleCSV(csvText) {
  // Strip UTF-8 BOM if present
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = parseCSVLines(text);
  if (lines.length < 2) return [];

  const headers = lines[0];
  const contacts = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i];
    if (cols.length < 2) continue;

    const get = (name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (cols[idx] || '').trim() : '';
    };

    // Build full name from parts
    const parts = [get('First Name'), get('Middle Name'), get('Last Name')].filter(Boolean);
    const name = parts.join(' ') || undefined;

    // Collect all phone numbers (Phone 1, Phone 2, ...)
    const phones = [];
    for (let p = 1; p <= 10; p++) {
      const val = get(`Phone ${p} - Value`);
      if (val) phones.push(val.split(':::').map(s => s.trim()).filter(Boolean).join(', '));
    }

    // Collect all emails
    const emails = [];
    for (let e = 1; e <= 10; e++) {
      const val = get(`E-mail ${e} - Value`);
      if (val) emails.push(val);
    }

    // Collect all websites
    const urls = [];
    for (let w = 1; w <= 5; w++) {
      const val = get(`Website ${w} - Value`);
      if (val) urls.push(val);
    }

    const phone = phones.join(', ') || undefined;
    const email = emails.join(', ') || undefined;

    // Skip rows that have no useful data
    if (!name && !phone && !email) continue;

    contacts.push({
      googleContactId: undefined, // CSV imports don't have a Google resource ID
      name,
      nickname: get('Nickname') || undefined,
      phone,
      email,
      address: undefined,
      organization: get('Organization Name') || undefined,
      occupation: get('Organization Title') || undefined,
      birthday: get('Birthday') || undefined,
      bio: get('Notes') || undefined,
      urls: urls.join(', ') || undefined,
      photoUrl: undefined,
    });
  }

  return contacts;
}

/**
 * RFC 4180 compliant CSV line parser. Handles quoted fields, embedded
 * commas, newlines inside quotes, and escaped quotes ("").
 */
function parseCSVLines(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === '\t' || ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
        if (i < text.length && text[i] === '\n') i++;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field/row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export const contactsService = {
  /**
   * Zero-knowledge contact sync:
   * 1. Frontend fetches contacts from Google People API (token stays in browser)
   * 2. Frontend encrypts every field with the user's master key
   * 3. Frontend POSTs encrypted blobs to backend
   * Backend never sees plaintext contact data or the Google token.
   *
   * @param {string} accessToken  - Google OAuth access token (implicit flow)
   * @param {CryptoKey} masterKey - User's AES-GCM master key from AuthContext
   */
  async syncContacts(accessToken, masterKey) {
    if (!masterKey) throw new Error('Master key not available. Please unlock your vault first.');

    const searchKey = await deriveContactSearchKey(masterKey);
    const googleContacts = await fetchAllGoogleContacts(accessToken);

    const encrypted = await Promise.all(
      googleContacts.map(async person => {
        const plain = mapGooglePerson(person);
        const [encryptedFields, searchTokens] = await Promise.all([
          encryptContact(plain, masterKey),
          computeContactSearchTokens(plain.name, plain.phone, plain.email, searchKey),
        ]);
        return { googleContactId: plain.googleContactId, ...encryptedFields, searchTokens };
      })
    );

    const response = await api.post('/contacts/sync', { contacts: encrypted });
    return response.data;
  },

  async searchContacts(query, masterKey, page = 1, limit = 20) {
    const searchKey = await deriveContactSearchKey(masterKey);
    const tokens = await computeQueryTokens(query, searchKey);
    if (tokens.length === 0) return { data: [], total: 0, page, limit, totalPages: 0 };
    const response = await api.get('/contacts/search', {
      params: { tokens: tokens.join(','), page, limit },
    });
    return response.data;
  },

  async getContacts(page = 1, limit = 20) {
    const response = await api.get('/contacts', { params: { page, limit } });
    return response.data;
  },

  async deleteAllContacts() {
    const response = await api.delete('/contacts');
    return response.data;
  },

  /**
   * Import contacts from a Google Contacts CSV file.
   * Same zero-knowledge flow as Google sync: parse → encrypt → POST.
   *
   * @param {File} file        - The CSV file selected by the user
   * @param {CryptoKey} masterKey - User's AES-GCM master key
   * @returns {Promise<{imported: number}>}
   */
  async importCSV(file, masterKey) {
    if (!masterKey) throw new Error('Master key not available. Please unlock your vault first.');

    const csvText = await file.text();
    const plainContacts = parseGoogleCSV(csvText);

    if (plainContacts.length === 0) {
      throw new Error('No valid contacts found in the CSV file. Make sure it is a Google Contacts export.');
    }

    const searchKey = await deriveContactSearchKey(masterKey);

    const encrypted = await Promise.all(
      plainContacts.map(async (plain) => {
        const [encryptedFields, searchTokens] = await Promise.all([
          encryptContact(plain, masterKey),
          computeContactSearchTokens(plain.name, plain.phone, plain.email, searchKey),
        ]);
        return { ...encryptedFields, searchTokens };
      })
    );

    const response = await api.post('/contacts/sync', { contacts: encrypted });
    return { ...response.data, imported: plainContacts.length };
  },
};

export default contactsService;
