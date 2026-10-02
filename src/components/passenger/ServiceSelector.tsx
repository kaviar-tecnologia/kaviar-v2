import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../config/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SelectableService = 'car' | 'moto_passenger' | 'care_assisted';

interface ServiceSelectorProps {
  /** Price estimate for CAR_NORMAL, already calculated */
  estimatePrice: number | null;
  /** Price estimate for MOTO_PASSENGER, already calculated */
  motoEstimatePrice: number | null;
  /** Whether Moto Passageiro is enabled by flag */
  motoAvailable: boolean;
  /** Optional custom message when Moto Passageiro is not selectable */
  motoUnavailableText?: string;
  /** Called only for selectable services (car, moto_passenger) */
  onSelect: (service: SelectableService) => void;
  /** Called when passenger chooses Corridas Compartilhadas */
  onSelectSharedRides: () => void;
  /** Currently highlighted service */
  selectedService: SelectableService;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(price: number) {
  return `R$ ${price.toFixed(2)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ActiveCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  price: string | null;
  ctaLabel: string;
  selected: boolean;
  onPress: () => void;
}

function ActiveCard({ icon, title, description, price, ctaLabel, selected, onPress }: ActiveCardProps) {
  return (
    <TouchableOpacity
      style={[s.card, selected && s.cardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={s.cardMain}>
        <View style={[s.iconWrap, selected && s.iconWrapSelected]}>
          {icon}
        </View>
        <View style={s.cardBody}>
          <Text style={[s.cardTitle, selected && s.cardTitleSelected]}>{title}</Text>
          <Text style={s.cardDesc} numberOfLines={2}>{description}</Text>
        </View>
        {price !== null && (
          <Text style={[s.cardPrice, selected && s.cardPriceSelected]}>{price}</Text>
        )}
      </View>
      <TouchableOpacity
        style={[s.ctaBtn, selected && s.ctaBtnSelected]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={[s.ctaText, selected && s.ctaTextSelected]}>{ctaLabel}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

interface DisabledCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  statusText: string;
  ctaLabel: string;
}

function DisabledCard({ icon, title, description, statusText, ctaLabel }: DisabledCardProps) {
  return (
    <View style={[s.card, s.cardDisabled]}>
      <View style={s.cardMain}>
        <View style={s.iconWrapDisabled}>
          {icon}
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardTitleDisabled}>{title}</Text>
          <Text style={s.cardDesc} numberOfLines={2}>{description}</Text>
        </View>
      </View>
      <View style={s.disabledStatus}>
        <Ionicons name="time-outline" size={12} color={COLORS.textMuted} style={{ marginRight: 4 }} />
        <Text style={s.disabledStatusText}>{statusText}</Text>
      </View>
      <View style={[s.ctaBtn, s.ctaBtnDisabled]}>
        <Text style={s.ctaTextDisabled}>{ctaLabel}</Text>
      </View>
    </View>
  );
}

interface SharedRidesCardProps {
  onPress: () => void;
}

function SharedRidesCard({ onPress }: SharedRidesCardProps) {
  return (
    <View style={s.card}>
      <View style={s.cardMain}>
        <View style={s.iconWrap}>
          <Ionicons name="repeat-outline" size={26} color={COLORS.primary} />
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardTitle}>Corridas Compartilhadas</Text>
          <Text style={s.cardDesc} numberOfLines={3}>
            Peça um convite a um motorista conhecido e participe de uma viagem recorrente compartilhada.
            O valor pode ser dividido entre os integrantes.
          </Text>
        </View>
      </View>
      <TouchableOpacity style={[s.ctaBtn, s.ctaBtnOutline]} onPress={onPress} activeOpacity={0.8}>
        <Ionicons name="ticket-outline" size={15} color={COLORS.primary} style={{ marginRight: 6 }} />
        <Text style={[s.ctaText, { color: COLORS.primary }]}>Tenho um convite</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ServiceSelector({
  estimatePrice,
  motoEstimatePrice,
  motoAvailable,
  motoUnavailableText,
  onSelect,
  onSelectSharedRides,
  selectedService,
}: ServiceSelectorProps) {
  return (
    <View style={s.wrapper}>
      <Text style={s.heading}>Escolha o serviço KAVIAR</Text>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* 1. Carro KAVIAR ─────────────────────────────────────────────── */}
        <ActiveCard
          icon={<Ionicons name="car-sport" size={26} color={selectedService === 'car' ? COLORS.primary : COLORS.textMuted} />}
          title="Carro KAVIAR"
          description="Corrida particular com motorista KAVIAR."
          price={estimatePrice !== null ? fmt(estimatePrice) : null}
          ctaLabel="Selecionar Carro"
          selected={selectedService === 'car'}
          onPress={() => onSelect('car')}
        />

        {/* 1B. CARE / Acompanhamento ───────────────────────────────────── */}
        <ActiveCard
          icon={<Ionicons name="heart-circle-outline" size={26} color={selectedService === 'care_assisted' ? COLORS.primary : COLORS.textMuted} />}
          title="CARE / Acompanhamento"
          description="Corrida em carro comum para consultas, compromissos e apoio não médico."
          price={estimatePrice !== null ? fmt(estimatePrice) : null}
          ctaLabel="Selecionar CARE"
          selected={selectedService === 'care_assisted'}
          onPress={() => onSelect('care_assisted')}
        />

        {/* 2. Moto Passageiro ──────────────────────────────────────────── */}
        {motoAvailable ? (
          <ActiveCard
            icon={<MaterialCommunityIcons name="motorbike" size={26} color={selectedService === 'moto_passenger' ? COLORS.primary : COLORS.textMuted} />}
            title="Moto Passageiro"
            description="Viagem de moto para passageiros, disponível conforme habilitação da cidade."
            price={motoEstimatePrice !== null ? fmt(motoEstimatePrice) : null}
            ctaLabel="Selecionar Moto"
            selected={selectedService === 'moto_passenger'}
            onPress={() => onSelect('moto_passenger')}
          />
        ) : (
          <DisabledCard
            icon={<MaterialCommunityIcons name="motorbike" size={26} color={COLORS.textMuted} />}
            title="Moto Passageiro"
            description="Viagem de moto para passageiros, disponível conforme habilitação da cidade."
            statusText={motoUnavailableText || 'Moto Passageiro ainda não está disponível na sua região.'}
            ctaLabel="Indisponível no momento"
          />
        )}

        {/* 3. Corridas Compartilhadas ──────────────────────────────────── */}
        <SharedRidesCard onPress={onSelectSharedRides} />

        {/* 4. Moto Entrega ─────────────────────────────────────────────── */}
        <DisabledCard
          icon={<MaterialCommunityIcons name="package-variant-closed" size={26} color={COLORS.textMuted} />}
          title="Moto Entrega"
          description="Envie documentos, pequenos itens ou encomendas leves com um motociclista KAVIAR."
          statusText="Em implantação na sua região."
          ctaLabel="Indisponível no momento"
        />

        {/* 5. KAVIAR Pet ───────────────────────────────────────────────── */}
        <DisabledCard
          icon={<Ionicons name="paw-outline" size={26} color={COLORS.textMuted} />}
          title="KAVIAR Pet"
          description="Atendimento para transporte com pet, realizado por operador habilitado."
          statusText="Disponível apenas em regiões com operador pet habilitado."
          ctaLabel="Indisponível no momento"
        />

        {/* 6. KAVIAR Care ──────────────────────────────────────────────── */}
        <DisabledCard
          icon={<Ionicons name="heart-outline" size={26} color={COLORS.textMuted} />}
          title="KAVIAR Care"
          description="Atendimento especial para quem precisa de mais cuidado no deslocamento."
          statusText="Em implantação."
          ctaLabel="Indisponível no momento"
        />

        {/* Bottom padding inside scroll */}
        <View style={{ height: 8 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  heading: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 380,
  },

  // Card base
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surfaceLight,
  },
  cardDisabled: {
    opacity: 0.55,
  },

  // Card main row
  cardMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  // Icon
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconWrapSelected: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}18`,
  },
  iconWrapDisabled: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  // Body
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 3,
  },
  cardTitleSelected: {
    color: COLORS.primary,
  },
  cardTitleDisabled: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginLeft: 8,
    marginTop: 2,
  },
  cardPriceSelected: {
    color: COLORS.primary,
  },

  // Disabled status row
  disabledStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  disabledStatusText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },

  // CTA button
  ctaBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  ctaBtnSelected: {
    backgroundColor: COLORS.primary,
  },
  ctaBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  ctaBtnDisabled: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  ctaTextSelected: {
    color: COLORS.textDark,
  },
  ctaTextDisabled: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
