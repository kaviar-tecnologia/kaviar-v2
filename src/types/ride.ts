// Tipos de corrida (v2)
export type RideStatus =
  | 'scheduled' | 'requested' | 'offered' | 'pending_adjustment' | 'accepted' | 'arrived'
  | 'started' | 'in_progress' | 'completed'
  | 'canceled_by_passenger' | 'canceled_by_driver' | 'no_driver';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'canceled';

export interface Ride {
  id: string;
  driver_id?: string;
  passenger_id: string;
  status: RideStatus;
  ride_type: string;
  origin_lat: number;
  origin_lng: number;
  origin_text?: string;
  dest_lat: number;
  dest_lng: number;
  destination_text?: string;
  is_homebound?: boolean;
  outside_fallback_allowed?: boolean;
  outside_fallback_consented_at?: string | null;
  requested_at: string;
  accepted_at?: string;
  arrived_at?: string;
  started_at?: string;
  completed_at?: string;
  quoted_price?: number | string;
  driver_adjustment?: number | string;
  adjusted_price?: number | string;
  updated_at?: string;
  passenger?: { name: string; phone?: string };
  driver?: { name: string; phone?: string; vehicle_model?: string; vehicle_plate?: string; vehicle_color?: string; id?: string; last_lat?: number; last_lng?: number; photo_url?: string; vehicle_photo_url?: string };
  trip_details?: { passengers: number; has_luggage: boolean; post_wait_destination?: { lat: number; lng: number; text?: string | null } };
  boarding_status?: 'at_door' | 'descending' | '2_minutes' | null;
  scheduled_for?: string | null;
  // Wait ("Levar e esperar")
  wait_requested?: boolean;
  wait_estimated_min?: number | null;
  wait_started_at?: string | null;
  wait_ended_at?: string | null;
}

export interface RideOffer {
  id: string;
  ride_id: string;
  driver_id: string;
  status: OfferStatus;
  territory_tier?: 'COMMUNITY' | 'NEIGHBORHOOD' | 'OUTSIDE';
  sent_at: string;
  expires_at: string;
  ride: {
    id: string;
    status: RideStatus;
    ride_type: string;
    origin_lat: number;
    origin_lng: number;
    origin_text?: string;
    dest_lat: number;
    dest_lng: number;
    destination_text?: string;
    is_homebound?: boolean;
    requested_at: string;
    passenger?: { name: string };
    wait_requested?: boolean;
    wait_estimated_min?: number | null;
  };
}

// Labels para exibição
export const RIDE_STATUS_LABEL: Record<RideStatus, string> = {
  scheduled: 'Agendada',
  requested: 'Solicitada',
  offered: 'Ofertada',
  pending_adjustment: 'Aguardando confirmação',
  accepted: 'Aceita',
  arrived: 'Motorista chegou',
  started: 'Em andamento',
  in_progress: 'Em andamento',
  completed: 'Finalizada',
  canceled_by_passenger: 'Cancelada pelo passageiro',
  canceled_by_driver: 'Cancelada pelo motorista',
  no_driver: 'Sem motorista',
};
