import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Indicador discreto do Selo Excelência KAVIAR para passageiros.
 * Exibe apenas quando sealActive=true; não mostra métricas ou critérios.
 *
 * Uso: incluir na tela de corrida ativa quando o motorista atribuído possuir o selo.
 * O estado `sealActive` deve vir do backend junto com os dados do motorista da corrida.
 */
export function DriverExcellenceIndicator({ sealActive }: { sealActive: boolean }) {
  if (!sealActive) return null;

  return (
    <View style={s.container}>
      <Ionicons name="trophy" size={14} color="#B8942E" />
      <Text style={s.text}>Excelência KAVIAR</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#B8942E15', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { color: '#B8942E', fontSize: 11, fontWeight: '500', marginLeft: 4 },
});
