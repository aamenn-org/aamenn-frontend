import api from './api';

export const contactsService = {
  async syncContacts(accessToken) {
    try {
      const response = await api.post('/contacts/sync', { accessToken });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async getContacts() {
    try {
      const response = await api.get('/contacts');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async deleteAllContacts() {
    try {
      const response = await api.delete('/contacts');
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

export default contactsService;
