import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../config/colors';
import { ScheduleSelector } from './ScheduleSelector';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Place { text: string; lat: number; lng: number; placeId: string }
interface PostWaitDest { lat: number; lng: number; text: string }
type ScheduleOption = 'now' | '15min' | '30min' | 'custom';

// Maps service keys to friendly labels shown in the confirmation summary
const SERVICE_LABELS: Record<string, string> = {
  car: '🚗 Carro KAVIAR',
  moto_passenger: '🏍 Moto Passageiro',
  care_assisted: '🧓 CARE / Acompanhamento',
};

interface Props {
  origin: Place | null;
  destination: Place | null;
  onSearchOrigin: () => void;
  onSearchDestination: () => void;
  estimate: { price: number; distance_km: number; wait_charge_estimate?: number | null } | null;
  estimateLoading: boolean;
  passengerCount: number;
  onPassengerChange: (n: number) => void;
  hasLuggage: boolean;
  onLuggageToggle: () => void;
  waitEstimatedMin: number | null;
  onWaitChange: (min: number | null) => void;
  postWaitDest: PostWaitDest | null;
  onPostWaitClear: () => void;
  onPostWaitSearch: () => void;
  scheduleOption: ScheduleOption;
  onScheduleChange: (opt: ScheduleOption) => void;
  customTime: Date | null;
  scheduleLabel: string;
  loading: boolean;
  onSubmit: () => void;
  onStepChange?: (step: number) => void;
  preferWomanDriver?: boolean;
  /** Service selected in step 1 — shown as a summary row in step 2 */
  selectedService?: string | null;
}

const STEPS = ['Destino', 'Serviço', 'Confirmar'] as const;

export function RideWizard(props: Props & { step: number }) {
  const step = props.step;
  const setStep = (s: number) => props.onStepChange?.(s);

  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggle = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSection(prev => prev === key ? null : key);
  };

  // Step 0 → 1 requires destination; step 1 → 2 is handled externally by ServiceSelector
  const canAdvance = () => step === 0 ? !!props.destination : true;
  const next = () => { if (canAdvance() && step < 2) setStep(step + 1); };
  const back = () => { if (step > 0) setStep(step - 1); };

  const detailsSummary = `${props.passengerCount} passageiro${props.passengerCount > 1 ? 's' : ''}${props.hasLuggage ? ' · Bagagem' : ''}`;
  const waitSummary = props.waitEstimatedMin ? `${props.waitEstimatedMin} min${props.postWaitDest ? ' + destino' : ''}` : 'Sem espera';
  const serviceLabel = props.selectedService ? (SERVICE_LABELS[props.selectedService] ?? props.selectedService) : null;

  return (
    <View style={s.container}>
      {/* Progress dots */}
      <View style={s.progress}>
        {STEPS.map((label, i) => (
          <View key={label} style={s.progressItem}>
            <View style={[s.progressDot, i <= step && s.progressDotActive]} />
            <Text style={[s.progressLabel, i <= step && s.progressLabelActive]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Step 0 — Destination */}
      {step === 0 && (
        <View>
          <Text style={s.stepTitle}>Para onde você vai?</Text>
          <TouchableOpacity style={s.addressRow} onPress={props.onSearchOrigin}>
            <View style={[s.dot, { backgroundColor: COLORS.success }]} />
            <View style={s.addressInfo}>
              <Text style={s.addressLabel}>EMBARQUE</Text>
              <Text style={s.addressText} numberOfLines={1}>{props.origin?.text || 'Obtendo localização...'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.addressRow, { borderBottomWidth: 0 }]} onPress={props.onSearchDestination}>
            <View style={[s.dot, { backgroundColor: COLORS.danger }]} />
            <View style={s.addressInfo}>
              <Text style={s.addressLabel}>DESTINO</Text>
              <Text style={[s.addressText, !props.destination && { color: COLORS.textMuted }]} numberOfLines={1}>
                {props.destination?.text || 'Toque para buscar endereço'}
              </Text>
            </View>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          {props.estimate && (
            <View style={s.estimateRow}>
              <Text style={s.estimateText}>~{props.estimate.distance_km.toFixed(1)} km</Text>
              <Text style={s.estimatePrice}>R$ {props.estimate.price.toFixed(2)}</Text>
            </View>
          )}
          {props.estimateLoading && !props.estimate && props.destination && (
            <Text style={s.estimateLoading}>Calculando estimativa...</Text>
          )}
        </View>
      )}

      {/* Step 1 — Service selector is rendered externally in map.tsx.
          This step renders nothing inside the wizard itself; the wizard
          is hidden while ServiceSelector is shown. Kept as a placeholder
          so the progress indicator advances correctly. */}
      {step === 1 && null}

      {/* Step 2 — Summary + collapsible options */}
      {step === 2 && (
        <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
          <Text style={s.stepTitle}>Confirme sua corrida</Text>

          {/* Route summary */}
          <View style={s.summaryBlock}>
            <SummaryRow icon="📍" label="Embarque" value={props.origin?.text || '—'} />
            <SummaryRow icon="🏁" label={props.waitEstimatedMin ? 'Parada' : 'Destino'} value={props.destination?.text || '—'} />
            {serviceLabel && (
              <SummaryRow icon="🛎️" label="Serviço" value={serviceLabel} />
            )}
            {props.waitEstimatedMin != null && (
              <SummaryRow icon="⏳" label="Espera" value={`~${props.waitEstimatedMin} min`} />
            )}
            {props.postWaitDest && (
              <SummaryRow icon="📍" label="Após espera" value={props.postWaitDest.text} accent />
            )}
          </View>

          {/* Price */}
          {props.estimate && (
            <View style={s.summaryPrice}>
              {props.estimate.wait_charge_estimate ? (
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Rota completa</Text>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }}>R$ {props.estimate.price.toFixed(2)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Espera estimada (~{props.waitEstimatedMin} min)</Text>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }}>+ R$ {props.estimate.wait_charge_estimate.toFixed(2)}</Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 6 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Total estimado</Text>
                    <Text style={{ color: COLORS.primary, fontSize: 22, fontWeight: '800' }}>R$ {(props.estimate.price + props.estimate.wait_charge_estimate).toFixed(2)}</Text>
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4 }}>A espera será cobrada pelo tempo real.</Text>
                </View>
              ) : (
                <>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Estimativa</Text>
                  <Text style={{ color: COLORS.primary, fontSize: 22, fontWeight: '800' }}>R$ {props.estimate.price.toFixed(2)}</Text>
                </>
              )}
            </View>
          )}

          {/* Collapsible: Details */}
          <TouchableOpacity style={s.sectionHeader} onPress={() => toggle('details')} activeOpacity={0.7}>
            <Text style={s.sectionTitle}>👥 {detailsSummary}</Text>
            <Ionicons name={expandedSection === 'details' ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          {expandedSection === 'details' && (
            <View style={s.sectionBody}>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>Passageiros</Text>
                <View style={s.counter}>
                  <TouchableOpacity onPress={() => props.onPassengerChange(Math.max(1, props.passengerCount - 1))} style={s.counterBtn}><Text style={s.counterBtnText}>−</Text></TouchableOpacity>
                  <Text style={s.counterValue}>{props.passengerCount}</Text>
                  <TouchableOpacity onPress={() => props.onPassengerChange(Math.min(4, props.passengerCount + 1))} style={s.counterBtn}><Text style={s.counterBtnText}>+</Text></TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={s.detailRow} onPress={props.onLuggageToggle} activeOpacity={0.7}>
                <Text style={s.detailLabel}>🧳 Bagagem</Text>
                <View style={[s.toggle, props.hasLuggage && s.toggleOn]}>
                  <Text style={s.toggleText}>{props.hasLuggage ? 'Sim' : 'Não'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Collapsible: Wait */}
          <TouchableOpacity style={s.sectionHeader} onPress={() => toggle('wait')} activeOpacity={0.7}>
            <Text style={s.sectionTitle}>⏳ {waitSummary}</Text>
            <Ionicons name={expandedSection === 'wait' ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          {expandedSection === 'wait' && (
            <View style={s.sectionBody}>
              <View style={s.waitGrid}>
                {[null, 10, 20, 30, 45, 60].map(min => (
                  <TouchableOpacity
                    key={String(min)}
                    onPress={() => props.onWaitChange(min)}
                    activeOpacity={0.7}
                    style={[s.waitChip, props.waitEstimatedMin === min && s.waitChipActive]}
                  >
                    <Text style={s.waitChipText}>{min === null ? 'Não' : `${min} min`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {props.waitEstimatedMin !== null && (
                <View style={{ marginTop: 12 }}>
                  <Text style={s.detailLabel}>Depois da espera, vai para outro destino?</Text>
                  {props.postWaitDest ? (
                    <View style={s.postWaitCard}>
                      <View style={[s.dot, { backgroundColor: '#1565c0' }]} />
                      <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14 }} numberOfLines={1}>{props.postWaitDest.text}</Text>
                      <TouchableOpacity onPress={props.onPostWaitClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[s.addressRow, { borderBottomWidth: 0, backgroundColor: COLORS.surfaceLight, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 }]}
                      onPress={props.onPostWaitSearch}
                      activeOpacity={0.7}
                    >
                      <View style={[s.dot, { backgroundColor: COLORS.textMuted }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, color: COLORS.textMuted }}>Para onde depois da espera?</Text>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Toque para buscar ou deixe vazio</Text>
                      </View>
                      <Ionicons name="search" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  )}
                  {props.postWaitDest && (
                    <Text style={{ fontSize: 12, color: '#2e7d32', marginTop: 8, fontWeight: '600' }}>
                      ✓ Valor incluirá ida + trecho após espera + tempo de espera
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Schedule — always visible */}
          <ScheduleSelector
            scheduleOption={props.scheduleOption}
            onOptionChange={props.onScheduleChange}
            customTime={props.customTime}
          />

          {props.preferWomanDriver && (
            <View style={s.womenNote}>
              <Text style={s.womenNoteTitle}>🛡️ Preferência por motorista mulher ativa</Text>
              <Text style={s.womenNoteText}>Vamos priorizar uma motorista mulher quando disponível. Se não houver, outro motorista poderá atender você.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Navigation — only shown on step 0 and step 2.
          Step 1 (ServiceSelector) manages its own navigation via onSelect callbacks. */}
      {step !== 1 && (
        <View style={s.nav}>
          {step > 0 ? (
            <TouchableOpacity style={s.navBack} onPress={back}>
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
              <Text style={s.navBackText}>Voltar</Text>
            </TouchableOpacity>
          ) : <View />}
          {step === 0 ? (
            <TouchableOpacity
              style={[s.navNext, !canAdvance() && s.navNextDisabled]}
              onPress={next}
              disabled={!canAdvance()}
              activeOpacity={0.7}
            >
              <Text style={s.navNextText}>Continuar</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.textDark} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.navSubmit, props.loading && { opacity: 0.6 }]}
              onPress={props.onSubmit}
              disabled={props.loading || (props.scheduleOption === 'custom' && !props.customTime)}
              activeOpacity={0.7}
            >
              <Text style={s.navSubmitText}>
                {props.loading ? 'Solicitando...' : props.scheduleOption === 'now' ? 'Pedir KAVIAR' : `Agendar para ${props.scheduleLabel}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function SummaryRow({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.summaryRow}>
      <Text style={{ fontSize: 14, width: 24 }}>{icon}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, accent && { color: '#1565c0' }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 10,
  },
  progress: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressItem: { alignItems: 'center', flex: 1 },
  progressDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border, marginBottom: 2 },
  progressDotActive: { backgroundColor: COLORS.primary },
  progressLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600' },
  progressLabelActive: { color: COLORS.primary },
  stepTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10 },

  addressRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  addressInfo: { flex: 1 },
  addressLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 2 },
  addressText: { fontSize: 15, color: COLORS.textPrimary },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: COLORS.border },
  estimateText: { fontSize: 13, color: COLORS.textSecondary },
  estimatePrice: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  estimateLoading: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 12 },

  // Collapsible sections
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  sectionBody: { paddingBottom: 4 },

  // Details
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailLabel: { fontSize: 15, color: COLORS.textPrimary },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counterBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  counterBtnText: { fontSize: 20, fontWeight: '600', color: COLORS.textPrimary },
  counterValue: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, minWidth: 24, textAlign: 'center' },
  toggle: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  toggleOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },

  // Wait
  waitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  waitChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border },
  waitChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  waitChipText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  postWaitCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#1565c0' },

  // Summary
  summaryBlock: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  summaryLabel: { fontSize: 12, color: COLORS.textMuted, width: 80 },
  summaryValue: { flex: 1, fontSize: 14, color: COLORS.textPrimary, fontWeight: '500' },
  summaryPrice: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },

  // Navigation
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 8 },
  navBackText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  navNext: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  navNextDisabled: { opacity: 0.4 },
  navNextText: { fontSize: 15, fontWeight: '700', color: COLORS.textDark },
  navSubmit: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginLeft: 12 },
  navSubmitText: { fontSize: 17, fontWeight: '800', color: COLORS.textDark },

  // Women preference note
  womenNote: { backgroundColor: COLORS.surfaceLight, borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#B8942E40' },
  womenNoteTitle: { fontSize: 12, fontWeight: '700', color: '#B8942E', marginBottom: 4 },
  womenNoteText: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
});
