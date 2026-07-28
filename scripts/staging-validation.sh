#!/bin/bash
# Script de Deploy e Validação em Staging
# Unificação do Onboarding de Motorista
# Data: 2026-03-09

set -e

echo "🚀 Iniciando deploy e validação em staging..."
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuração do banco de dados
DB_URL="${STAGING_DB:-$DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo -e "${RED}❌ Erro: Nenhuma conexão de banco configurada${NC}"
  echo ""
  echo "Defina uma das variáveis de ambiente:"
  echo "  export STAGING_DB='postgresql://user:pass@host:5432/db'"
  echo "  ou"
  echo "  export DATABASE_URL='postgresql://user:pass@host:5432/db'"
  echo ""
  exit 1
fi

# Validar se não é placeholder
if echo "$DB_URL" | grep -qE "staging-db|user:pass|localhost|127.0.0.1"; then
  echo -e "${RED}❌ Erro: URL de banco contém placeholder ou localhost${NC}"
  echo "URL detectada: ${DB_URL:0:50}..."
  echo ""
  echo "Use uma URL real de staging/produção."
  exit 1
fi

echo -e "${GREEN}✓${NC} Usando banco: ${DB_URL:0:50}..."
echo ""

# Configuração da API
STAGING_API="${STAGING_API:-http://localhost:3001}"
echo -e "${GREEN}✓${NC} Usando API: $STAGING_API"
echo ""

# ============================================
# 1. EXECUTAR MIGRATION
# ============================================
echo "📦 1. Executando migration de normalização..."
psql "$DB_URL" < backend/prisma/migrations/20260309_normalize_drivers.sql

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Migration executada com sucesso${NC}"
else
  echo -e "${RED}❌ Erro ao executar migration${NC}"
  exit 1
fi

echo ""

# ============================================
# 2. TESTAR CADASTRO VIA APP
# ============================================
echo "📱 2. Testando cadastro via app..."

# Buscar um neighborhood real
NEIGHBORHOOD_ID=$(psql "$DB_URL" -t -c "SELECT id FROM neighborhoods WHERE is_active = true LIMIT 1;" | xargs)

if [ -z "$NEIGHBORHOOD_ID" ]; then
  echo -e "${RED}❌ Nenhum neighborhood ativo encontrado${NC}"
  exit 1
fi

echo "   Usando neighborhood: $NEIGHBORHOOD_ID"

# Buscar uma community real
COMMUNITY_ID=$(psql "$DB_URL" -t -c "SELECT id FROM communities WHERE neighborhood_id = '$NEIGHBORHOOD_ID' LIMIT 1;" | xargs)

if [ -z "$COMMUNITY_ID" ]; then
  echo -e "${YELLOW}⚠️  Nenhuma community encontrada, continuando sem community${NC}"
fi

# Cadastro via app
APP_RESPONSE=$(curl -s -X POST "$STAGING_API/api/auth/driver/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"João App Staging $(date +%s)\",
    \"email\": \"joao.app.staging.$(date +%s)@test.com\",
    \"phone\": \"+5521999999999\",
    \"password\": \"senha123\",
    \"document_cpf\": \"12345678901\",
    \"vehicle_color\": \"Branco\",
    \"vehicle_model\": \"Gol\",
    \"vehicle_plate\": \"ABC1234\",
    \"accepted_terms\": true,
    \"neighborhoodId\": \"$NEIGHBORHOOD_ID\",
    \"communityId\": \"$COMMUNITY_ID\",
    \"lat\": -22.9068,
    \"lng\": -43.1729,
    \"verificationMethod\": \"GPS_AUTO\"
  }")

echo "   Resposta: $APP_RESPONSE"

# Validar resposta
APP_SUCCESS=$(echo "$APP_RESPONSE" | jq -r '.success')
APP_TOKEN=$(echo "$APP_RESPONSE" | jq -r '.token')
APP_DRIVER_ID=$(echo "$APP_RESPONSE" | jq -r '.user.id')

if [ "$APP_SUCCESS" = "true" ] && [ -n "$APP_TOKEN" ]; then
  echo -e "${GREEN}✅ Cadastro via app bem-sucedido${NC}"
  echo "   Driver ID: $APP_DRIVER_ID"
  echo "   Token: ${APP_TOKEN:0:20}..."
else
  echo -e "${RED}❌ Erro no cadastro via app${NC}"
  exit 1
fi

echo ""

# ============================================
# 3. TESTAR CADASTRO VIA WEB
# ============================================
echo "🌐 3. Testando cadastro via web..."

WEB_RESPONSE=$(curl -s -X POST "$STAGING_API/api/driver/onboarding" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Maria Web Staging $(date +%s)\",
    \"email\": \"maria.web.staging.$(date +%s)@test.com\",
    \"phone\": \"+5521988888888\",
    \"password\": \"senha123\",
    \"document_cpf\": \"98765432100\",
    \"vehicle_color\": \"Preto\",
    \"vehicle_model\": \"Uno\",
    \"vehicle_plate\": \"XYZ9876\",
    \"accepted_terms\": true,
    \"neighborhoodId\": \"$NEIGHBORHOOD_ID\",
    \"communityId\": \"$COMMUNITY_ID\"
  }")

echo "   Resposta: $WEB_RESPONSE"

# Validar resposta
WEB_SUCCESS=$(echo "$WEB_RESPONSE" | jq -r '.success')
WEB_TOKEN=$(echo "$WEB_RESPONSE" | jq -r '.token')
WEB_DRIVER_ID=$(echo "$WEB_RESPONSE" | jq -r '.data.id')

if [ "$WEB_SUCCESS" = "true" ] && [ -n "$WEB_TOKEN" ]; then
  echo -e "${GREEN}✅ Cadastro via web bem-sucedido${NC}"
  echo "   Driver ID: $WEB_DRIVER_ID"
  echo "   Token: ${WEB_TOKEN:0:20}..."
else
  echo -e "${RED}❌ Erro no cadastro via web${NC}"
  exit 1
fi

echo ""

# ============================================
# 4. VALIDAR REGISTROS AUXILIARES
# ============================================
echo "🔍 4. Validando registros auxiliares..."

# Validar driver do app
echo "   Validando driver do app ($APP_DRIVER_ID)..."
APP_VALIDATION=$(psql "$DB_URL" -t -c "
  SELECT 
    d.id,
    d.document_cpf IS NOT NULL as has_cpf,
    d.vehicle_color IS NOT NULL as has_vehicle,
    d.territory_type IS NOT NULL as has_territory,
    d.territory_verification_method,
    c.type as consent_type,
    dv.status as verification_status
  FROM drivers d
  LEFT JOIN consents c ON c.user_id = d.id AND c.type = 'lgpd'
  LEFT JOIN driver_verifications dv ON dv.driver_id = d.id
  WHERE d.id = '$APP_DRIVER_ID';
")

echo "$APP_VALIDATION"

# Validar driver da web
echo "   Validando driver da web ($WEB_DRIVER_ID)..."
WEB_VALIDATION=$(psql "$DB_URL" -t -c "
  SELECT 
    d.id,
    d.document_cpf IS NOT NULL as has_cpf,
    d.vehicle_color IS NOT NULL as has_vehicle,
    d.territory_type IS NOT NULL as has_territory,
    d.territory_verification_method,
    c.type as consent_type,
    dv.status as verification_status
  FROM drivers d
  LEFT JOIN consents c ON c.user_id = d.id AND c.type = 'lgpd'
  LEFT JOIN driver_verifications dv ON dv.driver_id = d.id
  WHERE d.id = '$WEB_DRIVER_ID';
")

echo "$WEB_VALIDATION"

# Verificar se todos os registros foram criados
APP_HAS_CONSENT=$(echo "$APP_VALIDATION" | grep -c "lgpd" || true)
APP_HAS_VERIFICATION=$(echo "$APP_VALIDATION" | grep -c "PENDING" || true)

WEB_HAS_CONSENT=$(echo "$WEB_VALIDATION" | grep -c "lgpd" || true)
WEB_HAS_VERIFICATION=$(echo "$WEB_VALIDATION" | grep -c "PENDING" || true)

if [ "$APP_HAS_CONSENT" -gt 0 ] && [ "$APP_HAS_VERIFICATION" -gt 0 ]; then
  echo -e "${GREEN}✅ Registros auxiliares do app criados corretamente${NC}"
else
  echo -e "${RED}❌ Registros auxiliares do app incompletos${NC}"
  exit 1
fi

if [ "$WEB_HAS_CONSENT" -gt 0 ] && [ "$WEB_HAS_VERIFICATION" -gt 0 ]; then
  echo -e "${GREEN}✅ Registros auxiliares da web criados corretamente${NC}"
else
  echo -e "${RED}❌ Registros auxiliares da web incompletos${NC}"
  exit 1
fi

echo ""

# ============================================
# 5. VALIDAR CAMPOS OBRIGATÓRIOS
# ============================================
echo "📋 5. Validando campos obrigatórios..."

# App
APP_CPF=$(psql "$DB_URL" -t -c "SELECT document_cpf FROM drivers WHERE id = '$APP_DRIVER_ID';" | xargs)
APP_VEHICLE=$(psql "$DB_URL" -t -c "SELECT vehicle_color FROM drivers WHERE id = '$APP_DRIVER_ID';" | xargs)
APP_TERRITORY=$(psql "$DB_URL" -t -c "SELECT territory_type FROM drivers WHERE id = '$APP_DRIVER_ID';" | xargs)
APP_VERIFICATION_METHOD=$(psql "$DB_URL" -t -c "SELECT territory_verification_method FROM drivers WHERE id = '$APP_DRIVER_ID';" | xargs)

echo "   App:"
echo "     CPF: $APP_CPF"
echo "     Veículo: $APP_VEHICLE"
echo "     Território: $APP_TERRITORY"
echo "     Método: $APP_VERIFICATION_METHOD"

if [ -n "$APP_CPF" ] && [ -n "$APP_VEHICLE" ] && [ -n "$APP_TERRITORY" ] && [ -n "$APP_VERIFICATION_METHOD" ]; then
  echo -e "${GREEN}✅ Campos obrigatórios do app preenchidos${NC}"
else
  echo -e "${RED}❌ Campos obrigatórios do app faltando${NC}"
  exit 1
fi

# Web
WEB_CPF=$(psql "$DB_URL" -t -c "SELECT document_cpf FROM drivers WHERE id = '$WEB_DRIVER_ID';" | xargs)
WEB_VEHICLE=$(psql "$DB_URL" -t -c "SELECT vehicle_color FROM drivers WHERE id = '$WEB_DRIVER_ID';" | xargs)
WEB_TERRITORY=$(psql "$DB_URL" -t -c "SELECT territory_type FROM drivers WHERE id = '$WEB_DRIVER_ID';" | xargs)
WEB_VERIFICATION_METHOD=$(psql "$DB_URL" -t -c "SELECT territory_verification_method FROM drivers WHERE id = '$WEB_DRIVER_ID';" | xargs)

echo "   Web:"
echo "     CPF: $WEB_CPF"
echo "     Veículo: $WEB_VEHICLE"
echo "     Território: $WEB_TERRITORY"
echo "     Método: $WEB_VERIFICATION_METHOD"

if [ -n "$WEB_CPF" ] && [ -n "$WEB_VEHICLE" ] && [ -n "$WEB_TERRITORY" ] && [ -n "$WEB_VERIFICATION_METHOD" ]; then
  echo -e "${GREEN}✅ Campos obrigatórios da web preenchidos${NC}"
else
  echo -e "${RED}❌ Campos obrigatórios da web faltando${NC}"
  exit 1
fi

echo ""

# ============================================
# 6. RESUMO FINAL
# ============================================
echo "📊 RESUMO FINAL"
echo "==============="
echo ""
echo -e "${GREEN}✅ Migration executada${NC}"
echo -e "${GREEN}✅ Cadastro via app funcionando${NC}"
echo -e "${GREEN}✅ Cadastro via web funcionando${NC}"
echo -e "${GREEN}✅ Consents LGPD criados${NC}"
echo -e "${GREEN}✅ Driver verifications criados${NC}"
echo -e "${GREEN}✅ Campos obrigatórios preenchidos${NC}"
echo -e "${GREEN}✅ territory_verification_method presente${NC}"
echo ""
echo -e "${GREEN}🎉 VALIDAÇÃO EM STAGING COMPLETA!${NC}"
echo ""
echo "Drivers criados para teste:"
echo "  App: $APP_DRIVER_ID"
echo "  Web: $WEB_DRIVER_ID"
echo ""
echo "Próximos passos:"
echo "  1. Testar fluxo completo (documentos → aprovação → online)"
echo "  2. Monitorar logs por 24-48h"
echo "  3. Planejar deploy em produção"
