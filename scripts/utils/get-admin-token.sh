#!/bin/bash
# Script para obter token de admin

API_URL="${1:-${API_URL:-http://localhost:3003}}"
EMAIL="${2:-${ADMIN_EMAIL:-admin@kaviar.com}}"
PASSWORD="${3:-${ADMIN_PASSWORD:-}}"

if [ -z "$PASSWORD" ]; then
  echo "❌ Informe a senha por argumento ou pela variável ADMIN_PASSWORD"
  echo ""
  echo "Exemplos:"
  echo "  ADMIN_PASSWORD='sua-senha' $0"
  echo "  $0 http://localhost:3003 admin@kaviar.com 'sua-senha'"
  exit 1
fi

echo "🔑 Obtendo token de admin..."
echo "API: $API_URL"
echo "Email: $EMAIL"
echo ""

RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  "$API_URL/api/admin/login")

TOKEN=$(echo "$RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Erro ao obter token"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "✅ Token obtido com sucesso!"
echo ""
echo "export ADMIN_TOKEN='$TOKEN'"
echo ""
echo "Para usar:"
echo "  export ADMIN_TOKEN='$TOKEN'"
