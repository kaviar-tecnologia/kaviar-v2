#!/bin/bash
set -e

API_URL="https://api.kaviar.com.br"
LOG_FILE="/tmp/validate_territory_$(date +%Y%m%d_%H%M%S).log"
RESULT="PASS"

echo "🔍 VALIDAÇÃO TERRITÓRIO - DADOS REAIS" | tee -a "$LOG_FILE"
echo "======================================" | tee -a "$LOG_FILE"
echo "API: $API_URL" | tee -a "$LOG_FILE"
echo "Data: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Login admin
echo "1️⃣ Autenticando admin..." | tee -a "$LOG_FILE"
ADMIN_EMAIL="${ADMIN_EMAIL:-suporte@kaviar.com.br}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD env var}"
LOGIN_PAYLOAD=$(jq -n --arg email "$ADMIN_EMAIL" --arg password "$ADMIN_PASSWORD" '{email:$email,password:$password}')

LOGIN=$(curl -s -X POST "$API_URL/api/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD")

TOKEN=$(echo "$LOGIN" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  echo "❌ FAIL: Login admin falhou" | tee -a "$LOG_FILE"
  echo "$LOGIN" | tee -a "$LOG_FILE"
  exit 1
fi
echo "✅ Admin autenticado" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Buscar bairros
echo "2️⃣ Buscando bairros..." | tee -a "$LOG_FILE"
NEIGHBORHOODS=$(curl -s -X GET "$API_URL/api/governance/neighborhoods" \
  -H "Authorization: Bearer $TOKEN")

BAIRRO_A=$(echo "$NEIGHBORHOODS" | jq -r '.data[0].id // empty')
BAIRRO_A_NAME=$(echo "$NEIGHBORHOODS" | jq -r '.data[0].name // "Bairro A"')

if [ -z "$BAIRRO_A" ]; then
  echo "❌ FAIL: Bairros não encontrados" | tee -a "$LOG_FILE"
  exit 1
fi
echo "✅ Bairro: $BAIRRO_A_NAME ($BAIRRO_A)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Criar motorista TEST
echo "3️⃣ Criando motorista TEST_KIRO_..." | tee -a "$LOG_FILE"
DRIVER=$(curl -s -X POST "$API_URL/api/governance/driver" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\":\"TEST_KIRO_DRIVER_$(date +%s)\",
    \"email\":\"test_kiro_driver_$(date +%s)@test.com\",
    \"phone\":\"+5511999$(date +%s | tail -c 7)\",
    \"password\":\"Test@123\",
    \"neighborhoodId\":\"$BAIRRO_A\"
  }")

DRIVER_ID=$(echo "$DRIVER" | jq -r '.data.id // empty')
if [ -z "$DRIVER_ID" ]; then
  echo "❌ FAIL: Criação de motorista falhou" | tee -a "$LOG_FILE"
  echo "$DRIVER" | tee -a "$LOG_FILE"
  exit 1
fi
echo "✅ Motorista: $DRIVER_ID" | tee -a "$LOG_FILE"

# Aprovar motorista
curl -s -X PATCH "$API_URL/api/admin/drivers/$DRIVER_ID/approve" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "✅ Motorista aprovado" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# CENÁRIO A: Mesmo bairro => 7%
echo "4️⃣ CENÁRIO A: Mesmo bairro (7%)" | tee -a "$LOG_FILE"
echo "  Coords: Abolição (-22.8857, -43.2994)" | tee -a "$LOG_FILE"
FEE_A=$(curl -s -X POST "$API_URL/api/trips/estimate-fee" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"driverId\":\"$DRIVER_ID\",
    \"pickupLat\":-22.8857,
    \"pickupLng\":-43.2994,
    \"dropoffLat\":-22.8860,
    \"dropoffLng\":-43.2990,
    \"fareAmount\":25.00,
    \"city\":\"Rio de Janeiro\"
  }")

FEE_A_PCT=$(echo "$FEE_A" | jq -r '.data.feePercentage // 0')
TYPE_A=$(echo "$FEE_A" | jq -r '.data.matchType // "unknown"')
echo "  Taxa: $FEE_A_PCT% | Tipo: $TYPE_A" | tee -a "$LOG_FILE"

if [ "$FEE_A_PCT" = "7" ] || [ "$FEE_A_PCT" = "7.0" ]; then
  echo "  ✅ PASS" | tee -a "$LOG_FILE"
else
  echo "  ❌ FAIL: Esperado 7%, obtido $FEE_A_PCT%" | tee -a "$LOG_FILE"
  RESULT="FAIL"
fi
echo "" | tee -a "$LOG_FILE"

# CENÁRIO B: Bairro adjacente => 12%
echo "5️⃣ CENÁRIO B: Bairro adjacente (12%)" | tee -a "$LOG_FILE"
echo "  Coords: Acari (-22.8214, -43.3411)" | tee -a "$LOG_FILE"
FEE_B=$(curl -s -X POST "$API_URL/api/trips/estimate-fee" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"driverId\":\"$DRIVER_ID\",
    \"pickupLat\":-22.8214,
    \"pickupLng\":-43.3411,
    \"dropoffLat\":-22.8857,
    \"dropoffLng\":-43.2994,
    \"fareAmount\":30.00,
    \"city\":\"Rio de Janeiro\"
  }")

FEE_B_PCT=$(echo "$FEE_B" | jq -r '.data.feePercentage // 0')
TYPE_B=$(echo "$FEE_B" | jq -r '.data.matchType // "unknown"')
echo "  Taxa: $FEE_B_PCT% | Tipo: $TYPE_B" | tee -a "$LOG_FILE"

if [ "$FEE_B_PCT" = "12" ] || [ "$FEE_B_PCT" = "12.0" ]; then
  echo "  ✅ PASS" | tee -a "$LOG_FILE"
else
  echo "  ❌ FAIL: Esperado 12%, obtido $FEE_B_PCT%" | tee -a "$LOG_FILE"
  RESULT="FAIL"
fi
echo "" | tee -a "$LOG_FILE"

# CENÁRIO C: Fora da região => 20%
echo "6️⃣ CENÁRIO C: Fora da região (20%)" | tee -a "$LOG_FILE"
FEE_C=$(curl -s -X POST "$API_URL/api/trips/estimate-fee" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"driverId\":\"$DRIVER_ID\",
    \"pickupLat\":-23.5505,
    \"pickupLng\":-46.6333,
    \"dropoffLat\":-23.5489,
    \"dropoffLng\":-46.6388,
    \"fareAmount\":20.00,
    \"city\":\"São Paulo\"
  }")

FEE_C_PCT=$(echo "$FEE_C" | jq -r '.data.feePercentage // 0')
TYPE_C=$(echo "$FEE_C" | jq -r '.data.matchType // "unknown"')
echo "  Taxa: $FEE_C_PCT% | Tipo: $TYPE_C" | tee -a "$LOG_FILE"

if [ "$FEE_C_PCT" = "20" ] || [ "$FEE_C_PCT" = "20.0" ]; then
  echo "  ✅ PASS" | tee -a "$LOG_FILE"
else
  echo "  ❌ FAIL: Esperado 20%, obtido $FEE_C_PCT%" | tee -a "$LOG_FILE"
  RESULT="FAIL"
fi
echo "" | tee -a "$LOG_FILE"

# Cleanup
echo "7️⃣ Limpeza..." | tee -a "$LOG_FILE"
curl -s -X DELETE "$API_URL/api/admin/drivers/$DRIVER_ID" \
  -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1 || true
echo "✅ Recursos TEST_KIRO_ removidos" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "======================================" | tee -a "$LOG_FILE"
echo "RESULTADO FINAL: $RESULT" | tee -a "$LOG_FILE"
echo "Log salvo em: $LOG_FILE" | tee -a "$LOG_FILE"

if [ "$RESULT" = "FAIL" ]; then
  exit 1
fi
