import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Animated, ScrollView, AppState, StatusBar, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { KaviarPremiumRailCard } from '../../src/components/KaviarPremiumRailCard';
import { ServiceCarousel3D } from '../../src/components/ServiceCarousel3D';
import { driverApi } from '../../src/api/driver.api';
import { apiClient } from '../../src/api/client';
import { authStore } from '../../src/auth/auth.store';
import { RideOffer } from '../../src/types/ride';
import { friendlyError } from '../../src/utils/errorMessage';
import { COLORS } from '../../src/config/colors';
import { StatusPill } from '../../src/components/PremiumCards';
import { DrawerMenu, DrawerItem } from '../../src/components/DrawerMenu';
import { groupLabel } from '../../src/utils/tripLabel';
import { startBackgroundLocation, stopBackgroundLocation } from '../../src/services/background-location';
import { persistDriverRide, getPersistedDriverRide } from '../../src/services/ride-persistence';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { ENV } from '../../src/config/env';
import { fetchUnreadCount } from '../../src/services/notifications.service';
import { KAVIAR_SOLUTION_IMAGES } from '../../src/components/kaviarSolutionAssets';

const POLL_INTERVAL = 5000;
const POLL_BACKOFF = [5000, 8000, 12000, 15000]; // normal, 1 fail, 2 fails, 3+ fails
const LOCATION_INTERVAL = 15000;

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const fixedRouteNotificationState = (globalThis as any).__kaviarFixedRouteNotificationState || ((globalThis as any).__kaviarFixedRouteNotificationState = {
  recentRouteIds: new Set<string>(),
  recentReservationIds: new Set<string>(),
  seenMessageIds: new Set<string>(),
});

const OPPORTUNITY_ITEMS = [
  { key: 'rides',    icon: 'car-sport-outline' as const, label: 'Corridas', route: '/(driver)/history'     },
  { key: 'routes',   icon: 'repeat-outline'    as const, label: 'Rotas',    route: '/(driver)/fixed-routes' },
  { key: 'groups',   icon: 'people-outline'    as const, label: 'Grupos',   route: '/(driver)/groups'       },
  { key: 'earnings', icon: 'wallet-outline'    as const, label: 'Ganhos',   route: '/(driver)/summary'      },
] as const;

const DRIVER_SHOWCASE_ITEMS = [
  {
    key: 'ganhos',
    image: KAVIAR_SOLUTION_IMAGES.ganhos,
    title: 'Ganhos KAVIAR',
    description: 'Acompanhe oportunidades e crescimento.',
    cta: 'Abrir resumo',
    artworkReady: true,
    tint: '#F4F6F9',
    accent: '#8A6D1A',
    route: '/(driver)/summary',
  },
  {
    key: 'moto-entrega',
    image: KAVIAR_SOLUTION_IMAGES.motoEntrega,
    title: 'Moto Entrega',
    description: 'Ganhe também com entregas locais em regiões habilitadas.',
    cta: 'Disponível por região',
    artworkReady: true,
    tint: '#F4F6F9',
    accent: '#8A6D1A',
  },
  {
    key: 'moto-passageiro',
    image: KAVIAR_SOLUTION_IMAGES.moto,
    title: 'Moto Passageiro',
    description: 'Modalidade disponível conforme habilitação da sua cidade.',
    cta: 'Disponível por região',
    artworkReady: true,
    tint: '#F4F6F9',
    accent: '#8A6D1A',
  },
  {
    key: 'women-drivers',
    image: KAVIAR_SOLUTION_IMAGES.mulheres,
    title: 'Motoristas mulheres',
    description: 'Atendimento especial disponível conforme regras e disponibilidade local.',
    cta: 'Disponível por região',
    artworkReady: true,
    tint: '#F4F6F9',
    accent: '#8A6D1A',
  },
  {
    key: 'fixed-routes',
    image: KAVIAR_SOLUTION_IMAGES.rotas,
    title: 'Corridas Compartilhadas',
    description: 'Viagens recorrentes e rotina previsível.',
    cta: 'Ver',
    artworkReady: true,
    tint: '#F4F6F9',
    accent: '#8A6D1A',
    route: '/(driver)/fixed-routes',
  },
  {
    key: 'region',
    image: KAVIAR_SOLUTION_IMAGES.regiao,
    title: 'Sua região',
    description: 'Oportunidades próximas de você.',
    cta: 'Ver',
    artworkReady: true,
    tint: '#F4F6F9',
    accent: '#8A6D1A',
    route: '/(driver)/groups',
  },
] as const;

export default function DriverOnline() {
  const router = useRouter();
  const { isConnected } = useNetworkStatus();
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [pendingOffer, setPendingOffer] = useState<RideOffer | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [locationPermission, setLocationPermission] = useState(true);
  const [backgroundDenied, setBackgroundDenied] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [offerCountdown, setOfferCountdown] = useState('');
  const [soundMuted, setSoundMuted] = useState(false);
  const [pollUnstable, setPollUnstable] = useState(false);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const pollFailsRef = useRef(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const locationRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const soundMutedRef = useRef(false);
  const expiredOfferIdsRef = useRef<Set<string>>(new Set());
  const pendingOfferRef = useRef<RideOffer | null>(null);
  const isOnlineRef = useRef(false);
  const backgroundDeniedRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userPhone, setUserPhone] = useState('');
  const [notifUnread, setNotifUnread] = useState(0);

  // Keep refs in sync for AppState callback
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { backgroundDeniedRef.current = backgroundDenied; }, [backgroundDenied]);
  useEffect(() => { soundMutedRef.current = soundMuted; }, [soundMuted]);

  // No reconnection auto-start here — AppState resume handler already covers this

  const drawerItems: DrawerItem[] = [
    { key: 'profile', label: 'Perfil', icon: 'person-outline', onPress: () => router.push('/(driver)/profile') },
    { key: 'summary', label: 'Resumo', icon: 'stats-chart-outline', onPress: () => router.push('/(driver)/summary') },
    { key: 'history', label: 'Histórico de corridas', icon: 'time-outline', onPress: () => router.push('/(driver)/history') },
    { key: 'groups', label: 'Grupos KAVIAR', icon: 'people-outline', onPress: () => router.push('/(driver)/groups') },
    {
      key: 'fixed-routes',
      label: 'Minhas Corridas Compartilhadas',
      icon: 'repeat-outline',
      badge: (fixedRouteNotificationState.recentRouteIds.size > 0 || fixedRouteNotificationState.recentReservationIds.size > 0) ? '•' : undefined,
      onPress: () => router.push('/(driver)/fixed-routes'),
    },
    { key: 'credits', label: 'Saldo', icon: 'wallet-outline', onPress: () => router.push('/(driver)/credits') },
    { key: 'documents', label: 'Documentos', icon: 'document-text-outline', onPress: () => router.push('/(driver)/documents') },
    { key: 'municipal', label: 'Regularização Municipal', icon: 'business-outline', onPress: () => router.push('/(driver)/municipal-regularization') },
    { key: 'refer', label: 'Indique um motorista', icon: 'people-outline', onPress: () => router.push('/(driver)/refer-driver') },
    { key: 'help', label: 'Ajuda', icon: 'help-circle-outline', onPress: () => router.push('/(driver)/help') },
    { key: 'logout', label: 'Sair', icon: 'log-out-outline', danger: true, onPress: () => handleLogout() },
  ];

  const stopSound = async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch (e) { console.warn('[Driver] stopSound failed:', e); }
    soundRef.current = null;
  };

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
    loadUser();
    checkCurrentRide();
    loadDashboard();
    checkGps();
    checkLocationPermission();

    // Resume everything when app returns from background
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || !isOnlineRef.current) return;
      console.log('[Driver] AppState → active, resuming...');

      // 1. Reenvia localização imediatamente
      try {
        const loc = await Location.getCurrentPositionAsync({});
        setCurrentCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        await driverApi.sendLocation(loc.coords.latitude, loc.coords.longitude);
        console.log('[Driver] Resume: location sent');
      } catch (e) {
        console.warn('[Driver] Resume: location failed:', e);
      }

      // 2. Confirma availability online (stale-cleanup pode ter marcado offline)
      try {
        await driverApi.setAvailability('online');
      } catch (e) {
        console.warn('[Driver] Resume: availability failed:', e);
      }

      // 3. Reinicia polling de ofertas
      if (pollRef.current) clearTimeout(pollRef.current);
      startPolling();

      // 4. Reinicia location foreground se background negado
      if (backgroundDeniedRef.current) {
        if (locationRef.current) clearInterval(locationRef.current);
        const send = async () => {
          try {
            const loc = await Location.getCurrentPositionAsync({});
            setCurrentCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            await driverApi.sendLocation(loc.coords.latitude, loc.coords.longitude);
          } catch (e) {
            console.warn('[Driver] sendLocation failed:', e);
          }
        };
        locationRef.current = setInterval(send, LOCATION_INTERVAL);
      }

      // 5. Verifica corrida ativa e GPS
      checkCurrentRide();
      checkGps();
      checkLocationPermission();
    });

    // Push received in foreground — immediately poll for offer
    const notifSub = Notifications.addNotificationReceivedListener(() => {
      if (!isOnlineRef.current || pendingOfferRef.current) return;
      // Reset backoff and poll immediately
      pollFailsRef.current = 0;
      setPollUnstable(false);
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = setTimeout(async () => {
        try {
          const offers = await driverApi.getOffers();
          if (offers.length > 0 && !pendingOfferRef.current) {
            const offer = offers[0];
            if (expiredOfferIdsRef.current.has(offer.id)) return;
            pendingOfferRef.current = offer;
            setPendingOffer(offer);
            if (!soundMutedRef.current) {
              try {
                await stopSound();
                const { sound } = await Audio.Sound.createAsync(
                  require('../../assets/sounds/kaviar_ride.wav')
                );
                soundRef.current = sound;
                await sound.playAsync();
              } catch (e) { console.warn('[Driver] push sound failed:', e); }
            }
          }
        } catch (e) { console.warn('[Driver] push-triggered poll failed:', e); }
        // Resume normal polling
        startPolling();
      }, 300);
    });

    return () => { appStateSub.remove(); notifSub.remove(); stopAll(); stopSound(); driverApi.setAvailability('offline').catch(() => {}); };
  }, []);

  useFocusEffect(useCallback(() => {
    loadDashboard();
    checkGps();
    checkLocationPermission();
    fetchUnreadCount('driver')
      .then((count) => {
        console.info('[DriverOnline] notifications unread-count', { count });
        setNotifUnread(count);
      })
      .catch((error) => {
        console.warn('[DriverOnline] notifications unread-count failed', {
          error: error instanceof Error ? error.message : 'unknown_error',
        });
      });
  }, []));

  useEffect(() => {
    if (isOnline && !pendingOffer) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isOnline, pendingOffer]);

  // Offer expiration countdown
  useEffect(() => {
    if (!pendingOffer?.expires_at) { setOfferCountdown(''); return; }
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(pendingOffer.expires_at).getTime() - Date.now()) / 1000));
      setOfferCountdown(`${left}s`);
      if (left === 0) { expiredOfferIdsRef.current.add(pendingOffer.id); setPendingOffer(null); pendingOfferRef.current = null; stopSound(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pendingOffer]);

  const loadUser = () => {
    const user = authStore.getUser();
    if (user?.name) setUserName(user.name);
    if (user?.phone) setUserPhone(user.phone);
  };

  const checkGps = async () => {
    try { setGpsEnabled(await Location.hasServicesEnabledAsync()); } catch {
      setGpsEnabled(false);
    }
  };

  const checkLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
    } catch {
      setLocationPermission(false);
    }
  };

  const loadDashboard = async () => {
    try {
      const [credRes, histRes] = await Promise.allSettled([
        driverApi.getWallet(),
        apiClient.get('/api/v2/rides/history'),
      ]);
      if (credRes.status === 'fulfilled') setCreditBalance(credRes.value.balance_cents / 100);
      if (histRes.status === 'fulfilled') {
        const rides = histRes.value.data?.rides || histRes.value.data || [];
        const todayStr = new Date().toISOString().slice(0, 10);
        console.info('[Driver] completed rides today', {
          count: rides.filter((r: any) => r.status === 'completed' && r.requested_at?.slice(0, 10) === todayStr).length,
        });
      }
    } catch (e) {
      console.warn('[Driver] loadDashboard failed:', e);
    }
  };

  const checkCurrentRide = async () => {
    try {
      const ride = await driverApi.getCurrentRide();
      if (ride) {
        await persistDriverRide(ride);
        router.replace(`/(driver)/complete-ride?rideId=${ride.id}&status=${ride.status}`);
      } else {
        await persistDriverRide(null);
      }
    } catch (e) {
      console.warn('[Driver] checkCurrentRide failed:', e);
      // Offline fallback: check persisted ride
      const cached = await getPersistedDriverRide();
      if (cached && !['completed', 'canceled_by_passenger', 'canceled_by_driver', 'no_driver'].includes(cached.status)) {
        router.replace(`/(driver)/complete-ride?rideId=${cached.id}&status=${cached.status}`);
      }
    }
  };

  const startPolling = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollFailsRef.current = 0;
    setPollUnstable(false);
    const poll = async () => {
      try {
        const offers = await driverApi.getOffers();
        pollFailsRef.current = 0;
        setPollUnstable(false);
        if (offers.length > 0 && !pendingOfferRef.current) {
          const offer = offers[0];
          if (expiredOfferIdsRef.current.has(offer.id)) return;
          soundMutedRef.current = false;
          setSoundMuted(false);
          pendingOfferRef.current = offer;
          setPendingOffer(offer);
          if (!soundMutedRef.current) {
            try {
              await stopSound();
              const { sound } = await Audio.Sound.createAsync(
                require('../../assets/sounds/kaviar_ride.wav')
              );
              soundRef.current = sound;
              await sound.playAsync();
            } catch (e) { console.warn('[Driver] offer sound failed:', e); }
          }
        }
      } catch (e) {
        pollFailsRef.current = Math.min(pollFailsRef.current + 1, 10);
        if (pollFailsRef.current >= 3) setPollUnstable(true);
        console.warn('[Driver] offer polling failed:', e);
      }
      const delay = POLL_BACKOFF[Math.min(pollFailsRef.current, POLL_BACKOFF.length - 1)];
      pollRef.current = setTimeout(poll, delay);
    };
    pollRef.current = setTimeout(poll, POLL_BACKOFF[0]);
  };

  const startLocationTracking = async (): Promise<boolean> => {
    try {
      const mode = await startBackgroundLocation(ENV.API_URL);
      setLocationPermission(true);
      if (mode === 'foreground') {
        // Background denied — fallback to foreground polling
        setBackgroundDenied(true);
        const send = async () => {
          try {
            const loc = await Location.getCurrentPositionAsync({});
            setCurrentCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            await driverApi.sendLocation(loc.coords.latitude, loc.coords.longitude);
          } catch (e) {
            console.warn('[Driver] sendLocation failed:', e);
          }
        };
        await send();
        locationRef.current = setInterval(send, LOCATION_INTERVAL);
      } else {
        setBackgroundDenied(false);
        // Get initial coords for UI
        try {
          const loc = await Location.getCurrentPositionAsync({});
          setCurrentCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        } catch (e) { console.warn('[Driver] initial coords failed:', e); }
      }
      return true;
    } catch (e: any) {
      if (e.message === 'FOREGROUND_DENIED') {
        setLocationPermission(false);
        Alert.alert('Erro', 'Permissão de localização negada');
      } else {
        console.warn('[Driver] startLocationTracking error:', e);
      }
      return false;
    }
  };

  const stopAll = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (locationRef.current) clearInterval(locationRef.current);
    pollRef.current = null;
    locationRef.current = null;
    pollFailsRef.current = 0;
    setPollUnstable(false);
    stopBackgroundLocation().catch(() => {});
  };

  const registerPushToken = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: '01426c18-feb5-44f2-94f1-dab900d8bc85',
      });

      let fcmToken: string | undefined;
      try {
        const { data } = await Notifications.getDevicePushTokenAsync();
        fcmToken = data as string;
      } catch (e) {
        console.warn('[Driver] FCM token failed (non-blocking):', e);
      }

      await apiClient.put('/api/v2/drivers/me/push-token', { token, fcmToken, platform: Platform.OS });
      console.log('[Driver] Push tokens registered');
    } catch (e) {
      console.warn('[Driver] Push token registration failed:', e);
    }
  };

  const continueGoOnline = async () => {
    setLoading(true);
    try {
      const trackingReady = await startLocationTracking();
      if (!trackingReady) {
        setIsOnline(false);
        return;
      }

      await driverApi.setAvailability('online');
      setIsOnline(true);
      registerPushToken();
      startPolling();
    } catch (e: any) {
      stopAll();
      setIsOnline(false);

      if (e?.response?.status === 403 && e?.response?.data?.error === 'DRIVER_NOT_APPROVED') {
        Alert.alert(
          'Cadastro em análise',
          'Seu cadastro ainda precisa ser aprovado pela KAVIAR antes de você ficar online.',
          [
            {
              text: 'Ver pendências',
              onPress: () => router.push('/(driver)/pending-approval'),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }

      if (e?.response?.status === 403 && e?.response?.data?.error === 'MUNICIPAL_LOCATION_REQUIRED') {
        Alert.alert(
          'Não conseguimos confirmar sua cidade',
          'Não foi possível confirmar sua cidade para validar a autorização municipal. Atualize sua localização ou procure o suporte KAVIAR.'
        );
        return;
      }

      if (e?.response?.status === 403 && e?.response?.data?.error === 'MUNICIPAL_AUTH_REQUIRED') {
        Alert.alert(
          'Regularização municipal necessária',
          'Sua cidade exige autorização municipal. Aguarde a aprovação da Prefeitura para operar.',
          [
            {
              text: 'Ver regularização',
              onPress: () => router.push('/(driver)/municipal-regularization'),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }
      Alert.alert('Erro', friendlyError(e, 'Erro ao ficar online'));
    } finally { setLoading(false); }
  };

  const handleGoOnline = () => {
    setShowLocationDisclosure(true);
  };

  const handleGoOffline = async () => {
    setLoading(true);
    try {
      stopAll();
      await stopSound();
      await driverApi.setAvailability('offline');
      setIsOnline(false);
      setPendingOffer(null);
      pendingOfferRef.current = null;
      setSoundMuted(false);
      expiredOfferIdsRef.current.clear();
    } catch (e: any) {
      Alert.alert('Erro', friendlyError(e, 'Erro ao ficar offline'));
    } finally { setLoading(false); }
  };

  const handleAcceptOffer = async () => {
    if (!pendingOffer) return;
    await stopSound();
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    setPendingOffer(null);
    pendingOfferRef.current = null;
    router.replace(`/(driver)/accept-ride?offerId=${pendingOffer.id}&rideId=${pendingOffer.ride.id}&expiresAt=${encodeURIComponent(pendingOffer.expires_at)}`);
  };

  const handleRejectOffer = async () => {
    if (!pendingOffer) return;
    try {
      await stopSound();
      await driverApi.rejectOffer(pendingOffer.id);
      setPendingOffer(null);
      pendingOfferRef.current = null;
      setSoundMuted(false);
    } catch (e: any) {
      Alert.alert('Erro', friendlyError(e, 'Não foi possível recusar a oferta'));
    }
  };

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja realmente sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => {
        try {
          stopAll();
          await driverApi.setAvailability('offline').catch(() => {});
          await authStore.clearAuth();
        } finally {
          router.replace('/(auth)/login');
        }
      }}
    ]);
  };

  // Derived states
  const noCredits = creditBalance !== null && creditBalance === 0;
  const lowCredits = creditBalance !== null && creditBalance > 0 && creditBalance < 10;
  const isReconnecting = isOnline && !isConnected;
  const effectiveOnline = isOnline && isConnected;

  const distanceToPickup = pendingOffer && currentCoords
    ? haversineKm(currentCoords.lat, currentCoords.lng, pendingOffer.ride.origin_lat, pendingOffer.ride.origin_lng)
    : null;

  const hasRouteContext =
    fixedRouteNotificationState.recentRouteIds.size > 0
    || fixedRouteNotificationState.recentReservationIds.size > 0;

  const opportunityContext = hasRouteContext
    ? {
      icon: 'repeat-outline' as const,
      title: 'Você tem mensagens de rota',
      text: 'Confira suas Corridas Compartilhadas para responder passageiros e organizar horários.',
      cta: 'Ver corridas',
      onPress: () => router.push('/(driver)/fixed-routes'),
    }
    : !isOnline
      ? {
        icon: 'sparkles-outline' as const,
        title: 'Crie uma Corrida Compartilhada',
        text: 'Ganhe previsibilidade com passageiros recorrentes da sua região.',
        cta: 'Criar agora',
        onPress: () => router.push('/(driver)/fixed-routes'),
      }
      : {
        icon: 'people-outline' as const,
        title: 'Avisos da sua região',
        text: 'Acompanhe oportunidades locais e comunicados da comunidade.',
        cta: 'Abrir grupos',
        onPress: () => router.push('/(driver)/groups'),
      };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F7F8" />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.menuBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="menu" size={22} color={COLORS.textDark} />
          </TouchableOpacity>
          <View>
            <Text style={styles.brand}>KAVIAR</Text>
            {userName ? <Text style={styles.userName}>{userName}</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => router.push('/(driver)/notifications' as any)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Central de Notificações"
            style={styles.bellButton}
          >
            <Ionicons name="notifications-outline" size={20} color={COLORS.textDark} />
            {notifUnread > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{notifUnread > 9 ? '9+' : notifUnread}</Text>
              </View>
            )}
          </TouchableOpacity>
          <StatusPill label={isReconnecting ? 'Reconectando...' : isOnline ? 'Online' : 'Offline'} active={effectiveOnline} />
        </View>
      </View>

      {/* Operational status banners */}
      {!gpsEnabled && (
        <View style={styles.banner}>
          <Ionicons name="navigate-outline" size={16} color={COLORS.warning} />
          <Text style={styles.bannerText}>GPS desligado. Ative a localização para receber corridas.</Text>
        </View>
      )}
      {!locationPermission && gpsEnabled && (
        <View style={styles.banner}>
          <Ionicons name="location-outline" size={16} color={COLORS.warning} />
          <Text style={styles.bannerText}>Permissão de localização negada. Ative nas configurações.</Text>
        </View>
      )}
      {noCredits && (
        <TouchableOpacity style={[styles.banner, { backgroundColor: '#fde8e8' }]} onPress={() => router.push('/(driver)/credits')}>
          <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
          <Text style={[styles.bannerText, { color: COLORS.danger }]}>Sem saldo disponível. <Text style={{ fontWeight: '700' }}>Adicionar saldo</Text></Text>
        </TouchableOpacity>
      )}
      {lowCredits && (
        <TouchableOpacity style={styles.banner} onPress={() => router.push('/(driver)/credits')}>
          <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
          <Text style={styles.bannerText}>Saldo baixo. <Text style={{ fontWeight: '700' }}>Adicionar saldo</Text></Text>
        </TouchableOpacity>
      )}
      {backgroundDenied && isOnline && (
        <View style={styles.banner}>
          <Ionicons name="navigate-outline" size={16} color={COLORS.warning} />
          <Text style={styles.bannerText}>Localização em segundo plano negada. Ao usar Waze ou minimizar, sua posição não será atualizada.</Text>
        </View>
      )}
      {pollUnstable && isOnline && (
        <View style={[styles.banner, { backgroundColor: '#2a2a45' }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={COLORS.textSecondary} />
          <Text style={[styles.bannerText, { color: COLORS.textSecondary }]}>Sinal instável para receber corridas</Text>
        </View>
      )}

      {/* Status */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.center,
          pendingOffer
            ? { paddingTop: 22, paddingBottom: 220 }
            : { paddingTop: 18, paddingBottom: 200 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.statusRing}>
          <Animated.View style={[
            styles.statusDot,
            { backgroundColor: effectiveOnline ? COLORS.statusOnline : isReconnecting ? COLORS.warning : COLORS.statusOffline },
            effectiveOnline && !pendingOffer && { opacity: pulseAnim },
          ]} />
        </View>
        <Text style={[styles.statusText, effectiveOnline && { color: COLORS.statusOnline }, isReconnecting && { color: COLORS.warning }]}>
          {isReconnecting ? 'RECONECTANDO...' : isOnline ? 'ONLINE' : 'OFFLINE'}
        </Text>

        {!pendingOffer && (
          <View style={styles.carouselWrap}>
            <Text style={styles.carouselTitle}>Atalhos</Text>
            <ServiceCarousel3D
              items={OPPORTUNITY_ITEMS.map((i) => ({ ...i, route: i.route }))}
              onNavigate={(route) => router.push(route as any)}
            />
          </View>
        )}

        {/* Botão Ficar Online logo abaixo do carrossel — ação principal do motorista */}
        {!pendingOffer && !isOnline && (
          <View style={styles.goOnlineWrap}>
            {noCredits ? (
              <Button title="Adicionar saldo para começar" onPress={() => router.push('/(driver)/credits')} />
            ) : (
              <>
                <Button title={loading ? 'Conectando...' : 'Ficar Online'} onPress={handleGoOnline} loading={loading} />
                {loading && <Text style={styles.connectingHint}>Ativando localização e escuta de corridas.</Text>}
              </>
            )}
          </View>
        )}

        {!pendingOffer && (
          <View style={styles.ecosystemWrap}>
            <Text style={styles.ecosystemTitle}>Oportunidades KAVIAR</Text>
            <Text style={styles.ecosystemSubtitle}>Uma vitrine para ampliar ganhos e presença local.</Text>
            <View style={styles.ecosystemStack}>
              {DRIVER_SHOWCASE_ITEMS.map((item) => (
                <KaviarPremiumRailCard
                  key={item.key}
                  onPress={() => {
                    if (!item.route) return;
                    router.push(item.route as any);
                  }}
                  item={item}
                />
              ))}
            </View>
          </View>
        )}

        {!pendingOffer && (
          <View style={styles.waitingChip}>
            <Ionicons
              name={isReconnecting ? 'cloud-offline-outline' : 'radio-outline'}
              size={13}
              color={isReconnecting ? COLORS.warning : '#8A9BB0'}
            />
            <Text style={[styles.waitingChipText, isReconnecting && { color: COLORS.warning }]}>
              {isReconnecting ? 'Reconectando...' : isOnline ? 'Aguardando corridas' : ''}
            </Text>
          </View>
        )}

        {/* Ficar Offline — discreto, secundário */}
        {!pendingOffer && isOnline && (
          <TouchableOpacity
            style={[styles.offlineBtn, isReconnecting && styles.offlineBtnDisabled]}
            onPress={handleGoOffline}
            disabled={loading || isReconnecting}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Ficar Offline"
          >
            <Ionicons name="power-outline" size={14} color={isReconnecting ? '#8A9BB0' : '#5E6470'} />
            <Text style={[styles.offlineBtnText, isReconnecting && { color: '#8A9BB0' }]}>
              {loading ? 'Aguarde...' : isReconnecting ? 'Reconectando...' : 'Ficar Offline'}
            </Text>
          </TouchableOpacity>
        )}

        {pendingOffer && (
          <View style={styles.offerCard}>
            <View style={styles.offerHeader}>
              <Ionicons name="car-sport" size={20} color={COLORS.primary} />
              <Text style={styles.offerTitle}>Nova corrida</Text>
              {offerCountdown ? <Text style={styles.offerTimer}>{offerCountdown}</Text> : null}
            </View>

            <View style={styles.routeRow}>
              <View style={styles.routeDots}>
                <View style={[styles.dot, { backgroundColor: COLORS.statusOnline }]} />
                <View style={styles.dotLine} />
                <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
                {(pendingOffer.ride as any).trip_details?.post_wait_destination?.text ? (
                  <>
                    <View style={styles.dotLine} />
                    <View style={[styles.dot, { backgroundColor: '#1565c0' }]} />
                  </>
                ) : null}
              </View>
              <View style={styles.routeTexts}>
                <Text style={styles.routeText} numberOfLines={1}>{pendingOffer.ride.origin_text || 'Origem'}</Text>
                <Text style={styles.routeText} numberOfLines={1}>{pendingOffer.ride.destination_text || 'Destino'}{(pendingOffer.ride as any).wait_requested ? ' (parada)' : ''}</Text>
                {(pendingOffer.ride as any).trip_details?.post_wait_destination?.text ? (
                  <Text style={[styles.routeText, { color: '#1565c0' }]} numberOfLines={1}>{(pendingOffer.ride as any).trip_details.post_wait_destination.text}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.offerMeta}>
              <Ionicons name="speedometer-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.offerMetaText}>
                {typeof distanceToPickup === 'number'
                  ? `${distanceToPickup.toFixed(1)} km ate a origem`
                  : 'Distancia nao informada'}
              </Text>
            </View>
            <Text style={styles.offerPassenger} numberOfLines={1}>Passageiro: {(pendingOffer as any).passenger_name || 'Nao informado'}</Text>

            {(pendingOffer.ride as any).trip_details && (
              <View style={styles.offerGroup}>
                <Ionicons name="people-outline" size={14} color={COLORS.textPrimary} />
                <Text style={styles.offerGroupText}>
                  {groupLabel((pendingOffer.ride as any).trip_details.passengers || 1, !!(pendingOffer.ride as any).trip_details.has_luggage)}
                </Text>
              </View>
            )}

            {(pendingOffer.ride as any).trip_details?.post_wait_destination && (
              <View style={{ backgroundColor: '#1a1a0a', borderRadius: 6, borderWidth: 1, borderColor: '#C8A84E', paddingVertical: 4, paddingHorizontal: 8, marginTop: 6, alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 11, color: '#C8A84E', fontWeight: '700' }}>Valor inclui trecho apos espera</Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Fixed offer action buttons */}
      {pendingOffer && (
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: '#222' }}>
          <View style={styles.offerButtons}>
            <Button title="Ver e aceitar" variant="success" onPress={handleAcceptOffer} style={{ flex: 1 }} />
            <View style={{ width: 12 }} />
            <Button title="Recusar" variant="danger" onPress={handleRejectOffer} style={{ flex: 1 }} />
          </View>
          {!soundMuted && (
            <TouchableOpacity
              style={styles.muteBtn}
              onPress={() => { stopSound(); setSoundMuted(true); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="volume-mute-outline" size={16} color={COLORS.textMuted} />
              <Text style={styles.muteBtnText}>Silenciar alerta</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Drawer */}
      <DrawerMenu
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userName={userName}
        userPhone={userPhone}
        items={drawerItems}
      />

      <Modal
        visible={showLocationDisclosure}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowLocationDisclosure(false)}
      >
        <View style={styles.disclosureOverlay}>
          <View style={styles.disclosureCard}>
            <Text style={styles.disclosureTitle}>Uso da sua localização</Text>
            <Text style={styles.disclosureText}>
              O KAVIAR Motorista usa sua localização precisa para mostrar sua posição no mapa, encontrar passageiros próximos, receber corridas e atualizar sua posição durante o serviço.{'\n\n'}
              Quando você estiver online ou em uma corrida, o app também poderá acessar sua localização em segundo plano para manter sua posição atualizada mesmo quando o app não estiver aberto na tela.{'\n\n'}
              Você pode interromper esse uso a qualquer momento ficando offline.
            </Text>
            <View style={styles.disclosureActions}>
              <TouchableOpacity
                style={[styles.disclosureButton, styles.disclosureSecondaryButton]}
                onPress={() => setShowLocationDisclosure(false)}
                accessibilityRole="button"
                accessibilityLabel="Agora não"
              >
                <Text style={styles.disclosureSecondaryButtonText}>Agora não</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.disclosureButton, styles.disclosurePrimaryButton]}
                onPress={() => {
                  setShowLocationDisclosure(false);
                  void continueGoOnline();
                }}
                accessibilityRole="button"
                accessibilityLabel="Continuar"
              >
                <Text style={styles.disclosurePrimaryButtonText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7F8' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#F6F7F8',
  },
  brand: { fontSize: 18, fontWeight: '900', color: '#121316', letterSpacing: 3 },
  menuBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#EAEDF2' },
  bellButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAEDF2', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bellBadge: { position: 'absolute', top: -4, right: -5, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' as const },
  userName: { fontSize: 13, color: '#5E6470', marginTop: 2 },
  center: { paddingHorizontal: 24, paddingTop: 14 },

  // Banners
  banner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E6',
    borderWidth: 1, borderColor: '#E8D9AA', marginHorizontal: 24, marginBottom: 6, padding: 10, borderRadius: 10, gap: 8,
  },
  bannerText: { fontSize: 13, color: '#5E6470', flex: 1 },

  // Status
  statusRing: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: '#E2E5EB',
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 12,
    shadowColor: '#121316', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  statusDot: { width: 44, height: 44, borderRadius: 22 },
  statusText: {
    fontSize: 24, fontWeight: '900', color: '#5E6470',
    textAlign: 'center', letterSpacing: 6, marginBottom: 8,
  },

  carouselWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEDF2',
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 12,
  },
  carouselTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5E6470',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  goOnlineWrap: {
    marginBottom: 14,
  },

  ecosystemWrap: {
    backgroundColor: '#F8F9FB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EAEDF2',
    padding: 12,
    marginBottom: 14,
  },
  ecosystemTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#121316',
  },
  ecosystemSubtitle: {
    fontSize: 12,
    color: '#5E6470',
    marginTop: 2,
    marginBottom: 12,
  },
  ecosystemStack: {
    gap: 12,
  },
  ecosystemCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E6ED',
    overflow: 'hidden',
    backgroundColor: '#FCFDFE',
    shadowColor: '#121316',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  ecosystemMedia: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E8ECF2',
  },
  ecosystemMediaDark: {
    backgroundColor: '#131821',
  },
  ecosystemMediaLight: {
    backgroundColor: '#F2F4F8',
  },
  ecosystemBody: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  ecosystemCardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: '#121316',
    marginBottom: 6,
  },
  ecosystemCardText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#4F5664',
    marginBottom: 12,
  },
  ecosystemImage: {
    width: '88%',
    height: 124,
    opacity: 0.96,
  },
  ecosystemCtaWrap: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2C47A',
    backgroundColor: '#FFFCF4',
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  ecosystemCta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A6D1A',
  },

  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D9AA',
    padding: 12,
    marginBottom: 14,
  },
  contextIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8E6',
  },
  contextTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#121316',
    marginBottom: 2,
  },
  contextText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#5E6470',
  },
  contextCta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A6D1A',
  },

  // Offer
  offerCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 24,
    borderWidth: 1, borderColor: '#EAEDF2',
  },
  territoryBadge: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginBottom: 12,
  },
  territoryBadgeText: {
    fontSize: 15, fontWeight: '700',
  },
  territorySubtext: {
    fontSize: 12, color: COLORS.textMuted, marginTop: 2,
  },
  offerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  offerTitle: { fontSize: 18, fontWeight: '700', color: '#121316', marginLeft: 10, flex: 1 },
  offerTimer: {
    fontSize: 15, fontWeight: '800', color: COLORS.warning,
    backgroundColor: '#F5F7FA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  routeRow: { flexDirection: 'row', marginBottom: 12 },
  routeDots: { alignItems: 'center', marginRight: 12, paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLine: { width: 2, height: 24, backgroundColor: '#E2E5EB', marginVertical: 2 },
  routeTexts: { flex: 1, justifyContent: 'space-between', gap: 14 },
  routeText: { fontSize: 15, color: '#121316' },
  offerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  offerMetaText: { fontSize: 13, color: COLORS.textMuted },
  offerPassenger: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 16 },
  offerGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surfaceLight, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 16, alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.border },
  offerGroupText: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  offerButtons: { flexDirection: 'row' },
  muteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 12, paddingVertical: 6, gap: 6,
  },
  muteBtnText: { fontSize: 13, color: COLORS.textMuted },

  // Waiting / offline controls
  waitingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F2F4F7',
    borderWidth: 1,
    borderColor: '#E2E6ED',
    marginBottom: 12,
  },
  waitingChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8A9BB0',
  },
  offlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DE',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  offlineBtnDisabled: {
    borderColor: '#E8EAF0',
    backgroundColor: '#F8F9FB',
  },
  offlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5E6470',
  },
  connectingHint: { fontSize: 12, color: '#5E6470', textAlign: 'center', marginTop: 10, marginBottom: 8 },
  disclosureOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  disclosureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EAEDF2',
  },
  disclosureTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#121316',
    marginBottom: 12,
  },
  disclosureText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#374151',
  },
  disclosureActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  disclosureButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  disclosureSecondaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DE',
  },
  disclosurePrimaryButton: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  disclosureSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5E6470',
  },
  disclosurePrimaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#121316',
  },

  // Credits
  creditBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4,
  },
  creditBadgeLow: { backgroundColor: COLORS.danger },
  creditText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
});
