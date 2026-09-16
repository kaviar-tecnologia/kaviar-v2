import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { driverApi } from '../../src/api/driver.api';
import { friendlyError } from '../../src/utils/errorMessage';
import { COLORS } from '../../src/config/colors';
import { groupLabel } from '../../src/utils/tripLabel';

const ADJUSTMENTS = [
  { value: 5,  label: '+R$ 5',  tag: 'Ajuste leve' },
  { value: 8,  label: '+R$ 8',  tag: 'Ajuste moderado' },
  { value: 10, label: '+R$ 10', tag: 'Ajuste especial' },
] as const;

export default function AcceptRide() {
  const router = useRouter();
  const { offerId, rideId, expiresAt } = useLocalSearchParams<{ offerId: string; rideId: string; expiresAt?: string }>();
  const [loading, setLoading] = useState(false);
  const [offerData, setOfferData] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [expired, setExpired] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setCountdown(left);
      if (left <= 0) setExpired(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => { loadOffer(); }, []);

  const loadOffer = async () => {
    try {
      const offers = await driverApi.getOffers();
      const offer = offers.find(o => o.id === offerId);
      if (offer) setOfferData(offer);
      else setExpired(true);
    } catch { setExpired(true); }
    finally { setFetching(false); }
  };

  const handleAccept = async () => {
    if (!offerId) return;
    setLoading(true);
    try {
      const result = await driverApi.acceptOffer(offerId, selectedAdjustment ?? undefined);
      setAccepted(true);
      setTimeout(() => router.replace(`/(driver)/complete-ride?rideId=${result.ride_id}&status=accepted`), 1500);
    } catch (e: any) {
      if (!e.response) {
        // Network failure — enqueue with short TTL and navigate optimistically
        const { enqueue } = require('../../src/services/offline-queue');
        const body = selectedAdjustment ? { adjustment: selectedAdjustment } : {};
        await enqueue({ method: 'POST' as const, url: `https://api.kaviar.com.br/api/v2/drivers/offers/${offerId}/accept`, body });
        setAccepted(true);
        Alert.alert('Sem internet', 'O aceite será enviado assim que a conexão voltar.');
        setTimeout(() => router.replace(`/(driver)/complete-ride?rideId=${rideId}&status=accepted`), 1500);
      } else {
        Alert.alert('Erro', friendlyError(e, 'Erro ao aceitar corrida'));
      }
    } finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!offerId) return;
    setLoading(true);
    try { await driverApi.rejectOffer(offerId); router.replace('/(driver)/online'); }
    catch { router.replace('/(driver)/online'); }
  };

  if (fetching) return <View style={s.container}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  if (expired) return (
    <View style={s.container}>
      <Text style={s.bigIcon}>⏰</Text>
      <Text style={s.centeredTitle}>Oferta expirada</Text>
      <Text style={s.centeredSub}>Esta corrida não está mais disponível.</Text>
      <Button title="Voltar" onPress={() => router.replace('/(driver)/online')} style={{ marginTop: 24 }} />
    </View>
  );

  if (accepted) return (
    <View style={s.container}>
      <Text style={s.bigIcon}>✅</Text>
      <Text style={s.centeredTitle}>Corrida aceita!</Text>
      <Text style={s.centeredSub}>Dirija-se ao local de embarque.</Text>
    </View>
  );

  const ride = offerData?.ride;
  const quotedPrice = ride?.quoted_price != null ? Number(ride.quoted_price) : null;
  const finalPrice = quotedPrice != null && selectedAdjustment ? quotedPrice + selectedAdjustment : null;

  // Proteção estimada
  const tier = offerData?.territory_tier;
  const creditEstimated = tier === 'OUTSIDE' ? 2 : 1;
  const creditValue = creditEstimated * 2.00;
  const passengers = (ride?.trip_details as any)?.passengers || 1;
  const hasLuggage = !!(ride?.trip_details as any)?.has_luggage;
  const passengersExtra = Math.max(0, passengers - 1) * 1.00;
  const luggageExtra = hasLuggage ? 1.00 : 0;
  const protectionTotal = creditValue + passengersExtra + luggageExtra;
  const recommendedAdj = protectionTotal <= 5 ? 5 : protectionTotal <= 8 ? 8 : 10;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
      <Text style={s.title}>Nova Corrida</Text>

      {countdown != null && countdown > 0 && (
        <View style={[s.timerBar, countdown <= 10 && s.timerBarUrgent]}>
          <Ionicons name="time-outline" size={16} color={countdown <= 10 ? '#ff1744' : COLORS.primary} />
          <Text style={[s.timerText, countdown <= 10 && s.timerTextUrgent]}>
            Oferta expira em {countdown}s
          </Text>
        </View>
      )}

      <View style={s.card}>
        {/* Territory badges */}
        {ride?.is_homebound && offerData?.territory_tier === 'OUTSIDE' ? (
          <View style={[s.badge, { backgroundColor: '#fff3e0' }]}>
            <Text style={[s.badgeText, { color: '#e65100' }]}>
              🏠 Retorno para casa · Fora do seu território
            </Text>
            <Text style={s.badgeSub}>
              O passageiro autorizou ampliar a busca. Confira origem e destino antes de aceitar.
            </Text>
          </View>
        ) : ride?.is_homebound ? (
          <View style={[s.badge, { backgroundColor: '#e8f5e9' }]}>
            <Text style={[s.badgeText, { color: '#2e7d32' }]}>🏠 Retorno para casa</Text>
            <Text style={s.badgeSub}>Passageiro da sua região voltando para casa</Text>
          </View>
        ) : offerData?.territory_tier === 'COMMUNITY' ? (
          <View style={[s.badge, { backgroundColor: '#e3f2fd' }]}>
            <Text style={[s.badgeText, { color: '#1565c0' }]}>Da sua comunidade</Text>
            <Text style={s.badgeSub}>Prioridade territorial por comunidade</Text>
          </View>
        ) : offerData?.territory_tier === 'NEIGHBORHOOD' ? (
          <View style={[s.badge, { backgroundColor: '#fff3e0' }]}>
            <Text style={[s.badgeText, { color: '#e65100' }]}>Do seu bairro</Text>
            <Text style={s.badgeSub}>Prioridade territorial por bairro</Text>
          </View>
        ) : offerData?.territory_tier === 'OUTSIDE' ? (
          <View style={[s.badge, { backgroundColor: '#f5f5f5' }]}>
            <Text style={[s.badgeText, { color: '#616161' }]}>Região próxima</Text>
            <Text style={s.badgeSub}>Corrida fora do seu território principal</Text>
          </View>
        ) : null}

        <Text style={s.sectionLabel}>Origem</Text>
        <Text style={s.address}>{ride?.origin_text || 'Não informada'}</Text>
        <Text style={s.arrow}>↓</Text>
        <Text style={s.sectionLabel}>Destino</Text>
        <Text style={s.address}>{ride?.destination_text || 'Não informado'}</Text>

        {ride?.passenger?.name && (
          <>
            <Text style={s.sectionLabel}>Passageiro</Text>
            <Text style={s.passengerName}>{ride.passenger.name}</Text>
          </>
        )}

        <Text style={s.type}>Tipo: {ride?.ride_type || 'normal'}</Text>

        {ride?.wait_requested && (
          <View style={[s.badge, { backgroundColor: '#fff8e1', marginTop: 10 }]}>
            <Text style={[s.badgeText, { color: '#f57f17' }]}>
              ⏳ Espera solicitada{ride.wait_estimated_min ? `: ~${ride.wait_estimated_min} min` : ''}
            </Text>
            {ride.wait_estimated_min ? (
              <Text style={s.badgeSub}>
                + R$ {(ride.wait_estimated_min * 0.50).toFixed(2)} estimado · cobrança pelo tempo real
              </Text>
            ) : (
              <Text style={s.badgeSub}>Passageiro vai precisar que você aguarde no destino</Text>
            )}
            {(ride?.trip_details as any)?.post_wait_destination?.text ? (
              <Text style={[s.badgeSub, { color: '#1565c0', fontWeight: '700', marginTop: 4 }]}>
                📍 Após a espera: {(ride.trip_details as any).post_wait_destination.text}
              </Text>
            ) : null}
            <Text style={[s.badgeSub, { color: '#e65100', fontWeight: '700', marginTop: 4 }]}>
              Taxa 18% sobre o valor
            </Text>
            {(ride?.trip_details as any)?.post_wait_destination && (
              <View style={{ backgroundColor: '#1a1a0a', borderRadius: 6, borderWidth: 1, borderColor: '#C8A84E', paddingVertical: 6, paddingHorizontal: 10, marginTop: 6, alignSelf: 'flex-start' }}>
                <Text style={{ color: '#C8A84E', fontSize: 12, fontWeight: '700' }}>✨ Valor já inclui o trecho após a espera</Text>
              </View>
            )}
          </View>
        )}

        {ride?.trip_details && (
          <View style={s.groupCard}>
            <Ionicons name="people" size={16} color={COLORS.accent} />
            <Text style={s.groupText}>
              {groupLabel(ride.trip_details.passengers || 1, !!ride.trip_details.has_luggage)}
            </Text>
          </View>
        )}

        {quotedPrice != null && (
          <View style={s.priceRow}>
            <Ionicons name="cash-outline" size={16} color={COLORS.primary} />
            <Text style={s.priceText}>Valor base R$ {quotedPrice.toFixed(2)}</Text>
          </View>
        )}
      </View>

      {/* Adjustment cards — only show if ride has a quoted price */}
      {quotedPrice != null && (
        <View style={s.adjustSection}>
          {/* Protection summary */}
          <View style={{ backgroundColor: '#1a1a2e', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Estimativa base</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' }}>R$ {quotedPrice.toFixed(2)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Taxa estimada</Text>
              <Text style={{ color: COLORS.textPrimary, fontSize: 12 }}>18% · R$ {creditValue.toFixed(2)}</Text>
            </View>
            {passengersExtra > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Passageiros extras</Text>
                <Text style={{ color: COLORS.textPrimary, fontSize: 12 }}>+R$ {passengersExtra.toFixed(2)}</Text>
              </View>
            )}
            {luggageExtra > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Bagagem</Text>
                <Text style={{ color: COLORS.textPrimary, fontSize: 12 }}>+R$ {luggageExtra.toFixed(2)}</Text>
              </View>
            )}
            {(ride as any)?.wait_requested && (
              <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#333' }}>
                <Text style={{ color: '#f57f17', fontSize: 11 }}>⏳ Corrida com espera: cobrança por minuto após iniciar/encerrar espera.</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#333' }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Ajuste recomendado</Text>
              <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '700' }}>+R$ {recommendedAdj.toFixed(2)}</Text>
            </View>
            {selectedAdjustment && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Novo valor se aceito</Text>
                <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '800' }}>R$ {(quotedPrice + selectedAdjustment).toFixed(2)}</Text>
              </View>
            )}
          </View>

          <Text style={s.adjustTitle}>Sugerir ajuste de valor?</Text>
          <View style={s.adjustRow}>
            {ADJUSTMENTS.map(adj => {
              const active = selectedAdjustment === adj.value;
              const recommended = adj.value === recommendedAdj && !selectedAdjustment;
              return (
                <TouchableOpacity
                  key={adj.value}
                  style={[s.adjustCard, active && s.adjustCardActive, recommended && { borderColor: COLORS.primary, borderWidth: 2 }]}
                  onPress={() => setSelectedAdjustment(active ? null : adj.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.adjustValue, active && s.adjustValueActive, recommended && { color: COLORS.primary }]}>{adj.label}</Text>
                  <Text style={[s.adjustTag, active && s.adjustTagActive, recommended && { color: COLORS.primary }]}>
                    {recommended ? '⭐ recomendado' : adj.tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {finalPrice != null && (
            <View style={s.finalPriceRow}>
              <Text style={s.finalPriceLabel}>Valor final</Text>
              <Text style={s.finalPriceValue}>R$ {finalPrice.toFixed(2)}</Text>
            </View>
          )}
        </View>
      )}

    </ScrollView>
    <View style={s.footerButtons}>
      <Button
        title={loading ? 'Aceitando...' : selectedAdjustment ? 'Aceitar com ajuste' : 'Aceitar corrida'}
        onPress={handleAccept}
        disabled={loading || expired}
        style={s.acceptBtn}
      />
      <Button title="Recusar" onPress={handleReject} disabled={loading} style={s.rejectBtn} />
    </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: COLORS.background, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  timerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1a1a2e', borderRadius: 8, paddingVertical: 8, marginBottom: 16, borderWidth: 1, borderColor: COLORS.primary },
  timerBarUrgent: { backgroundColor: '#2d0a0a', borderColor: '#ff1744' },
  timerText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  timerTextUrgent: { color: '#ff1744' },
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 20, marginBottom: 16 },
  badge: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginBottom: 12 },
  badgeText: { fontSize: 15, fontWeight: '700' },
  badgeSub: { fontSize: 12, color: '#666', marginTop: 2 },
  sectionLabel: { fontSize: 12, color: COLORS.textMuted, textTransform: 'uppercase', marginTop: 12 },
  address: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, marginTop: 4 },
  arrow: { fontSize: 24, textAlign: 'center', color: COLORS.statusOffline, marginVertical: 8 },
  passengerName: { fontSize: 16, color: COLORS.textPrimary, marginTop: 4 },
  type: { fontSize: 14, color: COLORS.textSecondary, marginTop: 16, textAlign: 'right' },
  tripInfo: { fontSize: 14, color: COLORS.textPrimary, marginTop: 8, backgroundColor: COLORS.surfaceLight, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, overflow: 'hidden' },
  groupCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: COLORS.surfaceLight, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  groupText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
  priceText: { fontSize: 16, fontWeight: '700', color: COLORS.primary },

  // Adjustment section
  adjustSection: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  adjustTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 12, textAlign: 'center' },
  adjustRow: { flexDirection: 'row', gap: 8 },
  adjustCard: {
    flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8,
    borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  adjustCardActive: { borderColor: COLORS.primary, backgroundColor: '#1a1a0a' },
  adjustValue: { fontSize: 18, fontWeight: '800', color: COLORS.textSecondary },
  adjustValueActive: { color: COLORS.primary },
  adjustTag: { fontSize: 11, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' },
  adjustTagActive: { color: COLORS.primary },
  finalPriceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  finalPriceLabel: { fontSize: 14, color: COLORS.textSecondary },
  finalPriceValue: { fontSize: 20, fontWeight: '800', color: COLORS.primary },

  acceptBtn: { backgroundColor: COLORS.success },
  rejectBtn: { backgroundColor: COLORS.danger },
  footerButtons: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 32, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: '#222' },
  bigIcon: { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  centeredTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: COLORS.textPrimary },
  centeredSub: { fontSize: 16, textAlign: 'center', color: COLORS.textSecondary, marginTop: 8 },
});
