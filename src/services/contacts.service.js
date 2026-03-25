import api from './api';

export const contactsService = {
  async syncContacts(accessToken) {
    const response = await api.post('/contacts/sync', { accessToken });
    return response.data;
  },

  async getContacts() {
    const response = await api.get('/contacts');
    return response.data;
  },

  async deleteAllContacts() {
    const response = await api.delete('/contacts');
    return response.data;
  },
};

export default contactsService;
