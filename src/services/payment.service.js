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
};

export default paymentService;
