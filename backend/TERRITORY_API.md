# 📡 API: Sistema de Território Inteligente

**Versão:** 1.0.0  
**Data:** 2026-02-05

---

## 🎯 VISÃO GERAL

APIs para gerenciamento de território inteligente com detecção GPS, validação automática e sistema de badges.

---

## 📍 ENDPOINTS

### **1. Lista Inteligente de Bairros**

```http
GET /api/neighborhoods/smart-list
```

**Query Parameters:**
- `lat` (optional): Latitude GPS
- `lng` (optional): Longitude GPS

**Response 200:**
```json
{
  "success": true,
  "data": {
    "currentLocation": {
      "lat": -22.9881,
      "lng": -43.2492
    },
    "detected": {
      "id": "uuid",
      "name": "Copacabana",
      "distance": 0,
      "hasGeofence": true,
      "minFee": 7,
      "maxFee": 20
    },
    "nearby": [
      {
        "id": "uuid",
        "name": "Ipanema",
        "distance": 2300,
        "hasGeofence": true,
        "minFee": 7,
        "maxFee": 20
      },
      {
        "id": "uuid",
        "name": "Rocinha",
        "distance": 3100,
        "hasGeofence": false,
        "minFee": 12,
        "maxFee": 20
      }
    ],
    "all": [
      {
        "id": "uuid",
        "name": "Copacabana",
        "zone": "Zona Sul",
        "hasGeofence": true,
        "minFee": 7,
        "maxFee": 20
      }
    ]
  }
}
```

**Lógica:**
1. Se `lat` e `lng` fornecidos:
   - Tenta detectar bairro via PostGIS (geofence oficial)
   - Se encontrou → retorna em `detected`
   - Se não encontrou → busca 10 bairros mais próximos em `nearby`
2. Sempre retorna lista completa de bairros ativos em `all`

---

### **2. Cadastro de Motorista (Modificado)**

```http
POST /api/governance/driver
```

**Body:**
```json
{
  "name": "João Silva",
  "email": "joao@example.com",
  "phone": "+5521999999999",
  "password": "senha123",
  "neighborhoodId": "uuid",
  "communityId": "uuid",  // opcional
  "lat": -22.9881,  // NOVO (opcional)
  "lng": -43.2492,  // NOVO (opcional)
  "verificationMethod": "GPS_AUTO"  // NOVO (opcional): GPS_AUTO | MANUAL_SELECTION
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "João Silva",
    "email": "joao@example.com",
    "phone": "+5521999999999",
    "status": "pending",
    "territoryType": "OFFICIAL",  // NOVO: OFFICIAL | FALLBACK_800M | MANUAL
    "territoryWarning": null  // NOVO: objeto se distância > 20km
  }
}
```

**Response 201 (com warning):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Maria Santos",
    "email": "maria@example.com",
    "status": "pending",
    "territoryType": "FALLBACK_800M",
    "territoryWarning": {
      "distance": 25000,
      "message": "Você está a 25.0km de Rocinha. Confirme se este é realmente seu bairro."
    }
  }
}
```

**Validações:**
1. ✅ Email único
2. ✅ `neighborhoodId` existe no banco
3. ✅ `neighborhoodId` está ativo (`is_active = true`)
4. ⚠️ Se GPS fornecido: distância < 20km (warning, não bloqueia)

**Lógica de Territory Type:**
```typescript
if (neighborhood.neighborhood_geofences) {
  territoryType = 'OFFICIAL'  // Tem geofence PostGIS
} else {
  territoryType = 'FALLBACK_800M'  // Sem geofence, usa raio 800m
}
```

**Campos Persistidos:**
- `territory_type`: OFFICIAL | FALLBACK_800M | MANUAL
- `territory_verified_at`: timestamp atual
- `territory_verification_method`: GPS_AUTO | MANUAL_SELECTION
- `virtual_fence_center_lat`: lat do GPS (apenas se FALLBACK_800M)
- `virtual_fence_center_lng`: lng do GPS (apenas se FALLBACK_800M)

---

### **3. Verificar Território**

```http
POST /api/drivers/me/verify-territory
Authorization: Bearer <token>
```

**Body:**
```json
{
  "neighborhoodId": "uuid",
  "lat": -22.9881,
  "lng": -43.2492,
  "verificationMethod": "GPS_AUTO"  // GPS_AUTO | MANUAL_SELECTION
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "territoryType": "FALLBACK_800M",
    "warning": false,
    "distance": 1250
  }
}
```

**Response 200 (com warning):**
```json
{
  "success": true,
  "data": {
    "territoryType": "OFFICIAL",
    "warning": true,
    "message": "Você está a 22.5km de Copacabana. Tem certeza que este é seu bairro?",
    "distance": 22500
  }
}
```

**Response 400:**
```json
{
  "success": false,
  "error": "Bairro não encontrado ou sem coordenadas"
}
```

**Uso:**
- Motorista pode atualizar seu território a qualquer momento
- Sistema valida distância e atualiza `territory_type`
- Se FALLBACK_800M, salva centro da cerca virtual

---

### **4. Estatísticas de Território**

```http
GET /api/drivers/me/territory-stats
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalTrips": 45,
      "insideTerritoryRate": 65,  // %
      "avgFee": 14.5,  // %
      "potentialSavings": 180  // R$ por semana
    },
    "breakdown": {
      "inside": 29,  // 7% ou 12%
      "adjacent": 8,  // 12%
      "outside": 8  // 20%
    },
    "weekly": [
      {
        "week": "2026-02-03",
        "totalTrips": 12,
        "insideRate": 75,
        "avgFee": 12.5
      },
      {
        "week": "2026-01-27",
        "totalTrips": 15,
        "insideRate": 60,
        "avgFee": 15.2
      }
    ]
  }
}
```

**Período:** Últimas 4 semanas

**Cálculos:**
- `insideTerritoryRate`: (inside / totalTrips) * 100
- `avgFee`: média ponderada de platform_fee_percentage
- `potentialSavings`: diferença entre taxa atual e taxa mínima possível

---

### **5. Badges e Conquistas**

```http
GET /api/drivers/me/badges
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "unlocked": [
      {
        "code": "local_hero",
        "name": "Herói Local",
        "description": "80% das corridas no seu território",
        "icon": "🏆",
        "threshold": 80,
        "benefit": "Destaque no app para passageiros locais",
        "unlocked": true,
        "unlockedAt": "2026-02-01T10:00:00Z",
        "progress": 100
      }
    ],
    "progress": [
      {
        "code": "territory_master",
        "name": "Mestre do Território",
        "description": "90% das corridas com taxa de 7% ou 12%",
        "icon": "⭐",
        "threshold": 90,
        "benefit": "Prioridade em corridas do seu bairro",
        "unlocked": false,
        "progress": 75
      },
      {
        "code": "community_champion",
        "name": "Campeão da Comunidade",
        "description": "100 corridas completadas no seu território",
        "icon": "👑",
        "threshold": 100,
        "benefit": "Badge especial no perfil",
        "unlocked": false,
        "progress": 45
      },
      {
        "code": "efficiency_expert",
        "name": "Expert em Eficiência",
        "description": "Taxa média abaixo de 10%",
        "icon": "💎",
        "threshold": 10,
        "benefit": "Economia máxima garantida",
        "unlocked": false,
        "progress": 60
      },
      {
        "code": "consistent_performer",
        "name": "Desempenho Consistente",
        "description": "4 semanas seguidas com 70%+ no território",
        "icon": "🔥",
        "threshold": 4,
        "benefit": "Bônus de consistência",
        "unlocked": false,
        "progress": 50
      }
    ],
    "newBadges": ["local_hero"],  // Badges desbloqueados nesta chamada
    "recommendation": {
      "icon": "⚠️",
      "title": "Oportunidade de Economia",
      "message": "Você está fazendo 35% das corridas fora do seu território. Foque em corridas próximas à Rocinha para reduzir sua taxa média de 14.5% para 12%.",
      "potentialSavings": "R$ 180/semana",
      "type": "warning"  // info | warning | success | tip
    }
  }
}
```

**Lógica:**
1. Sistema calcula progresso de todos os 5 badges
2. Se algum badge atingiu threshold → desbloqueia automaticamente
3. Retorna badges desbloqueados em `unlocked`
4. Retorna progresso de todos em `progress`
5. Gera recomendação personalizada baseada em estatísticas

---

### **6. Dashboard do Motorista (Modificado)**

```http
GET /api/drivers/:driverId/dashboard?period=30
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2026-01-06T00:00:00Z",
      "endDate": "2026-02-05T00:00:00Z"
    },
    "driver": {
      "id": "uuid",
      "name": "João Silva",
      "homeNeighborhood": {
        "id": "uuid",
        "name": "Rocinha",
        "city": "Rio de Janeiro"
      }
    },
    "territoryInfo": {  // NOVO
      "type": "FALLBACK_800M",
      "neighborhood": {
        "id": "uuid",
        "name": "Rocinha",
        "city": "Rio de Janeiro"
      },
      "hasOfficialMap": false,
      "virtualRadius": 800,
      "minFee": 12,
      "maxFee": 20,
      "message": "Seu território usa cerca virtual de 800m. Faça corridas próximas para manter taxa de 12%.",
      "verifiedAt": "2026-02-05T09:00:00Z"
    },
    "summary": {
      "totalTrips": 45,
      "totalFare": "4500.00",
      "totalEarnings": "3825.00",
      "avgFeePercentage": "14.5"
    },
    "comparison": {
      "kaviar": {
        "fee": "675.00",
        "percentage": "14.5"
      },
      "uber": {
        "fee": "1125.00",
        "percentage": "25"
      },
      "savings": {
        "amount": "450.00",
        "percentage": "10.0",
        "message": "Você economizou R$ 450.00 vs Uber!"
      }
    },
    "matchBreakdown": {
      "sameNeighborhood": {
        "count": 29,
        "percentage": "64.4",
        "fee": "7%"
      },
      "adjacentNeighborhood": {
        "count": 8,
        "percentage": "17.8",
        "fee": "12%"
      },
      "outsideFence": {
        "count": 8,
        "percentage": "17.8",
        "fee": "20%"
      }
    },
    "fenceStatus": {
      "active": true,
      "neighborhood": {
        "id": "uuid",
        "name": "Rocinha",
        "city": "Rio de Janeiro"
      },
      "inNeighborhoodRate": "64.4%",
      "recommendation": "Ótimo! Você está aproveitando bem sua cerca virtual."
    },
    "badges": [  // NOVO (top 3 desbloqueados)
      {
        "code": "local_hero",
        "name": "Herói Local",
        "icon": "🏆",
        "unlocked": true,
        "unlockedAt": "2026-02-01T10:00:00Z"
      }
    ],
    "recommendation": {  // NOVO
      "icon": "👍",
      "title": "Bom Trabalho",
      "message": "Você está no caminho certo! Continue focando em corridas do seu território.",
      "type": "success"
    },
    "recentTrips": [
      {
        "id": "uuid",
        "fare": "100.00",
        "fee": "12%",
        "matchType": "FALLBACK_800M",
        "date": "2026-02-05T08:30:00Z"
      }
    ]
  }
}
```

---

## 🔐 AUTENTICAÇÃO

Endpoints `/api/drivers/me/*` requerem token JWT:

```http
Authorization: Bearer <token>
```

Token obtido via:
```http
POST /api/auth/driver/login
```

---

## 📊 TIPOS DE TERRITÓRIO

| Tipo | Geofence | Taxa Mínima | Taxa Máxima | Descrição |
|------|----------|-------------|-------------|-----------|
| `OFFICIAL` | ✅ Sim | 7% | 20% | Bairro com mapa oficial PostGIS |
| `FALLBACK_800M` | ❌ Não | 12% | 20% | Comunidade sem mapa (raio 800m) |
| `MANUAL` | ❌ Não | 12% | 20% | Escolha manual sem GPS |
| `NULL` | ❌ Não | 20% | 20% | Não configurado (penalizado) |

---

## 🏆 BADGES DISPONÍVEIS

| Código | Nome | Threshold | Cálculo |
|--------|------|-----------|---------|
| `local_hero` | Herói Local | 80% | (inside / total) * 100 |
| `territory_master` | Mestre do Território | 90% | ((inside + adjacent) / total) * 100 |
| `community_champion` | Campeão da Comunidade | 100 | inside_trips |
| `efficiency_expert` | Expert em Eficiência | 10% | 100 - (avgFee * 10) |
| `consistent_performer` | Desempenho Consistente | 4 | weeks_with_70%+ |

---

## 🔄 FLUXO DE DADOS

### **Cadastro → Território**
```
1. POST /api/governance/driver
   ├─ Valida neighborhoodId (existe + ativo)
   ├─ Detecta territory_type (geofence?)
   ├─ Valida distância GPS (< 20km)
   └─ Salva driver com território

2. Driver criado com:
   ├─ territory_type: OFFICIAL | FALLBACK_800M
   ├─ territory_verified_at: NOW()
   ├─ territory_verification_method: GPS_AUTO | MANUAL
   └─ virtual_fence_center_lat/lng (se FALLBACK)
```

### **Corrida → Estatísticas**
```
1. Corrida completada
   └─ Trigger: update_territory_stats()

2. Atualiza driver_territory_stats:
   ├─ total_trips++
   ├─ inside_territory_trips++ (se match_type = SAME/FALLBACK)
   ├─ adjacent_territory_trips++ (se match_type = ADJACENT)
   ├─ outside_territory_trips++ (se match_type = OUTSIDE)
   └─ avg_fee_percentage (média ponderada)

3. GET /api/drivers/me/badges
   ├─ Calcula progresso de badges
   ├─ Desbloqueia se threshold atingido
   └─ Gera recomendação personalizada
```

---

## ⚠️ ERROS COMUNS

### **400 Bad Request**
```json
{
  "success": false,
  "error": "Bairro não encontrado"
}
```

### **401 Unauthorized**
```json
{
  "success": false,
  "error": "Não autenticado"
}
```

### **409 Conflict**
```json
{
  "success": false,
  "error": "Email já cadastrado"
}
```

### **500 Internal Server Error**
```json
{
  "success": false,
  "error": "Erro ao buscar lista de bairros"
}
```

---

## 📝 NOTAS

1. **GPS Opcional:** Cadastro funciona sem GPS, mas recomenda-se fornecer para melhor experiência
2. **Validação de Distância:** Warning em 20km, não bloqueia cadastro
3. **Badges Automáticos:** Desbloqueio acontece automaticamente ao atingir threshold
4. **Estatísticas em Tempo Real:** Trigger atualiza a cada corrida completada
5. **Período de Análise:** Badges e estatísticas consideram últimas 4 semanas

---

**Versão:** 1.0.0 | **Última Atualização:** 2026-02-05
