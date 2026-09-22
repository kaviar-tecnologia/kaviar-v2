#!/bin/bash
set -e

echo "🔧 HOTFIX RDS: Adicionar coluna drivers.available"
echo "=================================================="

DB_HOST="kaviar-prod-db.cxuuaq46o1o5.us-east-2.rds.amazonaws.com"
DB_USER="kaviaradmin"
DB_PASS="${DB_PASS:?set DB_PASS env}"
DB_NAME="kaviar"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}?sslmode=require"

# Verificar se docker existe
if command -v docker &> /dev/null; then
    echo "✅ Docker encontrado"
    
    # Testar conexão
    echo "1️⃣ Testando conexão..."
    docker run --rm postgres:15-alpine psql "$DATABASE_URL" -c "SELECT 1 AS test;" || exit 1
    echo "✅ Conexão OK"
    
    # Adicionar coluna
    echo ""
    echo "2️⃣ Adicionando coluna drivers.available..."
    docker run --rm postgres:15-alpine psql "$DATABASE_URL" -c \
      "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT true;"
    echo "✅ Coluna adicionada"
    
    # Verificar
    echo ""
    echo "3️⃣ Verificando coluna..."
    docker run --rm postgres:15-alpine psql "$DATABASE_URL" -c \
      "SELECT column_name, data_type, column_default 
       FROM information_schema.columns 
       WHERE table_name='drivers' AND column_name='available';"
    
else
    echo "⚠️  Docker não encontrado, instalando postgresql client..."
    
    # Detectar OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    fi
    
    if [ "$OS" = "amzn" ]; then
        # Amazon Linux 2023
        sudo dnf install -y postgresql15 || sudo yum install -y postgresql
    else
        sudo apt-get update && sudo apt-get install -y postgresql-client
    fi
    
    # Testar conexão
    echo "1️⃣ Testando conexão..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 AS test;" || exit 1
    echo "✅ Conexão OK"
    
    # Adicionar coluna
    echo ""
    echo "2️⃣ Adicionando coluna drivers.available..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
      "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT true;"
    echo "✅ Coluna adicionada"
    
    # Verificar
    echo ""
    echo "3️⃣ Verificando coluna..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
      "SELECT column_name, data_type, column_default 
       FROM information_schema.columns 
       WHERE table_name='drivers' AND column_name='available';"
fi

echo ""
echo "=================================================="
echo "✅ HOTFIX CONCLUÍDO"
