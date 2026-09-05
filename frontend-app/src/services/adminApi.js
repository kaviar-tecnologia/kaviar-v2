
import { API_BASE_URL } from '../config/api';
class AdminApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  getToken() {
    return localStorage.getItem('kaviar_admin_token');
  }

  getHeaders() {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: this.getHeaders(),
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      // Handle unauthorized responses
      if (response.status === 401) {
        // token cleanup delegado ao ProtectedAdminRoute
        
        throw new Error('Sessão expirada');
        throw new Error('Sessão expirada');
      }

      if (!response.ok) {
        const error = new Error(data.message || data.error || 'Erro na requisição');
        error.response = { status: response.status, data }; // Preserve full response data
        throw error;
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // GET request
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  // POST request
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT request
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE request
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  async patch(endpoint, data) {
    return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(data) });
  }

  // Admin-specific methods
  async getDrivers(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/api/admin/drivers${queryString ? `?${queryString}` : ''}`);
  }

  async getDriverById(id) {
    return this.get(`/api/admin/drivers/${id}`);
  }

  async getDriverDocuments(id) {
    return this.get(`/api/admin/drivers/${id}/documents`);
  }

  async approveDriver(id) {
    return this.put(`/api/admin/drivers/${id}/approve`);
  }

  async rejectDriver(id) {
    return this.put(`/api/admin/drivers/${id}/reject`);
  }

  async requestDocuments(id, reason) {
    return this.put(`/api/admin/drivers/${id}/request-documents`, { reason });
  }

  async archiveDriver(id) {
    return this.put(`/api/admin/drivers/${id}/archive`);
  }

  async reopenDriver(id) {
    return this.put(`/api/admin/drivers/${id}/reopen`);
  }

  async deleteDriver(id) {
    return this.delete(`/api/admin/drivers/${id}`);
  }

  async getRides(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/api/admin/rides${queryString ? `?${queryString}` : ''}`);
  }

  async getAdminFixedRoutes(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/api/admin/fixed-routes${queryString ? `?${queryString}` : ''}`);
  }

  async getAdminFixedRouteMetrics(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/api/admin/fixed-routes/metrics${queryString ? `?${queryString}` : ''}`);
  }

  async getAdminFixedRoute(id) {
    return this.get(`/api/admin/fixed-routes/${id}`);
  }

  async getAdminFixedRouteReservations(id, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/api/admin/fixed-routes/${id}/reservations${queryString ? `?${queryString}` : ''}`);
  }

  async pauseAdminFixedRoute(id) {
    return this.patch(`/api/admin/fixed-routes/${id}/pause`, {});
  }

  async reactivateAdminFixedRoute(id) {
    return this.patch(`/api/admin/fixed-routes/${id}/reactivate`, {});
  }

  async archiveAdminFixedRoute(id) {
    return this.patch(`/api/admin/fixed-routes/${id}/archive`, {});
  }

  async getRideById(id) {
    return this.get(`/api/admin/rides/${id}`);
  }

  async cancelRide(id, reason) {
    return this.put(`/api/admin/rides/${id}/cancel`, { reason });
  }

  async reassignDriver(id, newDriverId, reason) {
    return this.put(`/api/admin/rides/${id}/reassign-driver`, { newDriverId, reason });
  }

  async forceCompleteRide(id, reason) {
    return this.put(`/api/admin/rides/${id}/force-complete`, { reason });
  }

  async getDashboardMetrics() {
    return this.get('/api/admin/dashboard/metrics');
  }

  // Premium Tourism - Tour Packages
  async getTourPackages(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/api/admin/tour-packages${queryString ? `?${queryString}` : ''}`);
  }

  async createTourPackage(data) {
    return this.post('/api/admin/tour-packages', data);
  }

  async getTourPackage(id) {
    return this.get(`/api/admin/tour-packages/${id}`);
  }

  async updateTourPackage(id, data) {
    return this.put(`/api/admin/tour-packages/${id}`, data);
  }

  async deactivateTourPackage(id) {
    return this.request(`/api/admin/tour-packages/${id}/deactivate`, { method: 'PATCH' });
  }

  // Premium Tourism - Tour Bookings
  async getTourBookings(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/api/admin/tour-bookings${queryString ? `?${queryString}` : ''}`);
  }

  async updateTourBookingStatus(id, status) {
    return this.request(`/api/admin/tour-bookings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  async confirmTourBooking(id, adminId) {
    return this.post(`/api/admin/tour-bookings/${id}/confirm`, { adminId });
  }

  // Premium Tourism - Tour Partners
  async getTourPartners(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.get(`/api/admin/tour-partners${queryString ? `?${queryString}` : ''}`);
  }

  async getTourPartner(id) {
    return this.get(`/api/admin/tour-partners/${id}`);
  }

  async createTourPartner(data) {
    return this.post('/api/admin/tour-partners', data);
  }

  async updateTourPartner(id, data) {
    return this.put(`/api/admin/tour-partners/${id}`, data);
  }

  async deactivateTourPartner(id) {
    return this.request(`/api/admin/tour-partners/${id}/deactivate`, { method: 'PATCH' });
  }

  // Premium Tourism - Tour Reports
  async getTourReportSummary() {
    return this.get('/api/admin/tour-reports/summary');
  }

  // Premium Tourism - Tour Settings
  async getTourSettings() {
    return this.get('/api/admin/tour-settings');
  }

  async updateTourSettings(data) {
    return this.put('/api/admin/tour-settings', data);
  }

  // Vitrine Local
  async getShowcaseItems(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/api/admin/showcase${qs ? '?' + qs : ''}`);
  }
  async getShowcaseItem(id) { return this.get(`/api/admin/showcase/${id}`); }
  async createShowcaseItem(data) { return this.post('/api/admin/showcase', data); }
  async updateShowcaseItem(id, data) { return this.put(`/api/admin/showcase/${id}`, data); }
  async patchShowcaseItem(id, data) { return this.patch(`/api/admin/showcase/${id}`, data); }

  // KAVIAR Local — comércios (commerce_accounts)
  async getCommerceAccounts() {
    return this.get('/api/admin/commerce/accounts');
  }
  async getCommerceAccount(id) {
    return this.get(`/api/admin/commerce/accounts/${id}`);
  }
  async createCommerceAccount(data) {
    return this.post('/api/admin/commerce/accounts', data);
  }
  async updateCommerceAccount(id, data) {
    return this.patch(`/api/admin/commerce/accounts/${id}`, data);
  }

  // DEPRECATED — local_businesses (legado, não aparece no app passageiro)
  async getLocalBusinesses() {
    return this.get('/api/admin/local-businesses');
  }
  async getLocalBusiness(id) {
    return this.get(`/api/admin/local-businesses/${id}`);
  }
  async createLocalBusiness(data) {
    return this.post('/api/admin/local-businesses', data);
  }
  async updateLocalBusiness(id, data) {
    return this.patch(`/api/admin/local-businesses/${id}`, data);
  }
  async toggleLocalBusiness(id, is_active) {
    return this.patch(`/api/admin/local-businesses/${id}`, { is_active });
  }

  // Modality approval
  async getModalityQueue(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/api/admin/modality-queue${qs ? '?' + qs : ''}`);
  }
  async approveModality(id, review_notes) { return this.patch(`/api/admin/modalities/${id}/approve`, { review_notes }); }
  async rejectModality(id, rejected_reason, review_notes) { return this.patch(`/api/admin/modalities/${id}/reject`, { rejected_reason, review_notes }); }
  async suspendModality(id, review_notes) { return this.patch(`/api/admin/modalities/${id}/suspend`, { review_notes }); }

  // Contas a Pagar — Obrigações (Portal do Contador). READ-ONLY + downloads seguros.
  async getFinanceObligations(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/api/admin/finance/obligations${qs ? '?' + qs : ''}`);
  }
  async getFinanceObligationsSummary() {
    return this.get('/api/admin/finance/obligations/summary');
  }
  async getFinanceObligationBoletoUrl(id) {
    return this.get(`/api/admin/finance/obligations/${id}/download-boleto`);
  }
  async getFinanceObligationInvoicePdfUrl(id) {
    return this.get(`/api/admin/finance/obligations/${id}/download-invoice-pdf`);
  }
  async getFinanceObligationInvoiceXmlUrl(id) {
    return this.get(`/api/admin/finance/obligations/${id}/download-invoice-xml`);
  }
  async getFinanceObligationProofUrl(id) {
    return this.get(`/api/admin/finance/obligations/${id}/download-proof`);
  }
}

export const adminApi = new AdminApiService();
