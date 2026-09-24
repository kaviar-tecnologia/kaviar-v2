#!/bin/bash
# Deploy RBAC Backend to ECS
set -euo pipefail

source /home/goes/kaviar/aws-resources.env

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  DEPLOY RBAC BACKEND TO ECS                                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

cd /home/goes/kaviar

# 1. Build backend
echo "1️⃣ Building backend..."
cd backend
npm run build
cd ..

# 2. Build Docker image
echo ""
echo "2️⃣ Building Docker image..."
docker build -t kaviar-backend:rbac -f backend/Dockerfile backend/

# 3. Tag and push to ECR
echo ""
echo "3️⃣ Pushing to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URI

docker tag kaviar-backend:rbac $ECR_URI:rbac
docker tag kaviar-backend:rbac $ECR_URI:latest

docker push $ECR_URI:rbac
docker push $ECR_URI:latest

echo "   ✓ Images pushed: rbac, latest"

# 4. Update ECS service
echo ""
echo "4️⃣ Updating ECS service..."
aws ecs update-service \
  --cluster kaviar-cluster \
  --service kaviar-backend-service \
  --force-new-deployment \
  --region $AWS_REGION >/dev/null

echo "   ✓ Service updated, forcing new deployment"

# 5. Wait for deployment
echo ""
echo "5️⃣ Aguardando deployment..."
echo "   (pode levar 2-3 minutos)"

for i in {1..12}; do
  sleep 15
  RUNNING=$(aws ecs describe-services \
    --cluster kaviar-cluster \
    --services kaviar-backend-service \
    --region $AWS_REGION \
    --query 'services[0].runningCount' \
    --output text)
  
  DESIRED=$(aws ecs describe-services \
    --cluster kaviar-cluster \
    --services kaviar-backend-service \
    --region $AWS_REGION \
    --query 'services[0].desiredCount' \
    --output text)
  
  echo "   ${i}. Running: $RUNNING/$DESIRED"
  
  if [ "$RUNNING" = "$DESIRED" ] && [ "$RUNNING" -gt 0 ]; then
    echo "   ✓ Deployment completo"
    break
  fi
done

# 6. Verificar health
echo ""
echo "6️⃣ Verificando health..."
sleep 10

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$ALB_DNS/api/health")

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✓ Backend respondendo: HTTP $HTTP_CODE"
else
  echo "   ⚠️  Backend retornou: HTTP $HTTP_CODE"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  DEPLOY CONCLUÍDO                                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🚀 Backend RBAC deployed"
echo "   Image: $ECR_URI:rbac"
echo "   Service: kaviar-backend-service"
echo ""
echo "ℹ️ Seed RBAC legado foi desativado por segurança."
echo "   Não execute scripts de seed de contas em produção."
echo ""
