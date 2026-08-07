import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { driverApi } from '../../src/api/driver.api';
import { COLORS } from '../../src/config/colors';

const formatStringCentsToBRL = (centsStr: string): string => {
  const raw = centsStr || '0';
  const n = raw.length;
  if (n <= 2) return `R$ 0,${raw.padStart(2, '0')}`;
  return `R$ ${raw.slice(0, n - 2)},${raw.slice(n - 2)}`;
};

type Step = 'loading' | 'destination' | 'confirm' | 'success' | 'history' | 'closed';

export default function AnnualIncentiveRequest() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('loading');
  const [summary, setSummary] = useState<any>(null);
  const [destination, setDestination] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [cpf, setCpf] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sum, dest, reqs] = await Promise.all([
        driverApi.getAnnualIncentiveSummary(),
        driverApi.getPayoutDestination(),
        driverApi.getAnnualIncentiveRequests(),
      ]);
      setSummary(sum);
      setDestination(dest);
      setRequests(reqs);

      if (!sum.requestWindow.isOpen) {
        setStep('closed');
      } else if (sum.hasOpenRequest) {
        setStep('history');
      } else if (!dest) {
        setStep('destination');
      } else {
        setStep('confirm');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erro ao carregar dados');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSetDestination = async () => {
    if (!cpf || cpf.replace(/\D/g, '').length !== 11) {
      Alert.alert('CPF inválido', 'Informe os 11 dígitos do CPF.');
      return;
    }
    setSubmitting(true);
    try {
      const dest = await driverApi.setPayoutDestination(cpf.replace(/\D/g, ''));
      setDestination(dest);
      setStep('confirm');
    } catch (e: any) {
      Alert.alert('Erro', e.response?.data?.message || 'Não foi possível cadastrar o PIX.');
    } finally { setSubmitting(false); }
  };

  const handleRequest = async () => {
    if (!summary) return;
    setSubmitting(true);
    try {
      const idempotencyKey = `driver-request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await driverApi.createAnnualIncentiveRequest(
        summary.totalAvailableCents,
        idempotencyKey
      );
      Alert.alert(
        'Solicitação enviada',
        `Valor: ${formatStringCentsToBRL(result.requestedAmountCents)}\nPrazo de pagamento: até 48 horas.`
      );
      setStep('success');
    } catch (e: any) {
      const code = e.response?.data?.error;
      if (code === 'WINDOW_CLOSED') Alert.alert('Janela fechada', 'O período de solicitação encerrou.');
      else if (code === 'INSUFFICIENT_BALANCE') Alert.alert('Saldo insuficiente', 'Não há saldo disponível.');
      else if (code === 'OPEN_REQUEST_EXISTS') { Alert.alert('Solicitação já existe', 'Você já possui uma solicitação em aberto.'); setStep('history'); }
      else Alert.alert('Erro', e.response?.data?.message || 'Não foi possível criar a solicitação.');
    } finally { setSubmitting(false); }
  };

  if (error) return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={s.title}>Gratificação Anual</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={s.center}><Text style={{ color: COLORS.danger }}>{error}</Text></View>
    </SafeAreaView>
  );

  if (step === 'loading') return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={s.title}>Gratificação Anual</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={s.scroll}>

        {step === 'closed' && (
          <View style={s.card}>
            <Ionicons name="calendar-outline" size={32} color={COLORS.textMuted} />
            <Text style={[s.cardTitle, { marginTop: 12 }]}>Janela de solicitação fechada</Text>
            <Text style={s.cardText}>A solicitação estará disponível entre outubro e dezembro.</Text>
            {summary && <Text style={[s.cardText, { fontWeight: '600' }]}>Saldo acumulado: {formatStringCentsToBRL(summary.totalAvailableCents)}</Text>}
            <Text style={s.cardText}>Valores não solicitados permanecem acumulados.</Text>
          </View>
        )}

        {step === 'destination' && (
          <View style={s.card}>
            <Ionicons name="key-outline" size={32} color={COLORS.primary} />
            <Text style={[s.cardTitle, { marginTop: 12 }]}>Cadastrar chave PIX</Text>
            <Text style={s.cardText}>Para receber sua gratificação, informe o CPF da sua chave PIX.</Text>
            <TextInput
              style={s.input}
              placeholder="Somente números do CPF"
              keyboardType="numeric"
              maxLength={14}
              value={cpf}
              onChangeText={setCpf}
            />
            <TouchableOpacity style={s.btn} onPress={handleSetDestination} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Confirmar PIX</Text>}
            </TouchableOpacity>
          </View>
        )}

        {step === 'confirm' && summary && (
          <View style={s.card}>
            <Ionicons name="cash-outline" size={32} color={COLORS.success} />
            <Text style={[s.cardTitle, { marginTop: 12 }]}>Solicitar gratificação</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: COLORS.success, marginTop: 8 }}>
              {formatStringCentsToBRL(summary.totalAvailableCents)}
            </Text>
            <Text style={s.cardText}>Valor disponível para solicitação</Text>
            {destination && <Text style={[s.cardText, { fontSize: 12 }]}>PIX: {destination.pixKeyMasked}</Text>}
            <Text style={[s.cardText, { fontSize: 12, color: COLORS.textMuted }]}>Prazo de pagamento: até 48 horas após a solicitação.</Text>
            <TouchableOpacity style={s.btn} onPress={handleRequest} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Solicitar agora</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 12 }} onPress={() => setStep('destination')}>
              <Text style={{ color: COLORS.primary, fontSize: 13 }}>Alterar chave PIX</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'success' && (
          <View style={s.card}>
            <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
            <Text style={[s.cardTitle, { marginTop: 12 }]}>Solicitação enviada!</Text>
            <Text style={s.cardText}>Prazo de pagamento: até 48 horas.</Text>
            <TouchableOpacity style={[s.btn, { marginTop: 16 }]} onPress={() => router.back()}>
              <Text style={s.btnText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'history' && (
          <View style={s.card}>
            <Ionicons name="document-text-outline" size={32} color={COLORS.primary} />
            <Text style={[s.cardTitle, { marginTop: 12 }]}>Solicitações</Text>
            {requests.map(r => (
              <View key={r.id} style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 }}>
                <Text style={{ fontWeight: '700', fontSize: 14, color: COLORS.textPrimary }}>{formatStringCentsToBRL(r.requestedAmountCents)}</Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Status: {r.status}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{r.destinationMasked}</Text>
                {r.deadlineAt && <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Prazo: {new Date(r.deadlineAt).toLocaleString('pt-BR')}</Text>}
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  scroll: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  cardText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  input: { width: '100%', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 14, fontSize: 16, marginTop: 16, backgroundColor: COLORS.background },
  btn: { backgroundColor: COLORS.success, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 16, alignItems: 'center', width: '100%' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
