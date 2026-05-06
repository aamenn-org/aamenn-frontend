import api from './api';

export const feedbackService = {
  async submitFeedback({ category, message }) {
    const response = await api.post('/feedback', { category, message });
    return response.data;
  },

  // Admin endpoints
  async getFeedbacks(params = {}) {
    const response = await api.get('/feedback', { params });
    return response.data;
  },

  async getFeedbackStats() {
    const response = await api.get('/feedback/stats');
    return response.data;
  },
};

export default feedbackService;
