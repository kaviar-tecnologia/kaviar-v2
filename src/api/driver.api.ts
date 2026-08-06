import { apiClient } from './client';
import { Ride, RideOffer } from '../types/ride';

export type AppNotification = {
  id: string;
  recipient_type: string;
  title: string;
  body: string;
  type: string;
  route_id: string | null;
  reservation_id: string | null;
  data: Record<string, string | null> | null;
  read_at: string | null;
  created_at: string;
};

type WalletRechargeProvider = 'sumup';
type WalletRechargeMethod = 'pix';

type WalletRechargeSumUpResponse = {
  rechargeId: string;
  amount_cents: number;
  charged_amount_cents?: number;
  wallet_credit_cents?: number;
  provider_fee_estimated_cents?: number;
  fee_label?: string;
  payment_provider: 'sumup';
  payment_method: WalletRechargeMethod;
  checkout: {
    id: string;
    checkout_reference?: string | null;
    url?: string | null;
    status?: string | null;
  };
  pix?: {
    payment_type: 'qr_code_pix' | 'pix' | string;
    qr_image_url: string | null;
    copy_paste: string | null;
  };
};

export type WalletRechargeResponse = WalletRechargeSumUpResponse;

export type DriverFixedRoute = {
  id: string;
  title: string;
  description?: string | null;
  trip_type: 'one_way_outbound' | 'one_way_return' | 'round_trip' | string;
  origin_label: string;
  destination_label: string;
  departure_time?: string | null;
  return_time?: string | null;
  days_of_week: number[];
  seats_total: number;
  seats_reserved?: number;
  seats_available?: number;
  price_per_passenger_cents: number;
  kaviar_fee_percent?: number | string | null;
  status: 'active' | 'paused' | 'cancelled' | 'archived' | string;
  invite_code: string;
  created_at?: string;
  updated_at?: string;
};

export type DriverFixedRoutePayload = {
  title: string;
  description?: string | null;
  trip_type: 'one_way_outbound' | 'one_way_return' | 'round_trip';
  origin_label: string;
  destination_label: string;
  departure_time?: string | null;
  return_time?: string | null;
  days_of_week: number[];
  seats_total: number;
  price_per_passenger_cents: number;
};

export type DriverFixedRouteReservation = {
  id: string;
  route_id: string;
  passenger_id: string;
  status: string;
  seats_reserved: number;
  price_cents: number;
  kaviar_fee_cents: number;
  driver_net_cents: number;
  reserved_at?: string;
  passenger?: { id: string; name?: string | null };
};

export type FixedRouteMessage = {
  id: string;
  route_id: string;
  reservation_id?: string | null;
  sender_type: 'DRIVER' | 'PASSENGER' | 'ADMIN' | string;
  recipient_type: 'DRIVER' | 'PASSENGER' | 'ROUTE_CONFIRMED_PASSENGERS' | string;
  message_code?: string | null;
  message_text: string;
  created_at: string;
  read_at?: string | null;
  metadata?: Record<string, any> | null;
};

type MunicipalQuery = {
  city?: string;
  state?: string;
  modality?: string;
};

function toMunicipalQueryString(query: MunicipalQuery) {
  const search = new URLSearchParams();
  if (query.city) search.set('city', query.city);
  if (query.state) search.set('state', query.state);
  if (query.modality) search.set('modality', query.modality);
  const str = search.toString();
  return str ? `?${str}` : '';
}

export const driverApi = {
  getMyGroups: async () => {
    const { data } = await apiClient.get('/api/drivers/me/groups');
    return data.data || [];
  },

  getFixedRoutes: async (): Promise<DriverFixedRoute[]> => {
    const { data } = await apiClient.get('/api/driver/fixed-routes');
    return data.data || [];
  },

  createFixedRoute: async (payload: DriverFixedRoutePayload): Promise<DriverFixedRoute> => {
    const { data } = await apiClient.post('/api/driver/fixed-routes', payload);
    return data.data;
  },

  getFixedRoute: async (id: string): Promise<DriverFixedRoute> => {
    const { data } = await apiClient.get(`/api/driver/fixed-routes/${id}`);
    return data.data;
  },

  updateFixedRoute: async (id: string, payload: Partial<DriverFixedRoutePayload>): Promise<DriverFixedRoute> => {
    const { data } = await apiClient.patch(`/api/driver/fixed-routes/${id}`, payload);
    return data.data;
  },

  pauseFixedRoute: async (id: string): Promise<DriverFixedRoute> => {
    const { data } = await apiClient.patch(`/api/driver/fixed-routes/${id}/pause`);
    return data.data;
  },

  cancelFixedRoute: async (id: string): Promise<DriverFixedRoute> => {
    const { data } = await apiClient.patch(`/api/driver/fixed-routes/${id}/cancel`);
    return data.data;
  },

  reactivateFixedRoute: async (id: string): Promise<DriverFixedRoute> => {
    const { data } = await apiClient.patch(`/api/driver/fixed-routes/${id}/reactivate`);
    return data.data;
  },

  archiveFixedRoute: async (id: string): Promise<DriverFixedRoute> => {
    const { data } = await apiClient.patch(`/api/driver/fixed-routes/${id}/archive`);
    return data.data;
  },

  getFixedRouteReservations: async (id: string): Promise<DriverFixedRouteReservation[]> => {
    const { data } = await apiClient.get(`/api/driver/fixed-routes/${id}/reservations`);
    return data.data || [];
  },

  updateFixedRouteReservationStatus: async (routeId: string, reservationId: string, status: string): Promise<DriverFixedRouteReservation> => {
    const { data } = await apiClient.patch(`/api/driver/fixed-routes/${routeId}/reservations/${reservationId}/status`, { status });
    return data.data;
  },

  getFixedRouteMessages: async (routeId: string): Promise<FixedRouteMessage[]> => {
    const { data } = await apiClient.get(`/api/driver/fixed-routes/${routeId}/messages`);
    return data.data || [];
  },

  sendFixedRouteBroadcastMessage: async (routeId: string, payload: { message_code?: string; message_text?: string }): Promise<FixedRouteMessage> => {
    const { data } = await apiClient.post(`/api/driver/fixed-routes/${routeId}/messages`, payload);
    return data.data;
  },

  getFixedRouteReservationMessages: async (routeId: string, reservationId: string): Promise<{
    route_status?: string;
    is_archived?: boolean;
    can_reply?: boolean;
    closure_message?: string | null;
    reservation: any;
    messages: FixedRouteMessage[];
  }> => {
    const { data } = await apiClient.get(`/api/driver/fixed-routes/${routeId}/reservations/${reservationId}/messages`);
    return data.data;
  },

  sendFixedRouteReservationMessage: async (routeId: string, reservationId: string, payload: { message_code?: string; message_text?: string }): Promise<FixedRouteMessage> => {
    const { data } = await apiClient.post(`/api/driver/fixed-routes/${routeId}/reservations/${reservationId}/messages`, payload);
    return data.data;
  },

  // v2: Disponibilidade
  setAvailability: (availability: 'online' | 'offline') =>
    apiClient.post('/api/v2/drivers/me/availability', { availability }),

  goOnline: () => apiClient.post('/api/v2/drivers/me/availability', { availability: 'online' }),
  goOffline: () => apiClient.post('/api/v2/drivers/me/availability', { availability: 'offline' }),

  // v2: Localização
  sendLocation: (lat: number, lng: number) =>
    apiClient.post('/api/v2/drivers/me/location', { lat, lng }),

  // v2: Ofertas
  getOffers: async (): Promise<RideOffer[]> => {
    const { data } = await apiClient.get('/api/v2/drivers/me/offers');
    return data.data || [];
  },

  acceptOffer: async (offerId: string, adjustment?: number): Promise<{ ride_id: string }> => {
    const body = adjustment ? { adjustment } : {};
    const { data } = await apiClient.post(`/api/v2/drivers/offers/${offerId}/accept`, body);
    return data.data;
  },

  rejectOffer: (offerId: string) =>
    apiClient.post(`/api/v2/drivers/offers/${offerId}/reject`),

  // v2: Corrida ativa
  getCurrentRide: async (): Promise<Ride | null> => {
    const { data } = await apiClient.get('/api/v2/drivers/me/current-ride');
    return data.data || null;
  },

  getMunicipalRequirements: async (query: MunicipalQuery = {}) => {
    const qs = toMunicipalQueryString(query);
    const { data } = await apiClient.get(`/api/v2/driver/municipal-requirements${qs}`);
    return data.data;
  },

  getMunicipalStatus: async (query: MunicipalQuery = {}) => {
    const qs = toMunicipalQueryString(query);
    const { data } = await apiClient.get(`/api/v2/driver/municipal-status${qs}`);
    return data.data;
  },

  // v2: Lifecycle da corrida
  arrived: (rideId: string) =>
    apiClient.post(`/api/v2/rides/${rideId}/arrived`),

  startRide: (rideId: string, boarding_code?: string) =>
    apiClient.post(`/api/v2/rides/${rideId}/start`, boarding_code ? { boarding_code } : {}),

  completeRide: async (rideId: string) => {
    const { data } = await apiClient.post(`/api/v2/rides/${rideId}/complete`);
    return data;
  },

  startWait: (rideId: string) =>
    apiClient.post(`/api/v2/rides/${rideId}/wait/start`),

  endWait: (rideId: string) =>
    apiClient.post(`/api/v2/rides/${rideId}/wait/end`),

  // v2: Location update durante corrida (emite SSE para passageiro)
  sendRideLocation: (rideId: string, lat: number, lng: number) =>
    apiClient.post(`/api/v2/rides/${rideId}/location`, { lat, lng }),

  // v2: Saldo
  getCredits: async (): Promise<{ balance: number }> => {
    const { data } = await apiClient.get('/api/v2/drivers/me/credits');
    return data.data;
  },

  getCreditPackages: async (): Promise<{ id: string; credits: number; price: number; priceCents: number }[]> => {
    const { data } = await apiClient.get('/api/v2/drivers/me/credits/packages');
    return data.data || [];
  },

  purchaseCredits: async (packageId: string) => {
    const { data } = await apiClient.post('/api/v2/drivers/me/credits/purchase', { packageId });
    return data.data;
  },

  getCreditPurchases: async () => {
    const { data } = await apiClient.get('/api/v2/drivers/me/credits/purchases');
    return data.data || [];
  },

  // Wallet V2
  getWallet: async (): Promise<{ balance_cents: number; reserved_cents: number; available_cents: number; balance_display: string }> => {
    const { data } = await apiClient.get('/api/v2/drivers/me/wallet');
    return data.data;
  },

  getWalletPackages: async (): Promise<{
    packages: {
      id: string;
      label: string;
      amount_cents: number;
      wallet_credit_cents: number;
      charged_amount_cents: number;
      provider_fee_estimated_cents: number;
      fee_label: string;
      family_return_percent: number;
      family_return_cents: number;
    }[];
    family_return: { percent: number; message: string; policy_version?: string } | null;
  }> => {
    const { data } = await apiClient.get('/api/v2/drivers/me/wallet/packages');
    return { packages: data.data || [], family_return: data.family_return || null };
  },

  getWalletLedger: async (limit = 20, offset = 0): Promise<{ entries: any[]; total: number; limit: number; offset: number }> => {
    const { data } = await apiClient.get(`/api/v2/drivers/me/wallet/ledger?limit=${limit}&offset=${offset}`);
    return data.data;
  },

  getWalletRecharge: async (id: string): Promise<{ id: string; amount_cents: number; charged_amount_cents?: number | null; wallet_credit_cents?: number | null; provider_fee_estimated_cents?: number | null; payment_method?: WalletRechargeMethod | null; status: string; payment_provider?: WalletRechargeProvider; created_at: string; confirmed_at: string | null }> => {
    const { data } = await apiClient.get(`/api/v2/drivers/me/wallet/recharges/${id}`);
    return data.data;
  },

  createWalletRecharge: async (packageId: string): Promise<WalletRechargeResponse> => {
    const body: { package_id: string; payment_provider: WalletRechargeProvider; payment_method: WalletRechargeMethod } = {
      package_id: packageId,
      payment_provider: 'sumup',
      payment_method: 'pix',
    };
    const { data } = await apiClient.post('/api/v2/drivers/me/wallet/recharge', body);
    return data.data;
  },

  getFamilyReturn: async (): Promise<{
    enabled: boolean;
    available_cents: string;
    accrued_cents: string;
    reserved_cents: string;
    paid_cents: string;
    reversed_cents: string;
    available_for_request?: boolean;
    request_start?: string | null;
    request_end?: string | null;
    message?: string;
  }> => {
    const { data } = await apiClient.get('/api/v2/drivers/me/family-return');
    return data.data;
  },

  // v2: Resumo financeiro
  getFinancialSummary: async (period: 'today' | '7d' | '30d' = '30d') => {
    const { data } = await apiClient.get(`/api/v2/drivers/me/financial-summary?period=${period}`);
    return data.data;
  },

  // v1: Perfil (não tem v2 equivalente)
  getMe: async () => {
    const { data } = await apiClient.get('/api/drivers/me');
    return data;
  },

  // Retorno Familiar KAVIAR
  getRetornoFamiliar: async () => {
    const { data } = await apiClient.get('/api/v2/drivers/me/retorno-familiar');
    return data.data;
  },

  requestRetornoFamiliar: async () => {
    const { data } = await apiClient.post('/api/v2/drivers/me/retorno-familiar/request');
    return data;
  },

  triggerEmergency: async (rideId: string): Promise<{ event_id: string }> => {
    const { data } = await apiClient.post(`/api/v2/rides/${rideId}/emergency`);
    return data;
  },

  sendRideMessage: async (rideId: string, messageCode: string): Promise<void> => {
    await apiClient.post(`/api/v2/rides/${rideId}/messages`, { message_code: messageCode });
  },

  getRideMessages: async (rideId: string) => {
    const { data } = await apiClient.get(`/api/v2/rides/${rideId}/messages`);
    return data.data || [];
  },

  // Central de notificações
  getNotifications: async (limit = 50): Promise<AppNotification[]> => {
    const { data } = await apiClient.get(`/api/driver/notifications?limit=${limit}`);
    return data.data || [];
  },

  getNotificationsUnreadCount: async (): Promise<number> => {
    const { data } = await apiClient.get('/api/driver/notifications/unread-count');
    return data.data?.count ?? 0;
  },

  markNotificationRead: async (id: string): Promise<void> => {
    await apiClient.patch(`/api/driver/notifications/${encodeURIComponent(id)}/read`);
  },

  markAllNotificationsRead: async (): Promise<void> => {
    await apiClient.patch('/api/driver/notifications/read-all');
  },

  // Modalities
  getModalities: async () => {
    const { data } = await apiClient.get('/api/drivers/me/modalities');
    return data.data || [];
  },

  addModality: async (body: { modality: string; vehicle_plate?: string; vehicle_model?: string; vehicle_color?: string; vehicle_year?: number; vehicle_brand?: string; cnh_category?: string; has_extra_helmet?: boolean }) => {
    const { data } = await apiClient.post('/api/drivers/me/modalities', body);
    return data;
  },
};
