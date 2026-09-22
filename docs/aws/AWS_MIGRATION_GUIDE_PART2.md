# 🚀 Migração Kaviar: Render → AWS (Parte 2)

## 📋 FASE 5: ECS + Docker (2-3 horas)

### 5.1 Criar Dockerfile para Backend

```dockerfile
# /home/goes/kaviar/backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache openssl

# Copiar package files
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências
RUN npm ci --only=production

# Copiar código
COPY . .

# Gerar Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Expor porta
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3003/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start
CMD ["npm", "run", "start:3003"]
```

### 5.2 Criar ECR Repository e Push da Imagem

```bash
source aws-resources.env

# Criar repositório ECR
aws ecr create-repository \
  --repository-name kaviar-backend \
  --region us-east-2

# Obter URI do repositório
ECR_URI=$(aws ecr describe-repositories \
  --repository-names kaviar-backend \
  --region us-east-2 \
  --query 'repositories[0].repositoryUri' \
  --output text)

echo "ECR_URI=$ECR_URI" >> aws-resources.env

# Login no ECR
aws ecr get-login-password --region us-east-2 | \
  docker login --username AWS --password-stdin $ECR_URI

# Build e push da imagem
cd /home/goes/kaviar/backend
docker build -t kaviar-backend .
docker tag kaviar-backend:latest $ECR_URI:latest
docker push $ECR_URI:latest

echo "✅ Imagem Docker enviada para ECR: $ECR_URI:latest"
```

### 5.3 Criar ECS Cluster

```bash
# Criar cluster ECS (Fargate)
aws ecs create-cluster \
  --cluster-name kaviar-cluster \
  --region us-east-2

echo "✅ ECS Cluster criado: kaviar-cluster"
```

### 5.4 Criar IAM Role para ECS Tasks

```bash
# Role para Task Execution (pull de imagens ECR, logs CloudWatch)
cat > ecs-task-execution-role-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name kaviarEcsTaskExecutionRole \
  --assume-role-policy-document file://ecs-task-execution-role-trust.json

aws iam attach-role-policy \
  --role-name kaviarEcsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Role para Task (acesso S3, SQS, etc)
cat > ecs-task-role-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name kaviarEcsTaskRole \
  --assume-role-policy-document file://ecs-task-role-trust.json

# Policy para S3
cat > ecs-task-s3-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::$S3_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::$S3_BUCKET"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name kaviarEcsTaskRole \
  --policy-name KaviarS3Access \
  --policy-document file://ecs-task-s3-policy.json

TASK_EXECUTION_ROLE_ARN=$(aws iam get-role --role-name kaviarEcsTaskExecutionRole --query 'Role.Arn' --output text)
TASK_ROLE_ARN=$(aws iam get-role --role-name kaviarEcsTaskRole --query 'Role.Arn' --output text)

echo "TASK_EXECUTION_ROLE_ARN=$TASK_EXECUTION_ROLE_ARN" >> aws-resources.env
echo "TASK_ROLE_ARN=$TASK_ROLE_ARN" >> aws-resources.env
```

### 5.5 Criar CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/kaviar-backend \
  --region us-east-2

aws logs put-retention-policy \
  --log-group-name /ecs/kaviar-backend \
  --retention-in-days 7 \
  --region us-east-2
```

### 5.6 Criar Task Definition

```bash
source aws-resources.env

cat > ecs-task-definition.json <<EOF
{
  "family": "kaviar-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "$TASK_EXECUTION_ROLE_ARN",
  "taskRoleArn": "$TASK_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "kaviar-backend",
      "image": "$ECR_URI:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3003,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "3003"},
        {"name": "DATABASE_URL", "value": "$DATABASE_URL"},
        {"name": "REDIS_URL", "value": "redis://$REDIS_ENDPOINT:6379"},
        {"name": "AWS_S3_BUCKET", "value": "$S3_BUCKET"},
        {"name": "AWS_REGION", "value": "us-east-2"},
        {"name": "JWT_SECRET", "value": "$JWT_SECRET"},
        {"name": "ENABLE_TWILIO_WHATSAPP", "value": "true"},
        {"name": "ENABLE_PREMIUM_TOURISM", "value": "true"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/kaviar-backend",
          "awslogs-region": "us-east-2",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3003/api/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json \
  --region us-east-2

echo "✅ Task Definition registrada: kaviar-backend"
```

---

## 📋 FASE 6: Application Load Balancer (1 hora)

### 6.1 Criar Security Groups

```bash
source aws-resources.env

# Security Group para ALB (público)
SG_ALB=$(aws ec2 create-security-group \
  --group-name kaviar-alb-sg \
  --description "Security group for Kaviar ALB" \
  --vpc-id $VPC_ID \
  --region us-east-2 \
  --query 'GroupId' --output text)

# Permitir HTTP (80) e HTTPS (443)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ALB \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region us-east-2

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ALB \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --region us-east-2

# Security Group para ECS Tasks
SG_ECS=$(aws ec2 create-security-group \
  --group-name kaviar-ecs-sg \
  --description "Security group for Kaviar ECS Tasks" \
  --vpc-id $VPC_ID \
  --region us-east-2 \
  --query 'GroupId' --output text)

# Permitir tráfego do ALB para ECS (porta 3003)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ECS \
  --protocol tcp \
  --port 3003 \
  --source-group $SG_ALB \
  --region us-east-2

echo "SG_ALB=$SG_ALB" >> aws-resources.env
echo "SG_ECS=$SG_ECS" >> aws-resources.env
```

### 6.2 Criar ALB

```bash
# Criar ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name kaviar-alb \
  --subnets $SUBNET_PUBLIC_A $SUBNET_PUBLIC_B \
  --security-groups $SG_ALB \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region us-east-2 \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

# Obter DNS do ALB
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region us-east-2 \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

echo "ALB_ARN=$ALB_ARN" >> aws-resources.env
echo "ALB_DNS=$ALB_DNS" >> aws-resources.env
echo "✅ ALB criado: $ALB_DNS"
```

### 6.3 Criar Target Group

```bash
TG_ARN=$(aws elbv2 create-target-group \
  --name kaviar-backend-tg \
  --protocol HTTP \
  --port 3003 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-enabled \
  --health-check-protocol HTTP \
  --health-check-path /api/health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region us-east-2 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

echo "TG_ARN=$TG_ARN" >> aws-resources.env
```

### 6.4 Criar Listener

```bash
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --region us-east-2

echo "✅ Listener HTTP:80 criado"
```

---

## 📋 FASE 7: ECS Service (30 minutos)

```bash
source aws-resources.env

# Criar ECS Service
aws ecs create-service \
  --cluster kaviar-cluster \
  --service-name kaviar-backend-service \
  --task-definition kaviar-backend \
  --desired-count 2 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_PUBLIC_A,$SUBNET_PUBLIC_B],securityGroups=[$SG_ECS],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=kaviar-backend,containerPort=3003" \
  --health-check-grace-period-seconds 60 \
  --region us-east-2

echo "⏳ Aguardando service ficar estável (2-3 minutos)..."
aws ecs wait services-stable \
  --cluster kaviar-cluster \
  --services kaviar-backend-service \
  --region us-east-2

echo "✅ ECS Service criado e estável"
```

---

## 📋 FASE 8: Validação e Testes (30 minutos)

```bash
source aws-resources.env

echo "🧪 TESTANDO INFRAESTRUTURA AWS"
echo "================================"
echo ""

# 1. Health Check
echo "1️⃣ Health Check:"
curl -i "http://$ALB_DNS/api/health"
echo ""

# 2. Login Admin
echo "2️⃣ Login Admin:"
TOKEN=$(curl -s -X POST "http://$ALB_DNS/api/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | jq -r '.token')

echo "Token: ${TOKEN:0:50}..."
echo ""

# 3. Listar Motoristas
echo "3️⃣ Listar Motoristas:"
curl -s "http://$ALB_DNS/api/admin/drivers" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
echo ""

# 4. Verificar Logs
echo "4️⃣ CloudWatch Logs:"
aws logs tail /ecs/kaviar-backend --follow --region us-east-2
```

---

**Continua na Parte 3 (Frontend + SQS + Otimizações)...**
