import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authStore } from '../auth/auth.store';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.kaviar.com.br';

/**
 * Exibe o Selo Excelência KAVIAR no perfil do motorista quando ativo.
 * Não exibe métricas, critérios ou histórico — apenas o badge e uma frase.
 */
export function ExcellenceSealBadge() {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const user = authStore.getUser();
        if (!user?.id) return;
        const token = authStore.getToken();
        const res = await fetch(`${API_BASE}/api/v2/drivers/me/excellence-seal`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setActive(data?.data?.active === true);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    check();
  }, []);

  if (loading || !active) return null;

  return (
    <View style={s.container}>
      <Ionicons name="trophy" size={20} color="#B8942E" />
      <View style={s.textWrap}>
        <Text style={s.title}>Selo Excelência KAVIAR</Text>
        <Text style={s.subtitle}>Reconhecimento por qualidade e volume de atendimento</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 8, padding: 12, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: '#B8942E33' },
  textWrap: { marginLeft: 10, flex: 1 },
  title: { color: '#B8942E', fontSize: 14, fontWeight: '600' },
  subtitle: { color: '#999', fontSize: 12, marginTop: 2 },
});
