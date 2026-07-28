import { prisma } from '../lib/prisma';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { GeoResolveService } from './geo-resolve';

interface DriverRegistrationInput {
  // Obrigatórios
  name: string;
  email: string;
  phone: string;
  password: string;
  document_cpf: string;
  vehicle_color: string;
  accepted_terms: boolean;
  lat: number;
  lng: number;
  
  // Opcionais
  neighborhoodId?: string;
  neighborhoodName?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_type?: 'CAR' | 'MOTORCYCLE';
  communityId?: string;
  verificationMethod?: 'GPS_AUTO' | 'MANUAL_SELECTION';
  
  // Metadata
  ipAddress?: string;
  userAgent?: string;
}

interface DriverRegistrationResult {
  success: boolean;
  driver?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    neighborhood_id: string;
    community_id: string | null;
    territory_type: string | null;
    territory_verification_method: string | null;
    isPending: boolean;
  };
  token?: string;
  error?: string;
}

export class DriverRegistrationService {
  async register(input: DriverRegistrationInput): Promise<DriverRegistrationResult> {
    try {
      // 1. Validar phone não vazio
      if (!input.phone || input.phone.trim() === '') {
        return { success: false, error: 'Telefone é obrigatório' };
      }

      // 2. Validar email único
      const existing = await prisma.drivers.findUnique({
        where: { email: input.email }
      });
      
      if (existing) {
        return { success: false, error: 'Email já cadastrado' };
      }

      // 2b. Validar telefone único (se informado)
      if (input.phone) {
        const byPhone = await prisma.drivers.findFirst({ where: { phone: input.phone } });
        if (byPhone) {
          return { success: false, error: 'Telefone já cadastrado' };
        }
      }

      // 2c. Validar CPF único (se informado)
      if (input.document_cpf) {
        const byCpf = await prisma.drivers.findFirst({ where: { document_cpf: input.document_cpf } });
        if (byCpf) {
          return { success: false, error: 'CPF já cadastrado' };
        }
      }
      
      // 3. Resolver território via GPS (fonte primária) ou neighborhoodId (fallback)
      let resolvedNeighborhoodId = input.neighborhoodId;
      
      if (!resolvedNeighborhoodId) {
        const geoResolve = new GeoResolveService();
        const geoResult = await geoResolve.resolveCoordinates(input.lat, input.lng);
        if (geoResult.match && geoResult.resolvedArea) {
          resolvedNeighborhoodId = geoResult.resolvedArea.id;
          console.log(`[DriverRegistration] Geo-resolved: ${geoResult.resolvedArea.name} (${resolvedNeighborhoodId})`);
        }
      }

      // 3b. Fallback: buscar por nome digitado manualmente
      if (!resolvedNeighborhoodId && input.neighborhoodName) {
        const byName = await prisma.neighborhoods.findFirst({
          where: {
            is_active: true,
            name: { contains: input.neighborhoodName, mode: 'insensitive' },
          },
          select: { id: true, name: true },
        });
        if (byName) {
          resolvedNeighborhoodId = byName.id;
          console.log(`[DriverRegistration] Name-resolved: ${byName.name} (${byName.id})`);
        }
      }
      
      let neighborhood: any = null;
      if (resolvedNeighborhoodId) {
        neighborhood = await this.validateNeighborhood(resolvedNeighborhoodId);
      }
      
      // 4. Validar communityId (se fornecido)
      let validatedCommunityId: string | null = null;
      if (input.communityId && resolvedNeighborhoodId) {
        validatedCommunityId = await this.validateCommunity(
          input.communityId, 
          resolvedNeighborhoodId
        );
        if (!validatedCommunityId) {
          return { success: false, error: 'Comunidade inválida para este bairro' };
        }
      }
      
      // 5. Determinar territory_type e verification_method
      const { territoryType, verificationMethod } = await this.determineTerritoryInfo(
        neighborhood,
        input.lat,
        input.lng,
        input.verificationMethod
      );
      
      // 6. Hash password
      const password_hash = await bcrypt.hash(input.password, 10);
      
      // 7. Criar driver (transação)
      const driver = await prisma.$transaction(async (tx) => {
        // 7.1 Criar driver
        const newDriver = await tx.drivers.create({
          data: {
            id: `driver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: input.name,
            email: input.email,
            phone: input.phone,
            password_hash,
            status: 'pending',
            document_cpf: input.document_cpf,
            vehicle_color: input.vehicle_color,
            vehicle_model: input.vehicle_model || null,
            vehicle_plate: input.vehicle_plate || null,
            vehicle_type: input.vehicle_type || 'CAR',
            neighborhood_id: resolvedNeighborhoodId || null,
            community_id: validatedCommunityId,
            territory_type: territoryType,
            territory_verified_at: new Date(),
            territory_verification_method: verificationMethod,
            created_at: new Date(),
            updated_at: new Date()
          }
        });
        
        // 7.2 Criar consent LGPD
        await tx.consents.create({
          data: {
            id: `consent_${newDriver.id}_lgpd_${Date.now()}`,
            user_id: newDriver.id,
            subject_type: 'DRIVER',
            subject_id: newDriver.id,
            type: 'lgpd',
            accepted: true,
            accepted_at: new Date(),
            ip_address: input.ipAddress || null,
            user_agent: input.userAgent || null
          }
        });
        
        // 7.3 Criar driver_verification
        await tx.driver_verifications.create({
          data: {
            id: `verification_${newDriver.id}`,
            driver_id: newDriver.id,
            community_id: validatedCommunityId,
            status: 'PENDING',
            updated_at: new Date()
          }
        });
        
        return newDriver;
      });
      
      // 8. Gerar token
      const token = jwt.sign(
        {
          userId: driver.id,
          userType: 'DRIVER',
          email: driver.email,
          status: driver.status
        },
        process.env.JWT_SECRET!,
        { expiresIn: '72h' }
      );
      
      return {
        success: true,
        driver: {
          id: driver.id,
          name: driver.name,
          email: driver.email,
          phone: driver.phone ?? '',
          status: driver.status,
          neighborhood_id: driver.neighborhood_id ?? '',
          community_id: driver.community_id,
          territory_type: driver.territory_type,
          territory_verification_method: driver.territory_verification_method,
          isPending: true
        },
        token
      };
    } catch (error) {
      console.error('[DriverRegistrationService] Error:', error);
      return {
        success: false,
        error: 'Erro ao realizar cadastro'
      };
    }
  }
  
  private async validateNeighborhood(id: string) {
    return prisma.neighborhoods.findFirst({
      where: { id, is_active: true },
      include: { neighborhood_geofences: true }
    });
  }
  
  private async validateCommunity(communityIdOrSlug: string, _neighborhoodId: string): Promise<string | null> {
    // Validar por id ou name
    const community = await prisma.communities.findFirst({
      where: {
        OR: [
          { id: communityIdOrSlug },
          { name: communityIdOrSlug }
        ],
        is_active: true
      }
    });
    return community?.id || null;
  }
  
  private async determineTerritoryInfo(
    neighborhood: any, 
    lat?: number, 
    lng?: number,
    requestedMethod?: string
  ): Promise<{ territoryType: string; verificationMethod: string }> {
    if (!neighborhood) {
      return {
        territoryType: 'FALLBACK_800M',
        verificationMethod: requestedMethod || 'GPS_AUTO'
      };
    }

    const hasGeofence = !!neighborhood.neighborhood_geofences;
    
    // Se tem GPS e geofence, validar ponto
    if (lat && lng && hasGeofence) {
      const isInside = await this.checkPointInGeofence(
        lat, 
        lng, 
        [neighborhood.neighborhood_geofences]
      );
      
      return {
        territoryType: isInside ? 'OFFICIAL' : 'FALLBACK_800M',
        verificationMethod: requestedMethod || 'GPS_AUTO'
      };
    }
    
    // Sem GPS ou sem geofence
    return {
      territoryType: hasGeofence ? 'OFFICIAL' : 'FALLBACK_800M',
      verificationMethod: requestedMethod || 'MANUAL_SELECTION'
    };
  }
  
  private async checkPointInGeofence(
    lat: number, 
    lng: number, 
    geofences: any[]
  ): Promise<boolean> {
    // Implementação real de point-in-polygon usando ray casting
    for (const geofence of geofences) {
      if (!geofence.coordinates || !Array.isArray(geofence.coordinates)) {
        continue;
      }
      
      // GeoJSON Polygon: coordinates = [[[lng, lat], ...]]
      const ring = geofence.geofence_type === 'Polygon' ? geofence.coordinates[0] : geofence.coordinates;
      
      if (this.pointInPolygon(lat, lng, ring)) {
        return true;
      }
    }
    
    return false;
  }
  
  private pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
    // Ray casting algorithm
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1]; // lat
      const yi = polygon[i][0]; // lng
      const xj = polygon[j][1]; // lat
      const yj = polygon[j][0]; // lng
      
      const intersect = ((yi > lng) !== (yj > lng)) &&
        (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
}

export const driverRegistrationService = new DriverRegistrationService();
