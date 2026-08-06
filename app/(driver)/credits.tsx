import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert, RefreshControl, Linking, Modal, Pressable, Image, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { driverApi } from '../../src/api/driver.api';
import { COLORS } from '../../src/config/colors';

type Package = {
  id: string;
  label: string;
  amount_cents: number;
  wallet_credit_cents: number;
  charged_amount_cents: number;
  provider_fee_estimated_cents: number;
  fee_label: string;
  family_return_percent: number;
  family_return_cents: number;
};
type FamilyReturn = { percent: number; message: string } | null;
type FamilyReturnData = { enabled: boolean; percent?: number; accrued_cents: number; available_for_request?: boolean; message?: string } | null;
type LedgerEntry = { id: string; entry_type: string; balance_delta_cents: number; balance_after_cents: number; reason: string; created_at: string };

const formatCentsToBRL = (cents: number): string => `R$ ${(Math.max(0, cents) / 100).toFixed(2).replace('.', ',')}`;

export default function DriverCredits() {
  const router = useRouter();
  const [balance, setBalance] = useState<{ balance_cents: number; reserved_cents: number; available_cents: number; balance_display: string } | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [familyReturn, setFamilyReturn] = useState<FamilyReturn>(null);
  const [familyReturnData, setFamilyReturnData] = useState<FamilyReturnData>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);

  const [sumupData, setSumupData] = useState<{
    rechargeId: string;
    checkoutUrl: string | null;
    chargedAmountCents: number;
    walletCreditCents: number;
    feeLabel: string;
    pixQrImageUrl?: string | null;
    pixCopyPaste?: string | null;
  } | null>(null);

  const getPackageBadge = (pkg: Package): string | null => {
    if (pkg.amount_cents === 500) return 'Recarga de teste';
    if (pkg.amount_cents === 2000) return 'Para começar hoje';
    if (pkg.amount_cents === 5000) return 'Mais escolhido';
    if (pkg.amount_cents === 10000) return 'Mais tranquilidade';
    return null;
  };

  useEffect(() => {
    if (!sumupData) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (cancelled) return;
      try {
        const recharge = await driverApi.getWalletRecharge(sumupData.rechargeId);
        if (recharge.status === 'confirmed') {
          cancelled = true;
          clearInterval(id);
          setSumupData(null);
          await load();
          Alert.alert('Pagamento confirmado', 'Saldo adicionado à sua conta.');
          return;
        }
        if (recharge.status === 'expired') {
          cancelled = true;
          clearInterval(id);
          Alert.alert('Pagamento expirado', 'O checkout expirou. Gere uma nova recarga.');
        }
      } catch {}
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sumupData, load]);

  const load = useCallback(async () => {
    try {
      const [wal, pkgs, led, fr] = await Promise.allSettled([
        driverApi.getWallet(),
        driverApi.getWalletPackages(),
        driverApi.getWalletLedger(10, 0),
        driverApi.getFamilyReturn(),
      ]);
      if (wal.status === 'fulfilled') setBalance(wal.value);
      if (pkgs.status === 'fulfilled') { setPackages(pkgs.value.packages); setFamilyReturn(pkgs.value.family_return); }
      if (led.status === 'fulfilled') setLedger(led.value.entries || []);
      if (fr.status === 'fulfilled') setFamilyReturnData(fr.value);
      setLoadError(wal.status !== 'fulfilled');
    } catch (e) {
      console.warn('[Wallet] load failed:', e);
      setLoadError(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPaymentMethodSelector = (pkg: Package) => {
    if (buying) return;
    setSelectedPackage(pkg);
  };

  const closePaymentMethodSelector = () => {
    setSelectedPackage(null);
  };

  const handleBuy = async () => {
    if (buying || !selectedPackage) return;
    setBuying(true);
    try {
      const result = await driverApi.createWalletRecharge(selectedPackage.id);

      if (result.payment_provider === 'sumup' && result.pix) {
        closePaymentMethodSelector();
        setSumupData({
          rechargeId: result.rechargeId,
          checkoutUrl: result.checkout?.url || null,
          chargedAmountCents: result.charged_amount_cents ?? result.amount_cents,
          walletCreditCents: result.wallet_credit_cents ?? result.amount_cents,
          feeLabel: result.fee_label || 'Pix sem taxa adicional',
          pixQrImageUrl: result.pix.qr_image_url,
          pixCopyPaste: result.pix.copy_paste,
        });
        return;
      }

      closePaymentMethodSelector();
      Alert.alert('Erro', 'Não foi possível iniciar o pagamento.');
    } catch (e: any) {
      closePaymentMethodSelector();
      if (e.response?.status === 410 || e.response?.status === 503) {
        Alert.alert('Recarga indisponível', e.response?.data?.error || 'Pix pela SumUp indisponível no momento. Tente novamente em instantes.');
      } else {
        Alert.alert('Erro', e.response?.data?.error || 'Não foi possível criar a cobrança.');
      }
    } finally { setBuying(false); }
  };

  const handleSumUpPaid = async () => {
    if (!sumupData) return;
    try {
      const recharge = await driverApi.getWalletRecharge(sumupData.rechargeId);
      if (recharge.status === 'confirmed') {
        setSumupData(null);
        await load();
        Alert.alert('Pagamento confirmado', 'Saldo adicionado à sua conta.');
        return;
      }
      if (recharge.status === 'expired') {
        Alert.alert('Pagamento expirado', 'O checkout expirou. Gere uma nova recarga.');
        setSumupData(null);
        return;
      }
      Alert.alert('Pagamento pendente', 'Ainda estamos aguardando a confirmação do pagamento.');
    } catch {
      Alert.alert('Erro', 'Não foi possível verificar o pagamento agora.');
    }
  };

  const handleCopyPixCode = () => {
    if (!sumupData?.pixCopyPaste) return;
    Clipboard.setString(sumupData.pixCopyPaste);
    Alert.alert('Código Pix copiado');
  };

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        <View style={s.loadingCard}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={s.loadingTitle}>Carregando saldo KAVIAR…</Text>
          <View style={s.loadingLine} />
          <View style={[s.loadingLine, { width: '62%' }]} />
        </View>
      </View>
    </SafeAreaView>
  );

  if (loadError && !balance) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        <Ionicons name="cloud-offline-outline" size={40} color={COLORS.textMuted} />
        <Text style={{ color: COLORS.textSecondary, fontSize: 15, marginTop: 12, textAlign: 'center' }}>Sem conexão. Verifique sua internet e tente novamente.</Text>
        <TouchableOpacity style={{ marginTop: 20, backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 }} onPress={() => { setLoading(true); setLoadError(false); load(); }}>
          <Text style={{ fontWeight: '700', color: '#000', fontSize: 14 }}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  if (sumupData) return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setSumupData(null)}><Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={s.title}>Pix</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={s.pixContainer}>
        <View style={s.pixCard}>
          <Ionicons name="open-outline" size={32} color={COLORS.primary} />
          <Text style={s.pixTitle}>Pagamento SumUp aberto</Text>
          <Text style={s.pixSub}>QR Code Pix pela SumUp</Text>
          <Text style={[s.pixSub, { marginTop: 0, marginBottom: 6 }]}>Pague {formatCentsToBRL(sumupData.chargedAmountCents)}</Text>
          <Text style={[s.pixSub, { marginTop: 0, marginBottom: 6 }]}>{sumupData.feeLabel}</Text>
          <Text style={[s.pixSub, { marginTop: 0, marginBottom: 6 }]}>Valor pago = saldo creditado</Text>
          <Text style={[s.pixSub, { marginTop: 0, marginBottom: 20 }]}>Saldo creditado: {formatCentsToBRL(sumupData.walletCreditCents)}</Text>

          {sumupData.pixQrImageUrl ? (
            <Image source={{ uri: sumupData.pixQrImageUrl }} style={s.pixQrImage} resizeMode="contain" />
          ) : null}
          {sumupData.pixCopyPaste ? (
            <View style={s.pixCodeBox}>
              <Text selectable style={s.pixCodeText}>{sumupData.pixCopyPaste}</Text>
            </View>
          ) : null}
          {sumupData.pixCopyPaste ? (
            <TouchableOpacity style={s.copyPixBtn} onPress={handleCopyPixCode}>
              <Text style={s.copyPixBtnText}>Copiar código Pix</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={s.pixInstructions}>Escaneie o QR Code Pix no app do seu banco e finalize o pagamento. O saldo será creditado após confirmação.</Text>
          {sumupData.pixQrImageUrl ? (
            <TouchableOpacity style={s.doneBtn} onPress={() => Linking.openURL(sumupData.pixQrImageUrl as string)}>
              <Text style={s.doneBtnText}>Abrir QR em tela cheia</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={[s.doneBtn, { marginTop: 10 }]} onPress={handleSumUpPaid}>
            <Text style={s.doneBtnText}>Já paguei</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 8 }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>Aguardando confirmação do pagamento...</Text>
          </View>
          <Text style={s.pixNote}>Esta tela verifica automaticamente o status a cada 5 segundos.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  // Main screen
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={s.title}>Saldo KAVIAR</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}>
        {/* Balance */}
        <View style={s.balanceCard}>
          <Ionicons name="wallet-outline" size={28} color={COLORS.primary} />
          <Text style={s.balanceValue}>{balance?.balance_display ?? 'R$ 0,00'}</Text>
          <Text style={s.balanceLabel}>saldo disponível</Text>
        </View>

        {balance !== null && balance.available_cents < 1000 && (
          <View style={[s.alert, balance.available_cents === 0 && { backgroundColor: '#fde8e8' }]}>
            <Ionicons name={balance.available_cents === 0 ? 'alert-circle-outline' : 'warning-outline'} size={18} color={balance.available_cents === 0 ? COLORS.danger : COLORS.warning} />
            <Text style={[s.alertText, { color: balance.available_cents === 0 ? COLORS.danger : COLORS.warning }]}>
              {balance.available_cents === 0 ? 'Sem saldo disponível. Adicione saldo para receber corridas.' : 'Saldo baixo. Adicione saldo em breve.'}
            </Text>
          </View>
        )}

        {/* Packages */}
        <Text style={s.sectionTitle}>Adicionar saldo</Text>

        {/* Gratificação Anual KAVIAR */}
        {familyReturnData?.enabled && (
          <View style={[s.infoCard, { marginBottom: 16, borderLeftWidth: 3, borderLeftColor: COLORS.success }]}>
            <Text style={[s.infoTitle, { color: COLORS.success }]}>Gratificação Anual KAVIAR</Text>
            <Text style={[s.infoText, { marginTop: 0 }]}>Valor acumulado no ciclo atual</Text>
            <Text style={{ fontSize: 30, fontWeight: '800', color: COLORS.success, marginTop: 4 }}>
              {formatCentsToBRL(familyReturnData.accrued_cents || 0)}
            </Text>
            {familyReturnData.accrued_cents > 0 ? (
              <>
                <Text style={[s.infoText, { marginTop: 8 }]}>Sua gratificação é acumulada após a conclusão e liquidação de operações elegíveis. O cálculo utiliza o percentual vigente sobre a taxa efetivamente reconhecida pela KAVIAR, e não sobre recargas ou sobre o valor total da corrida.</Text>
                {familyReturnData.available_for_request && (
                  <Text style={[s.infoText, { marginTop: 6, fontWeight: '600', color: COLORS.success }]}>Período de solicitação aberto.</Text>
                )}
                <Text style={[s.infoText, { fontSize: 11, marginTop: 6 }]}>Valores não solicitados permanecem acumulados para o ciclo seguinte.</Text>
              </>
            ) : (
              <Text style={[s.infoText, { marginTop: 8 }]}>Nenhuma gratificação foi gerada até o momento. O valor será atualizado após a liquidação de operações elegíveis.</Text>
            )}
            <Text style={[s.infoText, { fontSize: 11, marginTop: 8, color: COLORS.textMuted }]}>Não constitui salário, 13º, comissão sobre o valor total da corrida ou vínculo empregatício.</Text>
          </View>
        )}

        {packages.map(pkg => (
          <TouchableOpacity key={pkg.id} style={s.packageCard} onPress={() => openPaymentMethodSelector(pkg)} disabled={buying}>
            <View style={{ flex: 1 }}>
              {getPackageBadge(pkg) ? <Text style={s.packageBadge}>{getPackageBadge(pkg)}</Text> : null}
              <Text style={s.packageCredits}>{pkg.label}</Text>
              <Text style={s.packagePrice}>Pix sem taxa adicional</Text>
              <Text style={s.packagePrice}>Valor pago = saldo creditado</Text>
            </View>
            <View style={s.buyBtn}>
              {buying ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.buyBtnText}>Escolher</Text>}
            </View>
          </TouchableOpacity>
        ))}

        {/* How it works */}
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Como funciona</Text>
          <Text style={s.infoText}>Pix sem taxa adicional.</Text>
          <Text style={s.infoText}>Valor pago = saldo creditado.</Text>
          <Text style={s.infoText}>Você recebe do passageiro. A taxa KAVIAR é debitada do saldo apenas após corrida concluída.</Text>
          <Text style={s.infoText}>Mantenha saldo disponível para continuar recebendo corridas pelo app.</Text>
          <Text style={[s.infoText, { marginTop: 10, fontWeight: '600', color: COLORS.textPrimary }]}>Exemplo: corrida de R$ 30,00</Text>
          <Text style={s.infoText}>• Passageiro paga R$ 30,00 direto para você</Text>
          <Text style={s.infoText}>• Taxa KAVIAR 18% = R$ 5,40</Text>
          <Text style={s.infoText}>• Seu saldo KAVIAR é descontado em R$ 5,40</Text>
        </View>

        {/* History */}
        {ledger.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Últimos lançamentos</Text>
            {ledger.slice(0, 5).map((e: any) => (
              <View key={e.id} style={s.historyRow}>
                <Ionicons name={e.balance_delta_cents > 0 ? 'add-circle' : 'remove-circle'} size={16} color={e.balance_delta_cents > 0 ? COLORS.success : COLORS.warning} />
                <Text style={s.historyText}>R$ {(Math.abs(e.balance_delta_cents) / 100).toFixed(2)}</Text>
                <Text style={s.historyStatus}>{({ recharge: 'Recarga', recharge_bonus: 'Bônus de recarga 🎁', fee_debit: 'Taxa corrida', reserve: 'Reserva', cancel_release: 'Liberação cancelamento', pending_resolve: 'Taxa pendente' })[e.entry_type] || e.entry_type}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal transparent animationType="fade" visible={!!selectedPackage} onRequestClose={closePaymentMethodSelector}>
        <Pressable style={s.methodModalOverlay} onPress={closePaymentMethodSelector}>
          <Pressable style={s.methodModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={s.methodModalTitle}>Como deseja recarregar?</Text>
            <Text style={s.methodModalSubtitle}>QR Code Pix pela SumUp</Text>

            <TouchableOpacity style={s.methodOption} onPress={handleBuy} disabled={buying}>
              <View style={{ flex: 1 }}>
                <Text style={s.methodOptionTitle}>Pagar com Pix</Text>
                <Text style={s.methodOptionSub}>{selectedPackage ? `Pague ${formatCentsToBRL(selectedPackage.wallet_credit_cents)}` : 'QR Code Pix pela SumUp'}</Text>
                <Text style={s.methodOptionSubMuted}>Pix sem taxa adicional</Text>
                <Text style={s.methodOptionSubMuted}>Valor pago = saldo creditado</Text>
              </View>
              {buying ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="qr-code-outline" size={20} color={COLORS.primary} />}
            </TouchableOpacity>

            <TouchableOpacity style={s.methodCancelBtn} onPress={closePaymentMethodSelector} disabled={buying}>
              <Text style={s.methodCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingCard: { width: '100%', backgroundColor: COLORS.surface, borderRadius: 18, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  loadingTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginTop: 14, marginBottom: 18 },
  loadingLine: { width: '78%', height: 12, borderRadius: 6, backgroundColor: COLORS.surfaceLight, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  scroll: { padding: 20, paddingBottom: 40 },
  balanceCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  balanceValue: { fontSize: 44, fontWeight: '900', color: COLORS.textPrimary, marginTop: 8 },
  balanceLabel: { fontSize: 13, color: COLORS.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  alert: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff8e1', padding: 12, borderRadius: 12, gap: 8, marginBottom: 16 },
  alertText: { fontSize: 13, flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginTop: 20, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  packageCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  packageBadge: { alignSelf: 'flex-start', backgroundColor: '#0b5fff', color: '#fff', fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginBottom: 8 },
  packageCredits: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  packagePrice: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  buyBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  buyBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 },
  infoTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  infoText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginTop: 2 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  historyText: { flex: 1, fontSize: 14, color: COLORS.textPrimary },
  historyStatus: { fontSize: 12, color: COLORS.textMuted },
  pixContainer: { padding: 20, alignItems: 'center' },
  pixCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  pixTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary, marginTop: 12 },
  pixSub: { fontSize: 15, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  pixQrImage: { width: 220, height: 220, borderRadius: 12, backgroundColor: '#fff', marginBottom: 12 },
  pixCodeBox: { width: '100%', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 10, padding: 10, marginBottom: 6 },
  pixCodeText: { fontSize: 11, color: COLORS.textSecondary },
  copyPixBtn: { marginTop: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: COLORS.background },
  copyPixBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  pixInstructions: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 16, lineHeight: 19 },
  doneBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 20 },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
  pixNote: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 12 },
  methodModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.68)', justifyContent: 'center', padding: 20 },
  methodModalCard: { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary, padding: 20, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  methodModalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  methodModalSubtitle: { marginTop: 6, marginBottom: 16, fontSize: 13, color: COLORS.textMuted },
  methodOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, backgroundColor: COLORS.background, marginBottom: 10 },
  methodOptionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  methodOptionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  methodOptionSubMuted: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  methodCancelBtn: { marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 12, alignItems: 'center' },
  methodCancelText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
});
