import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/config/colors';
import { driverApi } from '../../src/api/driver.api';
import { getMyDocuments } from '../services/documentApi';

const MODALITY_LABELS: Record<string, string> = {
  CAR: 'Carro',
  MOTO_PASSENGER: 'Moto Passageiro',
  MOTO_DELIVERY: 'Moto Entrega',
  TAXI: 'Taxi',
  VAN: 'Van',
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  NOT_REQUIRED: { label: 'Nenhuma exigencia municipal adicional', color: '#1F2937', bg: '#F3F4F6' },
  NOT_STARTED: { label: 'Regularizacao nao iniciada', color: '#374151', bg: '#F3F4F6' },
  DOCUMENTS_PENDING: { label: 'Envie os documentos pendentes', color: '#9A3412', bg: '#FFEDD5' },
  IN_REVIEW_BY_KAVIAR: { label: 'Documentos em conferencia pela KAVIAR', color: '#92400E', bg: '#FEF3C7' },
  READY_FOR_CITY_HALL: { label: 'Pronto para envio a Prefeitura', color: '#92400E', bg: '#FEF3C7' },
  SUBMITTED_TO_CITY_HALL: { label: 'Enviado a Prefeitura', color: '#92400E', bg: '#FEF3C7' },
  WAITING_CITY_HALL_REVIEW: { label: 'Aguardando analise da Prefeitura', color: '#92400E', bg: '#FEF3C7' },
  NEEDS_COMPLEMENT: { label: 'Prefeitura solicitou complemento', color: '#9A3412', bg: '#FFEDD5' },
  APPROVED_BY_CITY_HALL: { label: 'Aprovado para operar nesta cidade', color: '#065F46', bg: '#D1FAE5' },
  REJECTED_BY_CITY_HALL: { label: 'Indeferido pela Prefeitura', color: '#991B1B', bg: '#FEE2E2' },
  EXPIRED: { label: 'Autorizacao vencida', color: '#991B1B', bg: '#FEE2E2' },
  REQUIRES_CONFIRMATION: { label: 'Modalidade depende de confirmacao municipal', color: '#92400E', bg: '#FEF3C7' },
};

const DOC_LABELS: Record<string, string> = {
  CPF: 'CPF',
  RG: 'RG',
  CNH: 'CNH',
  PROOF_OF_ADDRESS: 'Comprovante de Residencia',
  VEHICLE_PHOTO: 'Foto do Veiculo',
  BACKGROUND_CHECK: 'Antecedentes Criminais',
  PROFILE_PHOTO: 'Foto de Perfil',
};

function normalizeState(input: string) {
  return input.trim().toUpperCase().slice(0, 2);
}

function normalizeCity(input: string) {
  return input.trim().replace(/\s+/g, ' ');
}

function formatCityState(city?: string | null, state?: string | null) {
  if (!city && !state) return 'cidade nao identificada';
  if (!city) return state || '';
  if (!state) return city;
  return `${city}/${state}`;
}

export default function DriverMunicipalRegularization() {
  const router = useRouter();
  const params = useLocalSearchParams<{ modality?: string; lat?: string; lng?: string }>();

  const [modality, setModality] = useState<string>((params.modality as string) || 'CAR');
  const [detectingLocation, setDetectingLocation] = useState(true);
  const [detectedCity, setDetectedCity] = useState('');
  const [detectedState, setDetectedState] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [stateInput, setStateInput] = useState('');
  const [confirmedCity, setConfirmedCity] = useState('');
  const [confirmedState, setConfirmedState] = useState('');

  const [loadingMunicipal, setLoadingMunicipal] = useState(false);
  const [requirementsData, setRequirementsData] = useState<any>(null);
  const [statusData, setStatusData] = useState<any>(null);
  const [docsByType, setDocsByType] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);

  const statusKey = (statusData?.municipalStatus || 'NOT_STARTED') as string;
  const statusMeta = STATUS_META[statusKey] || { label: statusKey, color: '#1F2937', bg: '#F3F4F6' };
  const requiresCityApproval = Boolean(statusData?.requiresCityApproval ?? requirementsData?.regulation?.requires_city_approval);

  const requiredChecklist = useMemo(() => {
    const reqs = requirementsData?.requirements || [];
    return reqs.filter((item: any) => item.is_required);
  }, [requirementsData]);

  const checklistProgress = useMemo(() => {
    if (!requiredChecklist.length) return { done: 0, total: 0 };
    let done = 0;
    requiredChecklist.forEach((item: any) => {
      if (!item.document_type) return;
      const status = docsByType[item.document_type];
      if (status === 'SUBMITTED' || status === 'VERIFIED') done += 1;
    });
    return { done, total: requiredChecklist.length };
  }, [requiredChecklist, docsByType]);

  const detectCityFromCoords = async (lat: number, lng: number) => {
    const result = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const city = normalizeCity(result?.[0]?.city || result?.[0]?.subregion || '');
    const state = normalizeState(result?.[0]?.region || result?.[0]?.regionCode || '');

    setDetectedCity(city);
    setDetectedState(state);
    setCityInput(city);
    setStateInput(state);

    return { city, state };
  };

  const detectWithCurrentLocation = async () => {
    setDetectingLocation(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setDetectingLocation(false);
        setError('Nao foi possivel detectar sua cidade sem permissao de localizacao. Escolha manualmente abaixo.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      await detectCityFromCoords(loc.coords.latitude, loc.coords.longitude);
    } catch {
      setError('Nao foi possivel detectar sua cidade automaticamente. Escolha manualmente.');
    } finally {
      setDetectingLocation(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      const pLat = Number(params.lat);
      const pLng = Number(params.lng);
      if (!Number.isNaN(pLat) && !Number.isNaN(pLng)) {
        setDetectingLocation(true);
        try {
          await detectCityFromCoords(pLat, pLng);
        } catch {
          setError('Nao foi possivel identificar cidade/UF a partir da sua localizacao.');
        } finally {
          setDetectingLocation(false);
        }
      } else {
        setDetectingLocation(false);
        setShowLocationDisclosure(true);
      }
    };

    run();
  }, []);

  const loadMunicipal = async (city: string, state: string, selectedModality: string) => {
    setLoadingMunicipal(true);
    setError('');

    try {
      const [requirements, status, docs] = await Promise.all([
        driverApi.getMunicipalRequirements({ city, state, modality: selectedModality }),
        driverApi.getMunicipalStatus({ city, state, modality: selectedModality }),
        getMyDocuments(),
      ]);

      setRequirementsData(requirements);
      setStatusData(status);

      const nextDocsByType: Record<string, string> = {};
      if (docs.success && docs.data) {
        docs.data.forEach((doc) => {
          nextDocsByType[doc.type] = doc.status;
        });
      }
      setDocsByType(nextDocsByType);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nao foi possivel carregar dados da regularizacao municipal.');
      setRequirementsData(null);
      setStatusData(null);
    } finally {
      setLoadingMunicipal(false);
    }
  };

  const confirmDetectedCity = async () => {
    const city = normalizeCity(cityInput || detectedCity);
    const state = normalizeState(stateInput || detectedState);

    if (!city || !state) {
      Alert.alert('Cidade/UF obrigatorias', 'Informe cidade e UF para continuar.');
      return;
    }

    setConfirmedCity(city);
    setConfirmedState(state);
    await loadMunicipal(city, state, modality);
  };

  const useDifferentCity = async () => {
    const city = normalizeCity(cityInput);
    const state = normalizeState(stateInput);

    if (!city || !state) {
      Alert.alert('Cidade/UF obrigatorias', 'Preencha cidade e UF para consultar as exigencias municipais.');
      return;
    }

    setConfirmedCity(city);
    setConfirmedState(state);
    await loadMunicipal(city, state, modality);
  };

  const renderRequirementRow = (item: any) => {
    const docType = item.document_type as string | null;
    const docStatus = docType ? docsByType[docType] : null;
    const ok = docType ? docStatus === 'SUBMITTED' || docStatus === 'VERIFIED' : false;

    return (
      <View key={item.id} style={[styles.requirementRow, ok ? styles.reqOk : styles.reqPending]}>
        <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={ok ? '#0F766E' : '#B45309'} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.requirementLabel}>{item.label}</Text>
          {!!item.description && <Text style={styles.requirementDesc}>{item.description}</Text>}
          {!!docType && (
            <Text style={styles.requirementDocType}>
              Documento: {DOC_LABELS[docType] || docType}
            </Text>
          )}
          {!!docType && !ok && (
            <Text style={styles.requirementPendingText}>Pendente de envio/validacao no cadastro KAVIAR.</Text>
          )}
        </View>
      </View>
    );
  };

  const requiresConfirmationMessage =
    requirementsData?.regulation?.regulation_status === 'REQUIRES_CONFIRMATION'
      ? `Esta modalidade ainda depende de confirmacao municipal em ${formatCityState(requirementsData?.city, requirementsData?.state)}. A KAVIAR ira acompanhar a regulamentacao antes de liberar operacao.`
      : '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Cadastro de Parceiro KAVIAR</Text>
        <Text style={styles.subtitle}>Resumo da etapa municipal para sua cidade</Text>

        <View style={styles.phaseCard}>
          <Text style={styles.phaseTitle}>1. Cadastro KAVIAR</Text>
          <Text style={styles.phaseText}>Seus dados principais ja foram salvos com sucesso.</Text>
        </View>

        <View style={styles.phaseCard}>
          <Text style={styles.phaseTitle}>2. Documentos KAVIAR</Text>
          <Text style={styles.phaseText}>Envie seus documentos usando o fluxo normal do app.</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(driver)/documents')}>
            <Text style={styles.secondaryBtnText}>Ir para documentos</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.phaseCard}>
          <Text style={styles.phaseTitle}>3. Regularizacao Municipal</Text>
          <Text style={styles.phaseText}>Detectamos que voce esta em {formatCityState(detectedCity, detectedState)}. Deseja se cadastrar para operar nesta cidade?</Text>

          {detectingLocation && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Detectando cidade/UF...</Text>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.label}>Cidade</Text>
          <TextInput style={styles.input} value={cityInput} onChangeText={setCityInput} placeholder="Cidade" placeholderTextColor="#9CA3AF" />

          <Text style={styles.label}>UF</Text>
          <TextInput
            style={styles.input}
            value={stateInput}
            onChangeText={(v) => setStateInput(normalizeState(v))}
            placeholder="UF"
            placeholderTextColor="#9CA3AF"
            maxLength={2}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Modalidade</Text>
          <View style={styles.modalityRow}>
            {Object.keys(MODALITY_LABELS).map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.modalityChip, modality === key && styles.modalityChipActive]}
                onPress={() => setModality(key)}
              >
                <Text style={[styles.modalityChipText, modality === key && styles.modalityChipTextActive]}>{MODALITY_LABELS[key]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={confirmDetectedCity}>
              <Text style={styles.primaryBtnText}>Sim, quero atuar aqui</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={useDifferentCity}>
              <Text style={styles.secondaryBtnText}>Quero escolher outra cidade</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!!confirmedCity && !!confirmedState && (
          <View style={styles.phaseCard}>
            <Text style={styles.phaseTitle}>Regularizacao em {formatCityState(confirmedCity, confirmedState)}</Text>

            {loadingMunicipal ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>Consultando exigencias municipais...</Text>
              </View>
            ) : (
              <>
                {!requirementsData?.hasRegulation && (
                  <>
                    <View style={styles.requirementSummaryRow}>
                      <Text style={styles.requirementSummaryTitle}>Sua cidade nao exige autorizacao municipal</Text>
                    </View>
                    <Text style={styles.phaseText}>Nenhuma exigencia municipal adicional cadastrada para esta cidade no momento.</Text>
                  </>
                )}

                {requirementsData?.hasRegulation && (
                  <>
                    <View style={styles.requirementSummaryRow}>
                      <Text style={styles.requirementSummaryTitle}>
                        {requiresCityApproval ? 'Sua cidade exige autorizacao municipal: Sim' : 'Sua cidade nao exige autorizacao municipal'}
                      </Text>
                    </View>

                    <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}> 
                      <Text style={[styles.statusPillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>

                    {requiresConfirmationMessage ? (
                      <Text style={styles.warningText}>{requiresConfirmationMessage}</Text>
                    ) : null}

                    <View style={styles.infoBox}>
                      <Text style={styles.infoTitle}>Analise do Cadastro KAVIAR (interna)</Text>
                      <Text style={styles.helperText}>A KAVIAR confere cadastro e documentos da plataforma antes de qualquer envio externo.</Text>
                    </View>

                    <View style={styles.infoBox}>
                      <Text style={styles.infoTitle}>Regularizacao Municipal (Prefeitura/Orgao municipal)</Text>
                      <Text style={styles.helperText}>
                        Quando exigida, a liberacao para operar nesta cidade depende de protocolo e aprovacao municipal.
                      </Text>
                    </View>

                    <View style={styles.progressBox}>
                      <Text style={styles.progressLabel}>Checklist municipal</Text>
                      <Text style={styles.progressValue}>{checklistProgress.done}/{checklistProgress.total} requisitos com documento enviado</Text>
                    </View>

                    {(requirementsData.requirements || []).map(renderRequirementRow)}

                    <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(driver)/documents')}>
                      <Text style={styles.primaryBtnText}>Enviar documentos no cadastro KAVIAR</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.finishBtn} onPress={() => router.replace('/(driver)/documents')}>
          <Text style={styles.finishBtnText}>Continuar cadastro</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Prominent Disclosure - localização para regularização municipal */}
      <Modal
        visible={showLocationDisclosure}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationDisclosure(false)}
      >
        <View style={styles.locationDisclosureOverlay}>
          <View style={styles.locationDisclosureCard}>
            <Ionicons name="location-outline" size={36} color={COLORS.primary} />

            <Text style={styles.locationDisclosureTitle}>
              Uso da sua localização
            </Text>

            <Text style={styles.locationDisclosureText}>
              O KAVIAR Motorista coleta sua localização precisa para identificar sua cidade e verificar as exigências de regularização municipal aplicáveis ao seu território de atuação.{'\n\n'}
              Ao tocar em "Concordo e continuar", o Android solicitará sua permissão para acessar a localização.
            </Text>

            <View style={styles.locationDisclosureActions}>
              <TouchableOpacity
                style={[styles.locationDisclosureButton, styles.locationDisclosureSecondary]}
                onPress={() => setShowLocationDisclosure(false)}
                accessibilityRole="button"
                accessibilityLabel="Agora não"
              >
                <Text style={styles.locationDisclosureSecondaryText}>Agora não</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.locationDisclosureButton, styles.locationDisclosurePrimary]}
                onPress={() => {
                  setShowLocationDisclosure(false);
                  void detectWithCurrentLocation();
                }}
                accessibilityRole="button"
                accessibilityLabel="Concordo e continuar"
              >
                <Text style={styles.locationDisclosurePrimaryText}>Concordo e continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  locationDisclosureOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  locationDisclosureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  locationDisclosureTitle: {
    marginTop: 12,
    marginBottom: 12,
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  locationDisclosureText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4B5563',
  },
  locationDisclosureActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  locationDisclosureButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationDisclosureSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  locationDisclosurePrimary: {
    backgroundColor: COLORS.primary,
  },
  locationDisclosureSecondaryText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  locationDisclosurePrimaryText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: 12 },
  phaseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  phaseTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 6 },
  phaseText: { fontSize: 14, color: '#4B5563', lineHeight: 20 },
  label: { marginTop: 10, marginBottom: 6, fontSize: 13, fontWeight: '700', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  modalityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  modalityChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  modalityChipActive: { borderColor: COLORS.primary, backgroundColor: '#ECFDF5' },
  modalityChipText: { color: '#374151', fontSize: 13, fontWeight: '600' },
  modalityChipTextActive: { color: '#065F46' },
  buttonRow: { marginTop: 10, gap: 8 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#111827', fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: { color: '#374151', fontSize: 14, fontWeight: '700' },
  finishBtn: {
    marginTop: 6,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  finishBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  loadingText: { marginLeft: 8, color: '#6B7280', fontSize: 13 },
  errorText: { marginTop: 8, color: '#B91C1C', fontSize: 13, lineHeight: 18 },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    marginTop: 4,
  },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  progressBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  progressLabel: { fontSize: 12, fontWeight: '700', color: '#374151' },
  progressValue: { fontSize: 13, color: '#111827', marginTop: 2 },
  requirementRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  reqOk: { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' },
  reqPending: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  requirementLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  requirementDesc: { fontSize: 12, color: '#4B5563', marginTop: 2, lineHeight: 16 },
  requirementDocType: { fontSize: 12, color: '#374151', marginTop: 3 },
  requirementPendingText: { fontSize: 12, color: '#9A3412', marginTop: 2 },
  helperText: { fontSize: 13, color: '#374151', lineHeight: 18, marginBottom: 8 },
  warningText: { fontSize: 13, color: '#92400E', lineHeight: 18, marginBottom: 8, fontWeight: '600' },
  requirementSummaryRow: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  requirementSummaryTitle: { fontSize: 13, fontWeight: '800', color: '#111827' },
  infoBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  infoTitle: { fontSize: 12, fontWeight: '800', color: '#111827', marginBottom: 4 },
});
