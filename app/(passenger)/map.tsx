import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, TextInput, Keyboard, ScrollView, KeyboardAvoidingView, Platform, Linking, Modal, Share, Animated, AppState, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/core';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import MapView, { Marker, Region } from 'react-native-maps';
import { Button } from '../../src/components/Button';
import { passengerApi } from '../../src/api/passenger.api';
import { authStore } from '../../src/auth/auth.store';
import { Ride, RideStatus } from '../../src/types/ride';
import { friendlyError } from '../../src/utils/errorMessage';
import { COLORS } from '../../src/config/colors';
import { DrawerMenu, DrawerItem } from '../../src/components/DrawerMenu';
import { CommunityStatusCard } from '../../src/components/passenger/CommunityStatusCard';
import { ReturnHomeCard } from '../../src/components/passenger/ReturnHomeCard';
import { DriverExcellenceIndicator } from '../../src/components/passenger/DriverExcellenceIndicator';
import { TripComposition } from '../../src/components/passenger/TripComposition';
import { ScheduleSelector } from '../../src/components/passenger/ScheduleSelector';
import { RideCompletedModal } from '../../src/components/passenger/RideCompletedModal';
import { RideWizard } from '../../src/components/passenger/RideWizard';
import { RadarPulse } from '../../src/components/passenger/RadarPulse';
import { ServiceSelector, SelectableService } from '../../src/components/passenger/ServiceSelector';
import { AdjustmentModal } from '../../src/components/AdjustmentModal';
import { KaviarHub } from '../../src/components/passenger/KaviarHub';
import { MotoAcceptModal } from '../../src/components/moto/MotoAcceptModal';
import { MotoUnavailableModal } from '../../src/components/moto/MotoUnavailableModal';
import { MOTO_FLAGS } from '../../src/config/moto.config';

import { ENV } from '../../src/config/env';
import { apiClient } from '../../src/api/client';
import { persistPassengerRide, getPersistedPassengerRide } from '../../src/services/ride-persistence';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { PASSENGER_TO_DRIVER_RIDE_QUICK_MESSAGES, RIDE_QUICK_MESSAGE_TEXT_BY_CODE, RideQuickMessageCode } from '../../src/config/rideMessages';
import {
  computeRecentFixedRouteMessages,
  getFixedRouteLastSeenMap,
  getFixedRouteNotificationState,
  syncFixedRouteNotificationState,
} from '../../src/services/fixed-route-recent.service';
import { ensurePassengerPushTokenRegistration } from '../../src/services/passenger-push-token.service';

const POLL_INTERVAL = 3000;
const POLL_BACKOFF_P = [3000, 5000, 8000, 10000]; // normal, 1 fail, 2 fails, 3+ fails

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  scheduled:          { label: 'Corrida agendada',       color: '#1a3a6a', icon: '🕐' },
  requested:          { label: 'Buscando motorista...', color: COLORS.warning, icon: '🚗' },
  offered:            { label: 'Buscando motorista...', color: COLORS.warning, icon: '🚗' },
  pending_adjustment: { label: 'Ajuste de valor',       color: COLORS.warning, icon: '💰' },
  accepted:           { label: 'Motorista a caminho',   color: COLORS.accent,  icon: '🚗' },
  arrived:    { label: 'Motorista chegou!',      color: COLORS.primary, icon: '📍' },
  in_progress:{ label: 'Corrida em andamento',   color: COLORS.success, icon: '🛣️' },
  completed:  { label: 'Corrida finalizada',     color: COLORS.success, icon: '✅' },
};

interface Place { text: string; lat: number; lng: number; placeId: string }
interface Prediction { place_id: string; description: string }

type Screen = 'idle' | 'search' | 'tracking';

export default function PassengerMap() {
  const router = useRouter();
  const params = useLocalSearchParams<{ destLat?: string; destLng?: string; vehicle?: string }>();
  const isFocused = useIsFocused();
  const { isConnected } = useNetworkStatus();
  // ── DEV PREVIEW: set to 'accepted' | 'arrived' | 'in_progress' | null to test tracking UI ──
  const DEV_PREVIEW: RideStatus | null = null; // ← change to test, set null before build
  const [screen, setScreen] = useState<Screen>(DEV_PREVIEW ? 'tracking' : 'idle');
  const [wizardStep, setWizardStep] = useState(0);
  const [origin, setOrigin] = useState<Place | null>(DEV_PREVIEW ? { text: 'Estr. Pedro Pereira Pinto, 6d', lat: -22.9818, lng: -43.2945, placeId: 'dev' } : null);
  const [destination, setDestination] = useState<Place | null>(DEV_PREVIEW ? { text: 'Tijuca, Rio de Janeiro', lat: -22.9253, lng: -43.2350, placeId: 'dev' } : null);
  const [loading, setLoading] = useState(false);
  const [ride, setRide] = useState<Ride | null>(DEV_PREVIEW ? {
    id: 'dev-preview', passenger_id: 'dev', status: DEV_PREVIEW, ride_type: 'normal',
    origin_lat: -22.9818, origin_lng: -43.2945, origin_text: 'Estr. Pedro Pereira Pinto, 6d',
    dest_lat: -22.9253, dest_lng: -43.2350, destination_text: 'Tijuca, Rio de Janeiro',
    requested_at: new Date().toISOString(),
    driver: { name: 'Aparecido Goes', vehicle_model: 'Templa 2026', vehicle_plate: 'NDHXU', vehicle_color: 'Branco' },
  } : null);
  const [userName, setUserName] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userAddress, setUserAddress] = useState('Minha localização');
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showNoDriver, setShowNoDriver] = useState(false);

  // Community status (Base KAVIAR)
  const [communityStatus, setCommunityStatus] = useState<{ communityName: string; driversOnline: number } | null>(null);
  const noDriverHasOnlinePartners = communityStatus?.driversOnline != null
    ? communityStatus.driversOnline > 0
    : null;
  const noDriverTitle = ride?.scheduled_for
    ? 'Agenda ainda sem motorista confirmado'
    : noDriverHasOnlinePartners === false
      ? 'Estamos crescendo na sua região'
      : 'Alta demanda na sua região';
  const noDriverBody = ride?.scheduled_for
    ? 'Para este horário, ainda estamos tentando localizar um motorista parceiro disponível na sua região. Você pode buscar novamente agora ou tentar em alguns minutos.'
    : noDriverHasOnlinePartners === false
      ? 'Sua área já está recebendo pedidos pelo KAVIAR, mas neste momento ainda estamos ampliando a disponibilidade de motoristas próximos. Tente novamente em alguns minutos ou indique um motorista parceiro para ajudar a melhorar o atendimento na sua região.'
      : 'Neste momento, sua área está com alta procura por corridas e estamos tentando localizar motoristas parceiros próximos para atender você.\n\nVocê pode tentar novamente agora ou aguardar alguns minutos.';

  // Return home card
  const [showReturnCard, setShowReturnCard] = useState(false);
  const [homePlace, setHomePlace] = useState<Place | null>(null);

  // Price estimate
  const [estimate, setEstimate] = useState<{ price: number; distance_km: number; wait_charge_estimate?: number | null } | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  // Trip composition
  const [passengerCount, setPassengerCount] = useState(1);
  const [hasLuggage, setHasLuggage] = useState(false);
  const [waitEstimatedMin, setWaitEstimatedMin] = useState<number | null>(null);
  const [postWaitDest, setPostWaitDest] = useState<{ lat: number; lng: number; text: string } | null>(null);
  const [postWaitSearchMode, setPostWaitSearchMode] = useState(false);

  // Schedule
  type ScheduleOption = 'now' | '15min' | '30min' | 'custom';
  const [scheduleOption, setScheduleOption] = useState<ScheduleOption>('now');
  const [customTime, setCustomTime] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Buffer para compensar latência de rede nos atalhos relativos
  const SCHEDULE_BUFFER_MS = 30_000;

  const getScheduledFor = (): string | undefined => {
    if (scheduleOption === 'now') return undefined;
    if (scheduleOption === '15min') return new Date(Date.now() + 15 * 60_000 + SCHEDULE_BUFFER_MS).toISOString();
    if (scheduleOption === '30min') return new Date(Date.now() + 30 * 60_000 + SCHEDULE_BUFFER_MS).toISOString();
    return customTime?.toISOString();
  };

  const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const getScheduleLabel = (): string => {
    const sf = getScheduledFor();
    return sf ? fmtTime(new Date(sf)) : '';
  };

  // Accepted banner
  const [showAcceptedBanner, setShowAcceptedBanner] = useState(false);
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  // Completed modal
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedRide, setCompletedRide] = useState<Ride | null>(null);

  // Emergency
  const [showEmergency, setShowEmergency] = useState(false);

  // Internal ride messages
  const [showRideMessageModal, setShowRideMessageModal] = useState(false);
  const [messageSending, setMessageSending] = useState(false);

  // Women preference (for RideWizard note)
  const [preferWomanDriver, setPreferWomanDriver] = useState(false);

  // Driver photo
  const [photoError, setPhotoError] = useState(false);
  const stablePhotoUrl = useRef<string | null>(null);

  // Vehicle photo
  const [vehiclePhotoError, setVehiclePhotoError] = useState(false);
  const stableVehiclePhotoUrl = useRef<string | null>(null);

  // Adjustment modal
  const [showAdjustment, setShowAdjustment] = useState(false);
  const adjustmentShownForRef = useRef<string | null>(null);

  // Boarding status
  const [boardingStatus, setBoardingStatus] = useState<string | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);

  // Redispatch banner
  const [showRedispatch, setShowRedispatch] = useState(false);

  // Map focus mode (compact bottomSheet to show driver on map)
  const [mapFocusMode, setMapFocusMode] = useState(false);

  // Moto accept modal (flag-guarded)
  const [showMotoAccept, setShowMotoAccept] = useState(false);
  const [motoConsented, setMotoConsented] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<'car' | 'moto'>('car');
  const [selectedService, setSelectedService] = useState<SelectableService>('car');
  const [showMotoUnavailable, setShowMotoUnavailable] = useState(false);
  const motoServiceAvailable = MOTO_FLAGS.enabled && MOTO_FLAGS.motoPassageiroVisible;
  const motoEstimatePrice: number | null = null;
  const motoServiceSelectable = motoServiceAvailable && motoEstimatePrice !== null;
  const motoUnavailableText = motoServiceAvailable && motoEstimatePrice === null
    ? 'Preço da Moto Passageiro indisponível no momento.'
    : undefined;

  // Se navegou da Home com vehicle=moto (já aceitou termos)
  useEffect(() => {
    if (params.vehicle === 'moto' && MOTO_FLAGS.enabled) {
      setSelectedVehicle('moto');
      setSelectedService('moto_passenger');
      setMotoConsented(true);
    }
  }, []);

  const handleSelectService = (service: SelectableService) => {
    if (service === 'car') {
      setSelectedService('car');
      setSelectedVehicle('car');
      setMotoConsented(false);
      setWizardStep(2);
      return;
    }

    if (!motoServiceSelectable) return;

    setSelectedService('moto_passenger');
    setSelectedVehicle('moto');
    if (motoConsented) {
      setWizardStep(2);
      return;
    }
    setShowMotoAccept(true);
  };

  const handleSelectSharedRides = () => {
    router.push('/(passenger)/fixed-routes');
  };

  useFocusEffect(
    useCallback(() => {
      void ensurePassengerPushTokenRegistration('passenger-map');
    }, [])
  );

  // Search microcopy rotation
  const SEARCH_PHRASES = [
    'Verificando motoristas próximos',
    'Mantendo sua solicitação ativa',
    'Avisaremos assim que houver aceite',
  ];
  const [searchPhraseIdx, setSearchPhraseIdx] = useState(0);

  // ETA helper
  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userPhone, setUserPhone] = useState('');
  const [hasRecentFixedRouteMessages, setHasRecentFixedRouteMessages] = useState(false);
  const fixedRouteNotificationState = getFixedRouteNotificationState();

  const refreshFixedRouteBadge = async () => {
    try {
      const summary = await passengerApi.getFixedRouteMessagesSummary();
      const lastSeenMap = await getFixedRouteLastSeenMap(summary.map((item) => item.reservation_id));
      const { recentReservationIds, recentRouteIds } = computeRecentFixedRouteMessages(summary, lastSeenMap);
      syncFixedRouteNotificationState(summary, recentReservationIds, recentRouteIds);
      setHasRecentFixedRouteMessages(recentReservationIds.size > 0);
    } catch (error) {
      console.warn('[Passenger Map] Fixed route badge refresh failed:', error);
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    refreshFixedRouteBadge();
  }, [isFocused]);

  const drawerItems: DrawerItem[] = [
    { key: 'profile', label: 'Perfil', icon: 'person-outline', onPress: () => router.push('/(passenger)/profile') },
    { key: 'history', label: 'Histórico de corridas', icon: 'time-outline', onPress: () => router.push('/(passenger)/history') },
    { key: 'groups', label: 'Meus Grupos KAVIAR', icon: 'people-outline', onPress: () => router.push('/(passenger)/groups') },
    {
      key: 'fixed-routes',
      label: 'Minhas Corridas Compartilhadas',
      icon: 'repeat-outline',
      badge: (hasRecentFixedRouteMessages || fixedRouteNotificationState.recentRouteIds.size > 0 || fixedRouteNotificationState.recentReservationIds.size > 0) ? '•' : undefined,
      onPress: () => router.push('/(passenger)/fixed-routes')
    },
    { key: 'favorites', label: 'Favoritos', icon: 'heart-outline', onPress: () => router.push('/(passenger)/favorites') },
    { key: 'tourism', label: 'Turismo Premium', icon: 'diamond-outline', badge: '✦', onPress: () => router.push('/(passenger)/tourism') },
    { key: 'refer', label: 'Indique um motorista', icon: 'people-outline', onPress: () => router.push('/(passenger)/refer-driver') },
    { key: 'help', label: 'Ajuda', icon: 'help-circle-outline', onPress: () => router.push('/(passenger)/help') },
    { key: 'logout', label: 'Sair', icon: 'log-out-outline', danger: true, onPress: () => handleLogout() },
  ];

  // Search state
  const [searchText, setSearchText] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [searchingFor, setSearchingFor] = useState<'origin' | 'destination'>('destination');

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailsRef = useRef(0);
  const mapRef = useRef<MapView>(null);
  const searchRef = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compartilhamento de localização com motorista
  useEffect(() => {
    if (!sharingLocation || !ride?.id) {
      locationWatchRef.current?.remove(); locationWatchRef.current = null; return;
    }
    const rideId = ride.id;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setSharingLocation(false); return; }
      locationWatchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 30 },
        (loc) => { apiClient.post(`/api/v2/rides/${rideId}/passenger-location`, { lat: loc.coords.latitude, lng: loc.coords.longitude }).catch(() => {}); }
      );
    })();
    return () => { locationWatchRef.current?.remove(); locationWatchRef.current = null; };
  }, [sharingLocation, ride?.id]);

  // Parar compartilhamento quando corrida sai de accepted/arrived
  useEffect(() => {
    if (sharingLocation && rideStatus && !['accepted', 'arrived'].includes(rideStatus)) setSharingLocation(false);
  }, [rideStatus]);

  useEffect(() => {
    const user = authStore.getUser();
    if (user?.name) setUserName(user.name);
    if (user?.phone) setUserPhone(user.phone);
    acquireLocation().then(() => {
      // If returning from rating screen with ride destination, use it for return-home check
      const rideDest = params.destLat && params.destLng
        ? { lat: Number(params.destLat), lng: Number(params.destLng) }
        : null;
      checkReturnHome(rideDest);
    });
    recoverActiveRide();
    loadCommunityStatus();
    loadWomenPreference();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recoverActiveRide();
    });

    return () => { stopAll(); sub.remove(); };
  }, []);

  const loadCommunityStatus = async () => {
    try {
      const { data } = await apiClient.get('/api/passengers/me/community-status');
      if (data.success && data.data) setCommunityStatus(data.data);
    } catch { /* silent */ }
  };

  const loadWomenPreference = async () => {
    try {
      const { data } = await apiClient.get('/api/v2/passengers/me/women-preference');
      if (data.success && data.data?.participating && data.data?.prefer_woman_driver_default) {
        setPreferWomanDriver(true);
      }
    } catch { /* silent — não exibe nota se falhar */ }
  };

  const recoverActiveRide = async () => {
    try {
      const active = await passengerApi.getActiveRide();
      if (active && !['completed', 'canceled_by_passenger', 'canceled_by_driver', 'no_driver'].includes(active.status)) {
        await persistPassengerRide(active);
        setRide(active);
        stablePhotoUrl.current = active.driver?.photo_url || null;
        stableVehiclePhotoUrl.current = active.driver?.vehicle_photo_url || null;
        setScreen('tracking');
        stopPolling();
        startPolling(active.id);
      } else {
        await persistPassengerRide(null);
      }
    } catch (e) {
      console.warn('[Map] recoverActiveRide failed:', e);
      // Offline fallback: load cached ride
      const cached = await getPersistedPassengerRide();
      if (cached && !['completed', 'canceled_by_passenger', 'canceled_by_driver', 'no_driver'].includes(cached.status)) {
        setRide(cached);
        stablePhotoUrl.current = cached.driver?.photo_url || null;
        stableVehiclePhotoUrl.current = cached.driver?.vehicle_photo_url || null;
        setScreen('tracking');
      }
    }
  };

  // Q2: Rotate search phrases while looking for driver
  useEffect(() => {
    const rideStatus = ride?.status as RideStatus | undefined;
    if (screen === 'tracking' && (rideStatus === 'requested' || rideStatus === 'offered')) {
      const id = setInterval(() => setSearchPhraseIdx(i => (i + 1) % SEARCH_PHRASES.length), 4000);
      return () => clearInterval(id);
    }
    setSearchPhraseIdx(0);
  }, [screen, ride?.status]);

  const acquireLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Localização necessária', 'Ative a localização para solicitar corridas.'); return; }
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLocation(coords);
      // Set origin to current location by default
      setOrigin({ text: 'Minha localização', lat: coords.lat, lng: coords.lng, placeId: 'current' });
      // Reverse geocode for display
      try {
        const url = `/api/geo-proxy/reverse?lat=${coords.lat}&lng=${coords.lng}`;
        const res = await apiClient.get(url);
        const data = res.data;
        if (data.status === 'OK' && data.results[0]) {
          const addr = data.results[0].formatted_address.split(',').slice(0, 2).join(',');
          setUserAddress(addr);
          setOrigin(prev => prev ? { ...prev, text: addr } : null);
        }
      } catch (e) {
        console.warn('[Map] reverse geocode failed, using default label:', e);
      }
    } catch { Alert.alert('Erro de GPS', 'Não foi possível obter sua localização.'); }
  };

  // --- Search ---
  const openSearch = (target: 'origin' | 'destination') => {
    setSearchingFor(target);
    setSearchText('');
    setPredictions([]);
    setAddressSearching(false);
    setScreen('search');
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  const searchPlaces = useCallback((input: string) => {
    setSearchText(input);
    if (input.length < 3) { setPredictions([]); setAddressSearching(false); return; }
    setAddressSearching(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const loc = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
        const url = `/api/geo-proxy/autocomplete?input=${encodeURIComponent(input)}${loc}`;
        const res = await apiClient.get(url);
        const data = res.data;
        setPredictions(data.status === 'OK' ? data.predictions : []);
      } catch (e) {
        console.warn('[Map] autocomplete failed:', e);
        setPredictions([]);
      } finally {
        setAddressSearching(false);
      }
    }, 300);
  }, [userLocation]);

  const selectPlace = useCallback(async (p: Prediction) => {
    Keyboard.dismiss();
    try {
      const url = `/api/geo-proxy/place-details?place_id=${p.place_id}`;
      const res = await apiClient.get(url);
      const data = res.data;
      if (data.status === 'OK') {
        const loc = data.result.geometry.location;
        const place: Place = { text: p.description, lat: loc.lat, lng: loc.lng, placeId: p.place_id };
        if (searchingFor === 'origin') setOrigin(place);
        else if (postWaitSearchMode) { setPostWaitDest({ lat: loc.lat, lng: loc.lng, text: p.description }); setPostWaitSearchMode(false); }
        else setDestination(place);
      }
    } catch (e) {
      console.warn('[Map] selectPlace failed:', e);
      Alert.alert('Erro', friendlyError(e, 'Não foi possível selecionar o endereço. Tente novamente.'));
    }
    setScreen('idle');
  }, [searchingFor, postWaitSearchMode]);

  const useCurrentLocation = () => {
    if (userLocation) {
      setOrigin({ text: userAddress, lat: userLocation.lat, lng: userLocation.lng, placeId: 'current' });
    }
    setScreen('idle');
  };

  // --- Estimate ---
  useEffect(() => {
    if (!origin || !destination) { setEstimate(null); return; }
    setEstimateLoading(true);
    apiClient.post('/api/v2/rides/estimate', {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      ...(postWaitDest ? { post_wait_destination: { lat: postWaitDest.lat, lng: postWaitDest.lng } } : {}),
      ...(waitEstimatedMin ? { wait_estimated_min: waitEstimatedMin } : {}),
    }).then(r => setEstimate(r.data?.data || null))
      .catch(() => {})
      .finally(() => setEstimateLoading(false));
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, postWaitDest?.lat, postWaitDest?.lng, waitEstimatedMin]);

  // --- Ride ---
  const lastStatusRef = useRef('');
  const lastMessageAtRef = useRef<string | null>(null);
  const cancelAlertRideRef = useRef<string | null>(null);
  const rideNotificationState = (globalThis as any).__kaviarRideNotificationState || ((globalThis as any).__kaviarRideNotificationState = { seenMessageIds: new Set<string>(), seenCancelKeys: new Set<string>() });

  const pollRideMessages = useCallback(async (rideId: string) => {
    try {
      const messages = await passengerApi.getRideMessages(rideId);
      const newMessages = messages.filter((msg: any) => msg?.sender_type === 'driver' && msg?.created_at && (!lastMessageAtRef.current || msg.created_at > lastMessageAtRef.current));
      for (const msg of newMessages) {
        if (rideNotificationState.seenMessageIds.has(msg.id)) continue;
        rideNotificationState.seenMessageIds.add(msg.id);
        lastMessageAtRef.current = msg.created_at;
        const messageText = RIDE_QUICK_MESSAGE_TEXT_BY_CODE[msg.message_code as RideQuickMessageCode] || 'Nova mensagem na corrida.';
        Alert.alert('Mensagem do motorista', messageText);
      }
      if (!lastMessageAtRef.current && messages.length > 0) {
        lastMessageAtRef.current = messages[messages.length - 1].created_at || null;
      }
    } catch (e) {
      console.warn('[Map] ride messages polling failed:', e);
    }
  }, []);

  const startPolling = (rideId: string) => {
    pollFailsRef.current = 0;
    const poll = async () => {
      try {
        const updated = await passengerApi.getRide(rideId);
        pollFailsRef.current = 0;
        setRide(updated);
        persistPassengerRide(updated);
        // Stabilize driver photo URL (avoid flicker from changing presigned params)
        const newBase = updated.driver?.photo_url?.split('?')[0] || null;
        const oldBase = stablePhotoUrl.current?.split('?')[0] || null;
        if (newBase !== oldBase) stablePhotoUrl.current = updated.driver?.photo_url || null;
        // Stabilize vehicle photo URL
        const newVBase = updated.driver?.vehicle_photo_url?.split('?')[0] || null;
        const oldVBase = stableVehiclePhotoUrl.current?.split('?')[0] || null;
        if (newVBase !== oldVBase) stableVehiclePhotoUrl.current = updated.driver?.vehicle_photo_url || null;
        // Update driver location from polling
        if (updated.driver?.last_lat && updated.driver?.last_lng) {
          setDriverLocation({ lat: updated.driver.last_lat, lng: updated.driver.last_lng });
        }
        // Feedback tátil nas transições importantes
        if (updated.status !== lastStatusRef.current) {
          if (['accepted', 'arrived', 'started', 'in_progress'].includes(updated.status)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          if (updated.status === 'pending_adjustment' && adjustmentShownForRef.current !== updated.id) {
            adjustmentShownForRef.current = updated.id;
            setShowAdjustment(true);
          }
          if (updated.status === 'accepted') {
            setShowAdjustment(false);
            setShowRedispatch(false);
            setShowAcceptedBanner(true);
            setPhotoError(false);
            setVehiclePhotoError(false);
            Animated.sequence([
              Animated.timing(bannerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
              Animated.delay(4000),
              Animated.timing(bannerOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
            ]).start(() => setShowAcceptedBanner(false));
          }
          // If status changed away from pending_adjustment (timeout/backend redispatch), close modal
          if (lastStatusRef.current === 'pending_adjustment' && updated.status !== 'pending_adjustment') {
            setShowAdjustment(false);
            adjustmentShownForRef.current = null;
          }
          // Redispatch detection: accepted/arrived → requested/offered
          if (['accepted', 'arrived'].includes(lastStatusRef.current) && ['requested', 'offered'].includes(updated.status)) {
            setShowRedispatch(true);
            setDriverLocation(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          lastStatusRef.current = updated.status;
          setMapFocusMode(false);
        }
        await pollRideMessages(rideId);

        if (['completed', 'canceled_by_passenger', 'canceled_by_driver', 'no_driver'].includes(updated.status)) {
          stopAll();
          if (updated.status === 'completed') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCompletedRide(updated);
            setShowCompleted(true);
          } else if (updated.status === 'no_driver') {
            setShowNoDriver(true);
          } else if (updated.status === 'canceled_by_driver') {
            const cancelKey = updated.id + ':driver';
            if (!rideNotificationState.seenCancelKeys.has(cancelKey) && cancelAlertRideRef.current !== updated.id) {
              rideNotificationState.seenCancelKeys.add(cancelKey);
              cancelAlertRideRef.current = updated.id;
              Alert.alert('Corrida cancelada', 'O motorista cancelou a corrida.', [
                { text: 'OK', onPress: () => resetToIdle() }
              ]);
            } else {
              resetToIdle();
            }
          } else if (updated.status === 'canceled_by_passenger') {
            resetToIdle();
          }
          return; // don't schedule next poll
        }
      } catch (e) {
        pollFailsRef.current = Math.min(pollFailsRef.current + 1, 10);
        console.warn('[Map] ride polling failed:', e);
      }
      const delay = POLL_BACKOFF_P[Math.min(pollFailsRef.current, POLL_BACKOFF_P.length - 1)];
      pollRef.current = setTimeout(poll, delay);
    };
    pollRef.current = setTimeout(poll, POLL_BACKOFF_P[0]);
  };

  const stopPolling = () => { if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; } };
  const stopAll = () => { stopPolling(); setDriverLocation(null); };

  const checkReturnHome = async (rideDestination?: { lat: number; lng: number } | null) => {
    try {
      // Use ride destination if available (most reliable after ride completion)
      // Otherwise try GPS, then state, then lastKnown
      let loc = rideDestination || null;
      let locSource = loc ? 'rideDestination' : 'none';
      if (!loc) {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, maximumAge: 10000 });
          loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          locSource = 'gps';
        } catch {
          loc = userLocation;
          locSource = loc ? 'state' : 'none';
          if (!loc) {
            try {
              const last = await Location.getLastKnownPositionAsync();
              if (last) { loc = { lat: last.coords.latitude, lng: last.coords.longitude }; locSource = 'lastKnown'; }
            } catch { /* exhausted */ }
          }
        }
      }
      if (!loc) { console.warn('[checkReturnHome] BAIL: no location'); return; }
      console.log(`[checkReturnHome] loc via ${locSource}: ${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`);

      const { data: favData } = await apiClient.get('/api/passenger/favorites/home');
      if (!favData.success || !favData.home) { console.warn('[checkReturnHome] BAIL: no HOME'); return; }
      const home = favData.home;
      if (!home.lat || !home.lng) { console.warn('[checkReturnHome] BAIL: HOME no coords'); return; }

      const R = 6371000;
      const dLat = (Number(home.lat) - loc.lat) * Math.PI / 180;
      const dLng = (Number(home.lng) - loc.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(loc.lat*Math.PI/180) * Math.cos(Number(home.lat)*Math.PI/180) * Math.sin(dLng/2)**2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      console.log(`[checkReturnHome] dist=${Math.round(dist)}m, home=${home.lat},${home.lng}`);
      if (dist < 1000) { console.warn(`[checkReturnHome] BAIL: too close (${Math.round(dist)}m)`); return; }

      const { data: csData } = await apiClient.get('/api/passengers/me/community-status');
      console.log('[checkReturnHome] community-status:', JSON.stringify(csData?.data));
      if (!csData.success || !csData.data || csData.data.driversOnline < 1) { console.warn('[checkReturnHome] BAIL: no drivers'); return; }

      setHomePlace({ text: home.label || 'Casa', lat: Number(home.lat), lng: Number(home.lng), placeId: '' });
      setShowReturnCard(true);
      console.log('[checkReturnHome] ✅ card SHOWN');
    } catch (e) { console.warn('[checkReturnHome] EXCEPTION:', e); }
  };
  const resetToIdle = (rideDestination?: { lat: number; lng: number } | null) => { stopAll(); setRide(null); persistPassengerRide(null); setScreen('idle'); setDestination(null); setEstimate(null); setPassengerCount(1); setHasLuggage(false); setWaitEstimatedMin(null); setPostWaitDest(null); setShowAdjustment(false); adjustmentShownForRef.current = null; setBoardingStatus(null); setScheduleOption('now'); setCustomTime(null); setShowRedispatch(false); setWizardStep(0); setSelectedService('car'); setSelectedVehicle('car'); setMotoConsented(false); setSharingLocation(false); lastMessageAtRef.current = null; cancelAlertRideRef.current = null; checkReturnHome(rideDestination); };
  const rideEndLocation = (r: Ride | null) => {
    if (!r) return null;
    const pwd = (r as any).trip_details?.post_wait_destination;
    return pwd?.lat && pwd?.lng ? { lat: pwd.lat, lng: pwd.lng } : { lat: r.dest_lat, lng: r.dest_lng };
  };
  const handleRetry = () => { stopPolling(); setRide(null); setScreen('idle'); setShowAdjustment(false); adjustmentShownForRef.current = null; setBoardingStatus(null); };

  const handleBoardingStatus = async (status: 'at_door' | 'descending' | '2_minutes') => {
    if (!ride) return;
    setBoardingStatus(status);
    try { await passengerApi.sendBoardingStatus(ride.id, status); } catch {}
  };

  const handleSendRideMessage = async (messageCode: RideQuickMessageCode) => {
    if (!ride || messageSending) return;
    setMessageSending(true);
    try {
      await passengerApi.sendRideMessage(ride.id, messageCode);
      setShowRideMessageModal(false);
      Alert.alert('Mensagem enviada', 'O motorista recebeu sua mensagem pelo KAVIAR.');
    } catch (e: any) {
      Alert.alert('Erro', friendlyError(e, 'Não foi possível enviar a mensagem.'));
    } finally {
      setMessageSending(false);
    }
  };

  const handleAdjustmentAccept = async () => {
    if (!ride) return;
    if (!isConnected) { Alert.alert('Sem internet', 'Sem internet no momento. Assim que a conexão voltar, tente novamente.'); return; }
    try {
      await passengerApi.respondAdjustment(ride.id, true);
    } catch (e: any) {
      Alert.alert('Erro', friendlyError(e, 'Não foi possível confirmar. Tente novamente.'));
    }
    setShowAdjustment(false);
  };

  const handleAdjustmentReject = async () => {
    if (!ride) return;
    if (!isConnected) { Alert.alert('Sem internet', 'Sem internet no momento. Assim que a conexão voltar, tente novamente.'); return; }
    try {
      await passengerApi.respondAdjustment(ride.id, false);
    } catch (e: any) {
      Alert.alert('Erro', friendlyError(e, 'Não foi possível recusar. Tente novamente.'));
    }
    setShowAdjustment(false);
    adjustmentShownForRef.current = null;
  };

  const handleAdjustmentTimeout = () => {
    setShowAdjustment(false);
    adjustmentShownForRef.current = null;
  };

  const handleRequest = async () => {
    if (!origin) { Alert.alert('Origem indisponível', 'Aguarde o GPS ou selecione um endereço.'); return; }
    if (!destination) { Alert.alert('Selecione o destino', 'Para onde você vai?'); return; }
    if (waitEstimatedMin !== null && !postWaitDest) {
      Alert.alert(
        'Sem destino após a espera',
        'O valor incluirá apenas a ida até a parada + o tempo de espera. Se o motorista deve continuar ou retornar, informe o destino após a espera.',
        [
          { text: 'Informar destino', style: 'cancel' },
          { text: 'Continuar assim', onPress: () => submitRide() },
        ]
      );
      return;
    }
    submitRide();
  };

  const submitRide = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    try {
      const result = await passengerApi.requestRide({
        origin: { lat: origin!.lat, lng: origin!.lng, text: origin!.text },
        destination: { lat: destination!.lat, lng: destination!.lng, text: destination!.text },
        trip_details: { passengers: passengerCount, has_luggage: hasLuggage },
        scheduled_for: getScheduledFor(),
        wait_requested: waitEstimatedMin !== null,
        wait_estimated_min: waitEstimatedMin ?? undefined,
        post_wait_destination: waitEstimatedMin !== null && postWaitDest ? postWaitDest : undefined,
        ...(selectedVehicle === 'moto' && motoConsented ? { service_category: 'MOTO_PASSENGER', passenger_moto_consent: true } : {}),
      });
      const rideData = await passengerApi.getRide(result.ride_id);
      setRide(rideData);
      setScreen('tracking');
      startPolling(result.ride_id);
    } catch (e: any) {
      if (!e.response) {
        // Network failure — enqueue and show feedback
        const { enqueue } = require('../../src/services/offline-queue');
        const body = {
          origin: { lat: origin!.lat, lng: origin!.lng, text: origin!.text },
          destination: { lat: destination!.lat, lng: destination!.lng, text: destination!.text },
          trip_details: { passengers: passengerCount, has_luggage: hasLuggage },
          scheduled_for: getScheduledFor(),
          wait_requested: waitEstimatedMin !== null,
          wait_estimated_min: waitEstimatedMin ?? undefined,
          post_wait_destination: waitEstimatedMin !== null && postWaitDest ? postWaitDest : undefined,
          ...(selectedVehicle === 'moto' && motoConsented ? { service_category: 'MOTO_PASSENGER', passenger_moto_consent: true } : {}),
        };
        await enqueue({ method: 'POST' as const, url: 'https://api.kaviar.com.br/api/v2/rides', body });
        Alert.alert('Sem internet', 'Seu pedido será enviado assim que a conexão voltar. Mantenha o app aberto.');
      } else {
        const errMsg = e?.response?.data?.error || '';
        if (selectedVehicle === 'moto' && motoConsented && (errMsg === 'MOTO_PASSENGER_DISABLED' || errMsg === 'MOTO_PASSENGER_PRICING_NOT_CONFIGURED')) {
          setShowMotoUnavailable(true);
        } else {
          Alert.alert('Erro', friendlyError(e, 'Não foi possível solicitar a corrida.'));
        }
      }
    } finally { setLoading(false); }
  };

  const handleCancel = async () => {
    if (!ride) return;
    const doCancel = async () => {
      try { await passengerApi.cancelRide(ride.id); Alert.alert('Corrida cancelada'); resetToIdle(); }
      catch (e: any) { Alert.alert('Erro', friendlyError(e, 'Não foi possível cancelar.')); }
    };
    if (rideStatus === 'arrived') {
      const rideId = ride.id;
      Alert.alert(
        'O motorista já chegou',
        'Cancelar agora pode prejudicar o motorista, que já se deslocou até você.\n\nSe precisar cancelar por um imprevisto, a gente entende. Você poderá compensar o motorista com um Pix de R$5,00 pela plataforma.',
        [
          { text: 'Voltar para a corrida', style: 'cancel' },
          { text: 'Cancelar mesmo assim', style: 'destructive', onPress: async () => {
            await doCancel();
            Alert.alert(
              'Corrida cancelada',
              'O motorista se deslocou até você. Deseja compensá-lo com R$5,00 via Pix?',
              [
                { text: 'Agora não' },
                { text: 'Compensar motorista — R$5,00', onPress: async () => {
                  try {
                    const { data } = await apiClient.post(`/api/v2/rides/${rideId}/compensation`);
                    if (data?.data?.invoice_url) {
                      Linking.openURL(data.data.invoice_url);
                    } else {
                      Alert.alert('Erro', 'Não foi possível gerar o Pix. Tente novamente.');
                    }
                  } catch (e: any) {
                    Alert.alert('Erro', friendlyError(e, 'Não foi possível gerar o Pix.'));
                  }
                }},
              ]
            );
          }},
        ]
      );
    } else {
      Alert.alert('Cancelar corrida?', 'Deseja realmente cancelar?', [
        { text: 'Não', style: 'cancel' },
        { text: 'Sim, cancelar', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  const handleLogout = async () => {
    stopAll();
    await authStore.clearAuth();
    router.replace('/(auth)/login');
  };

  // --- Focus driver on map ---
  const handleFocusDriverOnMap = () => {
    if (!driverLocation) {
      Alert.alert('Aguarde', 'Ainda aguardando localização do motorista.');
      return;
    }
    if (!mapRef.current) {
      Alert.alert('Mapa', 'Mapa ainda carregando. Tente novamente em alguns segundos.');
      return;
    }
    setMapFocusMode(true);
    mapRef.current.animateToRegion({
      latitude: driverLocation.lat,
      longitude: driverLocation.lng,
      latitudeDelta: 0.0015,
      longitudeDelta: 0.0015,
    }, 800);
  };

  // --- Map region ---
  const rideStatus = ride?.status as RideStatus | undefined;
  const mapTarget = ride ? (
    rideStatus === 'in_progress'
      ? { lat: Number(ride.dest_lat), lng: Number(ride.dest_lng), label: ride.destination_text || 'Destino' }
      : { lat: Number(ride.origin_lat), lng: Number(ride.origin_lng), label: ride.origin_text || 'Origem' }
  ) : null;

  const regionCenter = mapTarget || (destination ? { lat: destination.lat, lng: destination.lng } : null) || userLocation;
  // During tracking search states, fit origin+destination; otherwise use center with tight zoom
  const region: Region | undefined = (() => {
    if (screen === 'tracking' && ride && (rideStatus === 'requested' || rideStatus === 'offered' || rideStatus === 'no_driver')) {
      const oLat = Number(ride.origin_lat), oLng = Number(ride.origin_lng);
      const dLat = Number(ride.dest_lat), dLng = Number(ride.dest_lng);
      const cLat = (oLat + dLat) / 2, cLng = (oLng + dLng) / 2;
      const dLatDelta = Math.abs(oLat - dLat) * 1.5 || 0.02;
      const dLngDelta = Math.abs(oLng - dLng) * 1.5 || 0.02;
      return { latitude: cLat, longitude: cLng, latitudeDelta: Math.max(dLatDelta, 0.02), longitudeDelta: Math.max(dLngDelta, 0.02) };
    }
    return regionCenter ? { latitude: regionCenter.lat, longitude: regionCenter.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 } : undefined;
  })();

  useEffect(() => {
    if (driverLocation && mapTarget && mapRef.current) {
      mapRef.current.fitToCoordinates(
        [{ latitude: driverLocation.lat, longitude: driverLocation.lng }, { latitude: mapTarget.lat, longitude: mapTarget.lng }],
        { edgePadding: { top: 180, right: 80, bottom: 320, left: 80 }, animated: true }
      );
    }
  }, [driverLocation]);

  useEffect(() => {
    if (origin && destination && mapRef.current && screen === 'idle') {
      mapRef.current.fitToCoordinates(
        [{ latitude: origin.lat, longitude: origin.lng }, { latitude: destination.lat, longitude: destination.lng }],
        { edgePadding: { top: 120, right: 60, bottom: 280, left: 60 }, animated: true }
      );
    }
  }, [origin, destination]);

  const canCancel = rideStatus && ['scheduled', 'requested', 'offered', 'pending_adjustment', 'accepted', 'arrived'].includes(rideStatus);
  const info = rideStatus ? STATUS_CONFIG[rideStatus] || STATUS_CONFIG.requested : STATUS_CONFIG.requested;

  // === SEARCH SCREEN ===
  if (screen === 'search') {
    return (
      <SafeAreaView style={s.searchContainer}>
        {/* Header */}
        <View style={s.searchHeader}>
          <TouchableOpacity onPress={() => { setScreen('idle'); setPostWaitSearchMode(false); }} style={s.searchBack}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={s.searchTitle}>{postWaitSearchMode ? 'Destino após a espera' : searchingFor === 'destination' ? 'Para onde?' : 'Ponto de embarque'}</Text>
        </View>

        {/* Input */}
        <View style={s.searchInputWrap}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            ref={searchRef}
            style={s.searchInput}
            placeholder="Digite o endereço..."
            placeholderTextColor={COLORS.textMuted}
            value={searchText}
            onChangeText={searchPlaces}
            autoFocus
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchText(''); setPredictions([]); setAddressSearching(false); }}>
              <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Current location option (only for origin) */}
        {searchingFor === 'origin' && userLocation && (
          <TouchableOpacity style={s.searchItem} onPress={useCurrentLocation}>
            <Ionicons name="navigate" size={20} color={COLORS.primary} style={s.searchItemIcon} />
            <View style={{ flex: 1 }}>
              <Text style={s.searchItemTitle}>Minha localização atual</Text>
              <Text style={s.searchItemSub} numberOfLines={1}>{userAddress}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Results */}
        <ScrollView style={s.searchResults} keyboardShouldPersistTaps="handled">
          {predictions.map((p) => (
            <TouchableOpacity key={p.place_id} style={s.searchItem} onPress={() => selectPlace(p)}>
              <Ionicons name="location-outline" size={20} color={COLORS.textMuted} style={s.searchItemIcon} />
              <Text style={s.searchItemTitle} numberOfLines={2}>{p.description}</Text>
            </TouchableOpacity>
          ))}
          {searchText.length >= 3 && predictions.length === 0 && (
            <Text style={s.searchEmpty}>{addressSearching ? 'Buscando endereços...' : 'Nenhum resultado encontrado'}</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // === MAP + IDLE/TRACKING ===
  return (
    <View style={s.container}>
      {/* Map */}
      {(() => {
        const showRadarOverlay = screen === 'tracking' && (rideStatus === 'requested' || rideStatus === 'offered' || rideStatus === 'no_driver' || (rideStatus === 'accepted' && !driverLocation));
        return region ? (
        <View style={{ flex: 1 }}>
        <MapView ref={mapRef} style={[s.map, screen === 'idle' && wizardStep > 0 && { flex: undefined, height: 120 }]} initialRegion={region} showsUserLocation showsMyLocationButton={false}>
          {screen === 'idle' && origin && origin.placeId !== 'current' && (
            <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title="Origem" pinColor={COLORS.success} />
          )}
          {screen === 'idle' && destination && (
            <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title="Destino" description={destination.text} pinColor={COLORS.danger} />
          )}
          {screen === 'tracking' && mapTarget && (
            <Marker coordinate={{ latitude: mapTarget.lat, longitude: mapTarget.lng }}
              title={rideStatus === 'in_progress' ? 'Destino' : 'Embarque'} description={mapTarget.label}
              pinColor={rideStatus === 'in_progress' ? COLORS.success : COLORS.primary} />
          )}
          {screen === 'tracking' && ride && (rideStatus === 'requested' || rideStatus === 'offered') && (
            <Marker coordinate={{ latitude: Number(ride.dest_lat), longitude: Number(ride.dest_lng) }} title="Destino" description={ride.destination_text} pinColor={COLORS.danger} />
          )}
          {driverLocation && (
            <Marker coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }} title="Motorista">
              <View style={{ backgroundColor: '#F39C12', borderRadius: 20, padding: 8, borderWidth: 2, borderColor: '#fff' }}>
                <Ionicons name="car" size={20} color="#fff" />
              </View>
            </Marker>
          )}
        </MapView>
        {showRadarOverlay && (
          <View style={s.radarOverlay} pointerEvents="none">
            <RadarPulse />
            <Text style={s.mapFallbackBrand}>K</Text>
            <Text style={s.mapFallbackTitle}>{rideStatus === 'accepted' ? 'Motorista a caminho' : 'Buscando motorista'}</Text>
            <Text style={s.mapFallbackSub}>{rideStatus === 'accepted' ? 'Aguardando localização do motorista...' : SEARCH_PHRASES[searchPhraseIdx]}</Text>
            {ride?.driver?.name && <Text style={s.mapFallbackDriver}>🧑‍✈️ {ride.driver.name}</Text>}
          </View>
        )}
        </View>
      ) : (
        <View style={s.mapLoading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={s.mapLoadingText}>Obtendo localização...</Text>
        </View>
      );
      })()}

      {/* IDLE overlay */}
      {screen === 'idle' && (
        <>
          <SafeAreaView edges={['top']} style={s.topBar}>
            <View style={s.header}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={s.backBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Voltar"
                accessibilityRole="button"
              >
                <Ionicons name="arrow-back" size={20} color="#fff" />
                <Text style={s.backBtnText}>Voltar</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={s.brand}>KAVIAR</Text>
                <Text style={s.greeting}>{userName ? `Olá, ${userName}` : 'Passageiro'}</Text>
              </View>
              <TouchableOpacity onPress={() => setDrawerOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="menu" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {communityStatus && screen === 'idle' && !destination && (
            <CommunityStatusCard communityName={communityStatus.communityName} driversOnline={communityStatus.driversOnline} />
          )}

          {showReturnCard && homePlace && screen === 'idle' && (
            <ReturnHomeCard
              homePlace={homePlace}
              onAccept={() => { setShowReturnCard(false); setDestination(homePlace); setScreen('idle'); }}
              onDismiss={() => setShowReturnCard(false)}
            />
          )}

          {wizardStep === 1 ? (
            <View style={s.serviceSelectorSheet}>
              <ServiceSelector
                estimatePrice={estimate?.price ?? null}
                motoEstimatePrice={motoEstimatePrice}
                motoAvailable={motoServiceSelectable}
                motoUnavailableText={motoUnavailableText}
                onSelect={handleSelectService}
                onSelectSharedRides={handleSelectSharedRides}
                selectedService={selectedService}
              />
            </View>
          ) : (
            <RideWizard
              step={wizardStep}
              origin={origin}
              destination={destination}
              onSearchOrigin={() => openSearch('origin')}
              onSearchDestination={() => openSearch('destination')}
              estimate={estimate}
              estimateLoading={estimateLoading}
              passengerCount={passengerCount}
              onPassengerChange={setPassengerCount}
              hasLuggage={hasLuggage}
              onLuggageToggle={() => setHasLuggage(!hasLuggage)}
              waitEstimatedMin={waitEstimatedMin}
              onWaitChange={(min) => { setWaitEstimatedMin(min); if (min === null) setPostWaitDest(null); }}
              postWaitDest={postWaitDest}
              onPostWaitClear={() => setPostWaitDest(null)}
              onPostWaitSearch={() => { setSearchingFor('destination'); setScreen('search'); setPostWaitSearchMode(true); }}
              scheduleOption={scheduleOption}
              onScheduleChange={(opt) => { setScheduleOption(opt); if (opt === 'custom') setShowTimePicker(true); }}
              customTime={customTime}
              scheduleLabel={getScheduleLabel()}
              loading={loading}
              onSubmit={handleRequest}
              onStepChange={setWizardStep}
              preferWomanDriver={preferWomanDriver}
              selectedService={selectedService}
            />
          )}
        </>
      )}

      {/* TRACKING overlay */}
      {screen === 'tracking' && (
        <>
          {!(rideStatus === 'requested' || rideStatus === 'offered' || rideStatus === 'no_driver') && (
          <SafeAreaView edges={['top']} style={[s.statusBar, { backgroundColor: info.color }]}>
            <Text style={s.statusText}>
              {rideStatus === 'scheduled' && ride?.scheduled_for
                ? `🕐 Agendada para ${fmtTime(new Date(ride.scheduled_for))}`
                : `${info.icon} ${info.label}`}
            </Text>
          </SafeAreaView>
          )}

          {/* Safety tip card — shown only during in_progress (accepted/arrived rely on driverCard safetyTip) */}
          {rideStatus === 'in_progress' && (
            <View style={s.safetyCard}>
              <Text style={s.safetyCardIcon}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.safetyCardTitle}>Viaje com segurança</Text>
                <Text style={s.safetyCardText}>Confira a placa e cor do veículo antes de entrar. Compartilhe sua corrida com alguém de confiança.</Text>
              </View>
            </View>
          )}

          <View style={s.bottomSheet}>
            {/* Map focus mode — compact view */}
            {mapFocusMode && rideStatus === 'accepted' ? (
              <>
                {ride?.boarding_code && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>Embarque:</Text>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#C8A84E', letterSpacing: 6 }}>{ride.boarding_code}</Text>
                  </View>
                )}
                {ride?.driver && (
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8 }}>
                    🚗 {ride.driver.name} • {ride.driver.vehicle_plate || ''}
                  </Text>
                )}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border }}
                  onPress={() => setMapFocusMode(false)}
                >
                  <Ionicons name="chevron-up" size={16} color={COLORS.textPrimary} />
                  <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' }}>Voltar aos detalhes</Text>
                </TouchableOpacity>
              </>
            ) : (
            <>
            {/* Boarding code — inside bottomSheet to avoid z-index overlap */}
            {(rideStatus === 'accepted' || rideStatus === 'arrived' || rideStatus === 'started') && ride?.boarding_code && (
              <View style={s.boardingCodeInlineCard}>
                <Text style={s.boardingCodeLabel}>Código de embarque</Text>
                <Text style={s.boardingCodeValue}>{ride.boarding_code}</Text>
                <Text style={s.boardingCodeHint}>Informe este código somente ao motorista indicado no app.</Text>
              </View>
            )}
            {/* Redispatch banner */}
            {showRedispatch && (rideStatus === 'requested' || rideStatus === 'offered') && (
              <View style={s.redispatchCard}>
                <View style={[s.scheduledCardBorder, { backgroundColor: COLORS.warning }]} />
                <View style={s.scheduledCardContent}>
                  <View style={s.alertCardHeader}>
                    <Ionicons name="refresh" size={20} color={COLORS.warning} />
                    <Text style={[s.scheduledCardTitle, { color: COLORS.warning }]}>Procurando outro motorista</Text>
                  </View>
                  <Text style={s.scheduledCardSub}>Seu motorista cancelou. Estamos procurando outro automaticamente.</Text>
                </View>
              </View>
            )}

            {/* Scheduled ride card */}
            {rideStatus === 'scheduled' && ride?.scheduled_for && (
              <View style={s.scheduledCard}>
                <View style={s.scheduledCardBorder} />
                <View style={s.scheduledCardContent}>
                  <View style={s.alertCardHeader}>
                    <Ionicons name="time" size={20} color="#5B9BD5" />
                    <Text style={s.scheduledCardTitle}>Corrida agendada</Text>
                  </View>
                  <Text style={s.scheduledCardSub}>Vamos buscar um motorista perto das {fmtTime(new Date(ride.scheduled_for))}</Text>
                </View>
              </View>
            )}
            {/* Driver arrived — prominent card */}
            {rideStatus === 'arrived' && ride?.driver && (
              <View style={s.alertCard}>
                <View style={s.alertCardBorder} />
                <View style={s.alertCardContent}>
                  <View style={s.alertCardHeader}>
                    <Ionicons name="location" size={20} color={COLORS.primary} />
                    <Text style={s.alertCardTitle}>Motorista chegou!</Text>
                  </View>
                  <Text style={s.alertCardSub}>
                    Procure o {ride.driver.vehicle_model || 'veículo'} {ride.driver.vehicle_color || ''} · {ride.driver.vehicle_plate || ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Boarding status quick actions */}
            {rideStatus === 'arrived' && (
              <View style={s.boardingRow}>
                {([
                  { key: 'at_door' as const, icon: '🚪', label: 'Na porta' },
                  { key: 'descending' as const, icon: '🏃', label: 'Descendo' },
                  { key: '2_minutes' as const, icon: '⏱️', label: '2 min' },
                ] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.boardingBtn, boardingStatus === opt.key && s.boardingBtnActive]}
                    onPress={() => handleBoardingStatus(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.boardingIcon}>{opt.icon}</Text>
                    <Text style={[s.boardingLabel, boardingStatus === opt.key && s.boardingLabelActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {ride?.driver && rideStatus !== 'arrived' && (
              <View style={s.driverCard}>
                <View style={s.driverRow}>
                  <View style={s.driverAvatar}>
                    {!photoError && stablePhotoUrl.current ? (
                      <Image
                        source={{ uri: stablePhotoUrl.current }}
                        style={s.driverPhoto}
                        onError={() => setPhotoError(true)}
                      />
                    ) : (
                      <Ionicons name="person" size={20} color={COLORS.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.driverName}>{ride.driver.name}</Text>
                    {ride.driver.vehicle_model && (
                      <Text style={s.driverVehicle}>
                        {ride.driver.vehicle_model} {ride.driver.vehicle_color} • {ride.driver.vehicle_plate}
                      </Text>
                    )}
                    <DriverExcellenceIndicator sealActive={!!ride.driver.has_excellence_seal} />
                  </View>
                </View>
                <View style={s.safetyTip}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.accent} />
                  <Text style={s.safetyTipText}>Confira a placa e a cor do veículo antes de entrar.</Text>
                </View>
                {!vehiclePhotoError && stableVehiclePhotoUrl.current && (
                  <Image
                    source={{ uri: stableVehiclePhotoUrl.current }}
                    style={s.vehiclePhoto}
                    resizeMode="cover"
                    onError={() => setVehiclePhotoError(true)}
                  />
                )}
              </View>
            )}
            {/* Q3: ETA do motorista */}
            {rideStatus === 'accepted' && driverLocation && ride && (
              <View style={s.alertCardInfo}>
                <Ionicons name="time-outline" size={16} color="#5B9BD5" />
                <Text style={s.alertCardInfoText}>
                  {(() => {
                    const km = haversineKm(driverLocation.lat, driverLocation.lng, Number(ride.origin_lat), Number(ride.origin_lng));
                    const min = Math.max(1, Math.round(km / 30 * 60));
                    return min <= 1 ? 'Chegando!' : `~${min} min para chegar`;
                  })()}
                </Text>
              </View>
            )}
            {rideStatus === 'in_progress' && driverLocation && ride && (
              <View style={s.progressCard}>
                {(() => {
                  const totalKm = haversineKm(Number(ride.origin_lat), Number(ride.origin_lng), Number(ride.dest_lat), Number(ride.dest_lng));
                  const remainKm = haversineKm(driverLocation.lat, driverLocation.lng, Number(ride.dest_lat), Number(ride.dest_lng));
                  const progress = totalKm > 0 ? Math.min(1, Math.max(0, (totalKm - remainKm) / totalKm)) : 0;
                  const min = Math.max(1, Math.round(remainKm / 30 * 60));
                  const label = remainKm < 0.3 ? 'Chegando ao destino!' : `~${min} min • ${remainKm.toFixed(1)} km`;
                  return (
                    <>
                      <View style={s.progressRow}>
                        <Ionicons name="navigate" size={14} color={COLORS.success} />
                        <Text style={s.progressText}>{label}</Text>
                      </View>
                      <View style={s.progressBarBg}>
                        <View style={[s.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
                      </View>
                    </>
                  );
                })()}
              </View>
            )}
            {rideStatus === 'in_progress' && (
              <KaviarHub
                rideId={ride?.id}
                waitStartedAt={ride?.wait_started_at}
                waitEndedAt={ride?.wait_ended_at}
                postWaitDestText={ride?.trip_details?.post_wait_destination?.text}
                neighborhoodName={communityStatus?.communityName}
              />
            )}
            <View style={s.routeCompact}>
              <Text style={s.label}>{rideStatus === 'in_progress' ? 'Destino' : 'Origem'}</Text>
              <Text style={s.value} numberOfLines={1}>{mapTarget?.label || '—'}</Text>
            </View>
            {canCancel && (
              <Button title="Cancelar Corrida" variant="danger" onPress={handleCancel} style={{ marginTop: 12 }} />
            )}
            {(rideStatus === 'accepted' || rideStatus === 'arrived' || rideStatus === 'started') && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 10, borderRadius: 10, backgroundColor: sharingLocation ? '#1a3a1a' : '#1a1a2e', borderWidth: 1, borderColor: sharingLocation ? COLORS.success : '#333' }}
                onPress={() => setSharingLocation(!sharingLocation)}
              >
                <Ionicons name={sharingLocation ? 'navigate' : 'navigate-outline'} size={15} color={sharingLocation ? COLORS.success : COLORS.textMuted} />
                <Text style={{ color: sharingLocation ? COLORS.success : COLORS.textMuted, fontSize: 13, fontWeight: '600' }}>
                  {sharingLocation ? '📍 Localização compartilhada — Parar' : 'Compartilhar localização com motorista'}
                </Text>
              </TouchableOpacity>
            )}
            {(rideStatus === 'accepted' || rideStatus === 'arrived' || rideStatus === 'in_progress' || rideStatus === 'pending_adjustment') && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 14, marginBottom: 8, flexWrap: 'wrap' }}>
                {rideStatus === 'accepted' && (
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: COLORS.accent }} onPress={handleFocusDriverOnMap}>
                    <Ionicons name="car" size={15} color={COLORS.accent} />
                    <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '600' }}>Ver motorista</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#14351f', borderWidth: 1, borderColor: COLORS.accent }} onPress={() => setShowRideMessageModal(true)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color={COLORS.accent} />
                  <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '600' }}>Mensagem ao motorista</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#1a2a3a' }} onPress={async () => {
                  if (!ride?.id) return;
                  try {
                    const { data } = await apiClient.post(`/api/v2/rides/${ride.id}/share`);
                    Share.share({ message: `Acompanhe minha corrida KAVIAR em tempo real:\n${data.url}` });
                  } catch { Share.share({ message: `Estou em uma corrida KAVIAR. Motorista: ${ride?.driver?.name || '?'}, Placa: ${ride?.driver?.vehicle_plate || '?'}` }); }
                }}>
                  <Ionicons name="location-outline" size={15} color="#3498db" />
                  <Text style={{ color: '#3498db', fontSize: 13, fontWeight: '600' }}>Compartilhar corrida</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.emergencyBtn} onPress={() => setShowEmergency(true)}>
                  <Ionicons name="shield-outline" size={16} color={COLORS.danger} />
                  <Text style={s.emergencyBtnText}>Emergência</Text>
                </TouchableOpacity>
              </View>
            )}
            </>
            )}
          </View>
        </>
      )}

      {/* ADJUSTMENT MODAL */}
      <AdjustmentModal
        visible={isFocused && showAdjustment}
        quotedPrice={Number(ride?.quoted_price || 0)}
        driverAdjustment={Number(ride?.driver_adjustment || 0)}
        adjustedPrice={Number(ride?.adjusted_price || 0)}
        driverName={ride?.driver?.name}
        vehicleInfo={ride?.driver ? `${ride.driver.vehicle_model || ''} ${ride.driver.vehicle_color || ''}`.trim() + (ride.driver.vehicle_plate ? ` • ${ride.driver.vehicle_plate}` : '') : undefined}
        rideUpdatedAt={ride?.updated_at}
        onAccept={handleAdjustmentAccept}
        onReject={handleAdjustmentReject}
        onTimeout={handleAdjustmentTimeout}
      />

      {/* ACCEPTED BANNER */}
      {showAcceptedBanner && ride?.driver && (
        <Animated.View style={[s.acceptedBanner, { opacity: bannerOpacity }]}>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.acceptedBannerTitle}>{ride.driver.name} está a caminho!</Text>
            {ride.driver.vehicle_model && (
              <Text style={s.acceptedBannerSub}>{ride.driver.vehicle_model} {ride.driver.vehicle_color} • {ride.driver.vehicle_plate}</Text>
            )}
          </View>
        </Animated.View>
      )}

      {/* COMPLETED MODAL */}
      <RideCompletedModal
        visible={isFocused && showCompleted}
        ride={completedRide}
        onRate={() => {
          setShowCompleted(false);
          router.push({ pathname: '/(passenger)/rating', params: { rideId: completedRide?.id || '', driverName: completedRide?.driver?.name || '', driverId: completedRide?.driver?.id || completedRide?.driver_id || '', destLat: String(completedRide?.dest_lat || ''), destLng: String(completedRide?.dest_lng || '') } });
        }}
        onClose={() => { setShowCompleted(false); resetToIdle(rideEndLocation(completedRide)); }}
      />

      {/* EMERGENCY MODAL */}
      <Modal visible={isFocused && showRideMessageModal} transparent animationType="fade" onRequestClose={() => setShowRideMessageModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Mensagem ao motorista</Text>
            <Text style={s.modalBody}>Escolha uma mensagem rápida para enviar pelo KAVIAR.</Text>
            {PASSENGER_TO_DRIVER_RIDE_QUICK_MESSAGES.map((msg) => (
              <TouchableOpacity key={msg.code} style={s.ctaPrimary} disabled={messageSending} onPress={() => handleSendRideMessage(msg.code)}>
                <Text style={s.ctaPrimaryText}>{msg.text}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.ctaLink} onPress={() => setShowRideMessageModal(false)}>
              <Text style={s.ctaLinkText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isFocused && showEmergency} transparent animationType="fade" onRequestClose={() => setShowEmergency(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Ionicons name="shield-checkmark" size={36} color={COLORS.danger} style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={[s.modalTitle, { textAlign: 'center' }]}>Ajuda urgente</Text>
            <Text style={[s.modalBody, { textAlign: 'center', marginBottom: 18, fontSize: 13 }]}>Em situação de risco imediato, ligue para a emergência pública.</Text>

            <TouchableOpacity style={[s.ctaPrimary, { backgroundColor: COLORS.danger }]} onPress={() => { setShowEmergency(false); Linking.openURL('tel:190'); }}>
              <Text style={s.ctaPrimaryText}>Ligar 190 — Polícia</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.ctaPrimary, { backgroundColor: '#E67E22', marginTop: 8 }]} onPress={() => { setShowEmergency(false); Linking.openURL('tel:192'); }}>
              <Text style={s.ctaPrimaryText}>Ligar 192 — SAMU</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.ctaPrimary, { backgroundColor: '#2E86C1', marginTop: 8 }]} onPress={() => {
              setShowEmergency(false);
              const loc = userLocation ? `https://maps.google.com/?q=${userLocation.lat},${userLocation.lng}` : '';
              const driverInfo = ride?.driver ? `Motorista: ${ride.driver.name} • ${ride.driver.vehicle_model || ''} ${ride.driver.vehicle_color || ''} • Placa: ${ride.driver.vehicle_plate || ''}` : '';
              Share.share({ message: `🚨 Preciso de ajuda!\n${driverInfo}\n${loc ? `Minha localização: ${loc}` : ''}`.trim() });
            }}>
              <Text style={s.ctaPrimaryText}>Contato de confiança</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.emergencySecondary} onPress={async () => {
              if (!ride?.id) return;
              try {
                await passengerApi.triggerEmergency(ride.id);
                // Immediate location point ("ponto de honra")
                try {
                  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                  await apiClient.post(`/api/v2/rides/${ride.id}/location`, { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
                } catch {}
                Alert.alert('Incidente registrado', 'A Kaviar está acompanhando esta corrida.');
              } catch (emgErr: any) {
                // Network error — enqueue for retry
                if (!emgErr.response) {
                  try {
                    const { enqueue } = require('../../src/services/offline-queue');
                    await enqueue({ method: 'POST' as const, url: `${ENV.API_URL}/api/v2/rides/${ride.id}/emergency`, body: {} });
                    Alert.alert('Sem conexão', 'O registro será enviado quando a conexão voltar.');
                  } catch {
                    // Last resort: WhatsApp fallback
                    const loc = userLocation ? `${userLocation.lat},${userLocation.lng}` : 'indisponível';
                    const driverInfo = ride?.driver ? `Motorista: ${ride.driver.name}, Placa: ${ride.driver.vehicle_plate || 'N/A'}` : '';
                    const msg = `⚠️ Registro de emergência\nPassageiro: ${userName || 'N/A'}\nCorrida: ${ride?.id || 'N/A'}\n${driverInfo}\nLocalização: ${loc}`;
                    Linking.openURL(`https://wa.me/5521968648777?text=${encodeURIComponent(msg)}`);
                  }
                } else {
                  // Server error or flag off — WhatsApp fallback
                  const loc = userLocation ? `${userLocation.lat},${userLocation.lng}` : 'indisponível';
                  const driverInfo = ride?.driver ? `Motorista: ${ride.driver.name}, Placa: ${ride.driver.vehicle_plate || 'N/A'}` : '';
                  const msg = `⚠️ Registro de emergência\nPassageiro: ${userName || 'N/A'}\nCorrida: ${ride?.id || 'N/A'}\n${driverInfo}\nLocalização: ${loc}`;
                  Linking.openURL(`https://wa.me/5521968648777?text=${encodeURIComponent(msg)}`);
                }
              }
            }}>
              <Ionicons name="document-text-outline" size={15} color={COLORS.textSecondary} />
              <Text style={s.emergencySecondaryText}>Registrar com a Kaviar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.ctaLink, { alignSelf: 'center', marginTop: 12 }]} onPress={() => setShowEmergency(false)}>
              <Text style={s.ctaLinkText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* NO DRIVER MODAL */}
      <Modal visible={isFocused && showNoDriver} transparent animationType="fade" onRequestClose={() => { setShowNoDriver(false); resetToIdle(); }}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalIcon}>{ride?.scheduled_for ? '🕐' : '🚗'}</Text>
            <Text style={s.modalTitle}>{noDriverTitle}</Text>
            <Text style={s.modalBody}>{noDriverBody}</Text>

            {/* Primary CTAs */}
            <TouchableOpacity style={s.ctaPrimary} onPress={() => { setShowNoDriver(false); handleRetry(); }}>
              <Text style={s.ctaPrimaryText}>Buscar novamente</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ctaSecondaryHighlight} onPress={() => { setShowNoDriver(false); resetToIdle(); }}>
              <Text style={s.ctaSecondaryHighlightText}>Tentar em alguns minutos</Text>
            </TouchableOpacity>
            {!ride?.scheduled_for && (
              <TouchableOpacity style={s.ctaLink} onPress={() => { setShowNoDriver(false); router.push('/(passenger)/refer-driver'); }}>
                <Text style={s.ctaLinkText}>Indicar motorista para minha região</Text>
              </TouchableOpacity>
            )}

            {/* Close action */}
            <View style={s.ctaRow}>
              <TouchableOpacity style={s.ctaLink} onPress={() => { setShowNoDriver(false); resetToIdle(); }}>
                <Text style={s.noDriverCloseText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* TIME PICKER MODAL */}
      <Modal visible={isFocused && showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Escolher horário</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {(() => {
                const slots: Date[] = [];
                const now = new Date();
                const start = new Date(now.getTime() + 15 * 60_000);
                start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
                const end = new Date(now.getTime() + 24 * 60 * 60_000);
                for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 15 * 60_000)) slots.push(new Date(t));
                const isToday = (d: Date) => d.toDateString() === now.toDateString();
                return slots.map((slot, i) => (
                  <TouchableOpacity key={i} style={s.timeSlot} onPress={() => { setCustomTime(slot); setShowTimePicker(false); }}>
                    <Text style={s.timeSlotText}>
                      {isToday(slot) ? 'Hoje' : 'Amanhã'} às {fmtTime(slot)}
                    </Text>
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
            <TouchableOpacity style={[s.ctaLink, { alignSelf: 'center', marginTop: 12 }]} onPress={() => { setShowTimePicker(false); setScheduleOption('now'); }}>
              <Text style={s.ctaLinkText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MOTO UNAVAILABLE MODAL */}
      {MOTO_FLAGS.enabled && (
        <MotoUnavailableModal
          visible={showMotoUnavailable}
          onChooseCar={() => { setShowMotoUnavailable(false); setSelectedVehicle('car'); setMotoConsented(false); }}
          onRetry={() => { setShowMotoUnavailable(false); submitRide(); }}
        />
      )}

      {/* MOTO ACCEPT MODAL (flag-guarded) */}
      {MOTO_FLAGS.enabled && (
        <MotoAcceptModal
          visible={showMotoAccept}
          onAccept={() => {
            setShowMotoAccept(false);
            setMotoConsented(true);
            setSelectedService('moto_passenger');
            setSelectedVehicle('moto');
            if (wizardStep === 1) setWizardStep(2);
          }}
          onClose={() => {
            setShowMotoAccept(false);
            if (wizardStep === 1 && !motoConsented) {
              setSelectedService('car');
              setSelectedVehicle('car');
            }
          }}
        />
      )}

      {/* Drawer */}
      <DrawerMenu
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userName={userName}
        userPhone={userPhone}
        items={drawerItems}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  map: { flex: 1 },
  mapLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  mapLoadingText: { color: COLORS.textMuted, fontSize: 14, marginTop: 12 },
  mapFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#080808' },
  radarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(8,8,8,0.55)' },
  mapFallbackBrand: { fontSize: 56, fontWeight: '900', color: 'rgba(200,168,78,0.35)', letterSpacing: 8, marginBottom: 20 },
  mapFallbackIcon: { fontSize: 40, marginBottom: 12 },
  mapFallbackTitle: { fontSize: 20, fontWeight: '800', color: '#C8A84E', letterSpacing: 1 },
  mapFallbackSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 18 },
  mapFallbackDriver: { fontSize: 15, color: COLORS.textPrimary, fontWeight: '600', marginTop: 16 },

  // Top bar
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.92)' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  menuBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6, marginRight: 12 },
  backBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  brand: { fontSize: 18, fontWeight: '900', color: COLORS.primary, letterSpacing: 4 },
  greeting: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  // Community status card
  communityCard: {
    position: 'absolute', top: 110, left: 16, right: 16, zIndex: 10,
    backgroundColor: 'rgba(15,15,15,0.88)', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  communityTitle: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  communitySubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3 },

  // Return home card
  returnCard: {
    position: 'absolute', bottom: 280, left: 16, right: 16, zIndex: 11,
    backgroundColor: 'rgba(15,15,15,0.92)', borderRadius: 12,
    padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 8,
  },
  returnTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  returnSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  returnButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  returnBtnPrimary: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  returnBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: COLORS.textDark },
  returnBtnSecondary: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  returnBtnSecondaryText: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },

  serviceSelectorSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
  },

  // Bottom card (idle)
  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 10,
  },
  question: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 14 },

  // Address rows
  addressRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  addressRowLast: { borderBottomWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  addressInfo: { flex: 1 },
  addressLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 2 },
  addressText: { fontSize: 15, color: COLORS.textPrimary },
  addressPlaceholder: { color: COLORS.textMuted },

  // Search screen
  searchContainer: { flex: 1, backgroundColor: COLORS.surface },
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  searchBack: { marginRight: 12, padding: 4 },
  searchTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  searchInputWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8,
    backgroundColor: COLORS.surfaceLight, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 16, color: COLORS.textPrimary },
  searchResults: { flex: 1 },
  searchItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  searchItemIcon: { marginRight: 14 },
  searchItemTitle: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  searchItemSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  searchEmpty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40, fontSize: 15 },

  // Tracking
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 48, paddingBottom: 10, paddingHorizontal: 16, alignItems: 'center' },
  statusText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Safety card
  safetyCard: {
    position: 'absolute', top: 100, left: 20, right: 20, zIndex: 8,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(10,10,10,0.85)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(200,168,78,0.15)',
  },
  safetyCardIcon: { fontSize: 24 },
  safetyCardTitle: { fontSize: 13, fontWeight: '700', color: '#C8A84E', marginBottom: 3 },
  safetyCardText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 17 },

  boardingCodeCard: {
    position: 'absolute', top: 170, left: 20, right: 20, zIndex: 9,
    alignItems: 'center', backgroundColor: 'rgba(10,10,10,0.92)', borderRadius: 16, padding: 18,
    borderWidth: 1.5, borderColor: 'rgba(200,168,78,0.4)',
  },
  boardingCodeInlineCard: {
    alignItems: 'center', marginBottom: 12, paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(200,168,78,0.4)',
    backgroundColor: 'rgba(10,10,10,0.92)',
  },
  boardingCodeLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  boardingCodeValue: { fontSize: 36, fontWeight: '900', color: '#C8A84E', letterSpacing: 12 },
  boardingCodeHint: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 8 },

  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: COLORS.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, paddingBottom: 40,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
  },
  routeCompact: { marginBottom: 4 },
  label: { fontSize: 12, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, marginTop: 2 },
  driverRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  driverCard: { backgroundColor: COLORS.surfaceLight, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  safetyTip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  safetyTipText: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 4 },
  etaText: { fontSize: 14, fontWeight: '600', color: COLORS.accent },

  // Alert cards (premium visual)
  alertCard: { flexDirection: 'row', backgroundColor: '#1a1a0a', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#3a3a1a' },
  alertCardBorder: { width: 4, backgroundColor: COLORS.primary },
  alertCardContent: { flex: 1, padding: 12 },
  alertCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  alertCardTitle: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  alertCardSub: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 28 },
  alertCardInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0f1a2e', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#1a2a4a' },
  alertCardInfoText: { fontSize: 14, fontWeight: '600', color: '#5B9BD5' },
  progressCard: { backgroundColor: '#0f1a2e', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#1a2a4a' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressText: { fontSize: 14, fontWeight: '600', color: COLORS.success },
  progressBarBg: { height: 6, backgroundColor: '#1a2a4a', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: 6, backgroundColor: COLORS.success, borderRadius: 3 },

  // Boarding status
  boardingRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  boardingBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.surfaceLight, borderWidth: 1.5, borderColor: COLORS.border },
  boardingBtnActive: { borderColor: COLORS.primary, backgroundColor: '#1a1a0a' },
  boardingIcon: { fontSize: 18, marginBottom: 2 },
  boardingLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  boardingLabelActive: { color: COLORS.primary },

  // Schedule selector
  scheduleSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
  scheduleLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  scheduleRow: { flexDirection: 'row', gap: 8 },
  scheduleChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.surfaceLight, borderWidth: 1.5, borderColor: COLORS.border },
  scheduleChipActive: { borderColor: COLORS.primary, backgroundColor: '#1a1a0a' },
  scheduleChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  scheduleChipTextActive: { color: COLORS.primary },
  schedulePreview: { fontSize: 13, color: '#5B9BD5', fontWeight: '600', marginTop: 8, textAlign: 'center' },

  // Scheduled card
  scheduledCard: { flexDirection: 'row', backgroundColor: '#0f1a2e', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1a2a4a' },

  // Redispatch card
  redispatchCard: { flexDirection: 'row', backgroundColor: '#2a2a1a', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#3a3a1a' },
  scheduledCardBorder: { width: 4, backgroundColor: '#5B9BD5' },
  scheduledCardContent: { flex: 1, padding: 12 },
  scheduledCardTitle: { fontSize: 16, fontWeight: '800', color: '#5B9BD5' },
  scheduledCardSub: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 28 },

  // Time picker
  timeSlot: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  timeSlotText: { fontSize: 16, color: COLORS.textPrimary },
  communityMsg: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: COLORS.border },
  estimateText: { fontSize: 13, color: COLORS.textSecondary },
  estimatePrice: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  estimateLoading: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 12 },

  // Trip composition
  tripComp: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
  tripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  tripLabel: { fontSize: 15, color: COLORS.textPrimary },
  tripCounter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tripBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  tripBtnText: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  tripCount: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, minWidth: 20, textAlign: 'center' },
  tripToggle: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border },
  tripToggleOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tripToggleText: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  driverAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  driverPhoto: { width: 40, height: 40, borderRadius: 20 },
  vehiclePhoto: { width: '100%', height: 80, borderRadius: 8, marginTop: 10 },
  driverName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  driverVehicle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  // No driver modal
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 28, width: '100%', maxWidth: 360, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  modalIcon: { fontSize: 40, marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', lineHeight: 24, marginBottom: 12 },
  modalBody: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  ctaPrimary: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 10 },
  ctaPrimaryText: { color: COLORS.textDark, fontSize: 16, fontWeight: '800' },
  ctaSecondaryHighlight: { backgroundColor: 'transparent', borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.primary, paddingVertical: 12, width: '100%', alignItems: 'center', marginBottom: 16 },
  ctaSecondaryHighlightText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  ctaRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  ctaLink: { paddingVertical: 8, paddingHorizontal: 12 },
  ctaLinkText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500' },
  noDriverCloseText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: COLORS.danger },
  emergencyBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.danger },
  emergencySecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  emergencySecondaryText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },

  // Accepted banner
  acceptedBanner: {
    position: 'absolute', top: 100, left: 20, right: 20, zIndex: 20,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.success, borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 10,
  },
  acceptedBannerTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  acceptedBannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
});
