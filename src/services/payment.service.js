import api from './api';

export const paymentService = {
  /**
   * Get available storage plans
   */
  async getPlans() {
    const response = await api.get('/payments/plans');
    return response.data.plans;
  },

  /**
   * Get current user subscription
   */
  async getSubscription() {
    const response = await api.get('/payments/subscription');
    return response.data.subscription;
  },

  /**
   * Get subscription history
   */
  async getSubscriptionHistory() {
    const response = await api.get('/payments/subscription/history');
    return response.data.subscriptions;
  },

  /**
   * Initiate checkout for a plan — returns a Paymob checkout URL
   * @param {string} planId - UUID of the plan
   */
  async initiateCheckout(planId) {
    const response = await api.post('/payments/checkout', { planId });
    return response.data;
  },

  /**
   * Renew current subscription
   */
  async renewSubscription() {
    const response = await api.post('/payments/renew');
    return response.data;
  },

  /**
   * Get payment history
   */
  async getPaymentHistory() {
    const response = await api.get('/payments/history');
    return response.data.payments;
  },

  /**
   * Get public InstaPay configuration (username, qr image url, enabled)
   */
  async getInstapayInfo() {
    const response = await api.get('/payments/instapay/info');
    return response.data;
  },

  /**
   * Submit InstaPay transfer proof for verification
   * @param {{ planId: string, screenshot: File, instapayReference: string, senderName?: string }} payload
   */
  async submitInstapay(payload) {
    const formData = new FormData();
    formData.append('screenshot', payload.screenshot);
    formData.append('planId', payload.planId);
    formData.append('instapayReference', payload.instapayReference);
    if (payload.senderName) {
      formData.append('senderName', payload.senderName);
    }
    const response = await api.post('/payments/instapay/submit', formData);
    return response.data;
  },

  /**
   * Get the current user's most recent InstaPay submission (or null)
   */
  async getInstapayStatus() {
    const response = await api.get('/payments/instapay/status');
    return response.data.submission;
  },
};

export default paymentService;
