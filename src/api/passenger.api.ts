import { apiClient } from './client';
import { Ride } from '../types/ride';
import { normalizeFixedRouteInviteCode, normalizeGroupInviteCode } from '../utils/groupInviteDeepLink';

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

export type FixedRouteInvitePreview = {
  code: string;
  status: string;
  trip_type: 'one_way_outbound' | 'one_way_return' | 'round_trip' | string;
  title: string;
  description?: string | null;
  origin_label: string;
  destination_label: string;
  departure_time?: string | null;
  return_time?: string | null;
  days_of_week: number[];
  seats_total: number;
  seats_available: number;
  price_per_passenger_cents: number;
  driver?: { first_name?: string | null } | null;
};

export type FixedRouteReservation = {
  id: string;
  route_id: string;
  passenger_id: string;
  status: string;
  route_status?: string;
  is_archived?: boolean;
  can_reply?: boolean;
  closure_message?: string | null;
  seats_reserved: number;
  price_cents: number;
  kaviar_fee_cents?: number;
  driver_net_cents?: number;
  reserved_at?: string;
  cancelled_at?: string | null;
  route?: {
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
    seats_available?: number;
    price_per_passenger_cents: number;
    status: string;
    invite_code: string;
    driver?: { id: string; name?: string | null } | null;
  };
};

export type PassengerFixedRouteMessage = {
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

export type PassengerFixedRouteMessageSummary = {
  reservation_id: string;
  route_id: string;
  route_status?: string;
  is_archived?: boolean;
  can_reply?: boolean;
  last_message_at?: string | null;
  last_sender_type?: 'DRIVER' | 'PASSENGER' | 'ADMIN' | string | null;
  last_message_id?: string | null;
  has_driver_message: boolean;
};

interface RequestRideParams {
  origin: { lat: number; lng: number; text?: string };
  destination: { lat: number; lng: number; text?: string };
  type?: string;
  service_category?: string;
  passenger_moto_consent?: boolean;
  trip_details?: { passengers: number; has_luggage: boolean };
  scheduled_for?: string;
  wait_requested?: boolean;
  wait_estimated_min?: number;
  post_wait_destination?: { lat: number; lng: number; text?: string };
}

export const passengerApi = {
  getMyGroups: async () => {
    const { data } = await apiClient.get('/api/passengers/me/groups');
    return data.data || [];
  },

  getGroupInvite: async (code: string) => {
    const normalized = normalizeGroupInviteCode(code);
    const { data } = await apiClient.get(`/api/groups/invites/${encodeURIComponent(normalized)}`);
    return data.data;
  },

  getResponsibleInvite: async (code: string) => {
    const normalized = normalizeGroupInviteCode(code);
    const { data } = await apiClient.get(`/api/groups/responsible-invites/${encodeURIComponent(normalized)}`);
    return data.data;
  },

  joinGroupByInvite: async (code: string) => {
    const normalized = normalizeGroupInviteCode(code);
    const { data } = await apiClient.post(`/api/groups/invites/${encodeURIComponent(normalized)}/join`, { consent: true });
    return data;
  },

  acceptResponsibleInvite: async (code: string) => {
    const normalized = normalizeGroupInviteCode(code);
    const { data } = await apiClient.post(`/api/groups/responsible-invites/${encodeURIComponent(normalized)}/accept`, { consent: true });
    return data;
  },

  getFixedRouteInvite: async (code: string): Promise<FixedRouteInvitePreview> => {
    const normalized = normalizeFixedRouteInviteCode(code);
    const { data } = await apiClient.get(`/api/fixed-routes/invites/${encodeURIComponent(normalized)}`);
    return data.data;
  },

  reserveFixedRoute: async (code: string): Promise<FixedRouteReservation> => {
    const normalized = normalizeFixedRouteInviteCode(code);
    const { data } = await apiClient.post(`/api/fixed-routes/invites/${encodeURIComponent(normalized)}/reserve`, { seats_reserved: 1 });
    return data.data;
  },

  getMyFixedRouteReservations: async (): Promise<FixedRouteReservation[]> => {
    const { data } = await apiClient.get('/api/passenger/fixed-route-reservations');
    return data.data || [];
  },

  cancelFixedRouteReservation: async (id: string): Promise<FixedRouteReservation> => {
    const { data } = await apiClient.patch(`/api/passenger/fixed-route-reservations/${encodeURIComponent(id)}/cancel`, {});
    return data.data;
  },

  getFixedRouteReservationMessages: async (reservationId: string): Promise<{
    route_status?: string;
    is_archived?: boolean;
    can_reply?: boolean;
    closure_message?: string | null;
    reservation: any;
    messages: PassengerFixedRouteMessage[];
  }> => {
    const { data } = await apiClient.get(`/api/passenger/fixed-route-reservations/${encodeURIComponent(reservationId)}/messages`);
    return data.data;
  },

  getFixedRouteMessagesSummary: async (): Promise<PassengerFixedRouteMessageSummary[]> => {
    const { data } = await apiClient.get('/api/passenger/fixed-route-reservations/messages/summary');
    return data.data || [];
  },

  sendFixedRouteReservationMessage: async (reservationId: string, payload: { message_code?: string; message_text?: string }): Promise<PassengerFixedRouteMessage> => {
    const { data } = await apiClient.post(`/api/passenger/fixed-route-reservations/${encodeURIComponent(reservationId)}/messages`, payload);
    return data.data;
  },

  getGroupPosts: async (groupId: string) => {
    const { data } = await apiClient.get(`/api/passengers/me/groups/${encodeURIComponent(groupId)}/posts`);
    return data.data || [];
  },

  markGroupPostAsRead: async (groupId: string, postId: string) => {
    const { data } = await apiClient.post(`/api/passengers/me/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/read`);
    return data;
  },

  requestRide: async (params: RequestRideParams): Promise<{ ride_id: string; status: string }> => {
    const { data } = await apiClient.post('/api/v2/rides', params);
    return data.data;
  },

  getRide: async (rideId: string): Promise<Ride> => {
    const { data } = await apiClient.get(`/api/v2/rides/${rideId}`);
    return data.data;
  },

  cancelRide: async (rideId: string): Promise<void> => {
    await apiClient.post(`/api/v2/rides/${rideId}/cancel`);
  },

  respondAdjustment: async (rideId: string, accept: boolean): Promise<{ success: boolean; status: string }> => {
    const { data } = await apiClient.post(`/api/v2/rides/${rideId}/adjustment-response`, { accept });
    return data;
  },

  allowOutsideFallback: async (rideId: string): Promise<{
    ride_id: string;
    status: string;
    outside_fallback_allowed: boolean;
    outside_fallback_consented_at?: string | null;
  }> => {
    const { data } = await apiClient.post(
      `/api/v2/rides/${rideId}/outside-fallback-consent`,
      { accept: true }
    );
    return data.data;
  },

  sendBoardingStatus: async (rideId: string, status: 'at_door' | 'descending' | '2_minutes'): Promise<void> => {
    await apiClient.post(`/api/v2/rides/${rideId}/boarding-status`, { status });
  },

  getActiveRide: async (): Promise<Ride | null> => {
    const { data } = await apiClient.get('/api/v2/rides/active');
    return data.data;
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
    const { data } = await apiClient.get(`/api/passenger/notifications?limit=${limit}`);
    return data.data || [];
  },

  getNotificationsUnreadCount: async (): Promise<number> => {
    const { data } = await apiClient.get('/api/passenger/notifications/unread-count');
    return data.data?.count ?? 0;
  },

  markNotificationRead: async (id: string): Promise<void> => {
    await apiClient.patch(`/api/passenger/notifications/${encodeURIComponent(id)}/read`);
  },

  markAllNotificationsRead: async (): Promise<void> => {
    await apiClient.patch('/api/passenger/notifications/read-all');
  },
};
