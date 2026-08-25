import { prisma } from '../../lib/prisma';
import { DriversQuery, PassengersQuery, RidesQuery, SuspendDriverData, CancelRideData, ReassignRideData, ForceCompleteRideData } from './schemas';
// import { /* CommunityActivationService */ } from '../../services/community-activation';
import { DriverVerificationService } from '../../services/driver-verification';
import { DriverEnforcementService } from '../../services/driver-enforcement';
import { config } from '../../config';

export class AdminService {
  // TODO: reativar quando CommunityActivationService voltar
  private communityActivation: any = null;
  private driver_verifications = new DriverVerificationService();
  private driverEnforcement = new DriverEnforcementService();
  // Drivers
  async getDrivers(query: DriversQuery) {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search, 
      dateFrom, 
      dateTo, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = query;
    
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at.gte = new Date(dateFrom);
      if (dateTo) where.created_at.lte = new Date(dateTo);
    }

    const [drivers, total] = await Promise.all([
      prisma.drivers.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          suspension_reason: true,
          suspended_at: true,
          last_active_at: true,
          document_cpf: true,
          vehicle_color: true,
          vehicle_model: true,
          vehicle_plate: true,
          created_at: true,
          _count: {
            select: { rides: true },
          },
        },
      }),
      prisma.drivers.count({ where }),
    ]);

    return {
      data: drivers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Aprovar motorista (validação obrigatória de compliance)
  async approveDriver(driver_id: string, admin_id = 'system') {
    return this.approveDriverWithGates(driver_id, admin_id);
  }

  // Validação obrigatória com gates (compliance)
  private async approveDriverWithGates(driver_id: string, admin_id: string) {
    // Validar elegibilidade obrigatoriamente
    const eligibility = await this.driver_verifications.evaluateEligibility(driver_id);
    
    if (!eligibility.isEligible) {
      const error = new Error('DRIVER_INCOMPLETE') as any;
      error.code = 'DRIVER_INCOMPLETE';
      error.message = 'Motorista possui documentos obrigatórios pendentes';
      error.missingRequirements = eligibility.missingRequirements;
      error.details = this.formatMissingRequirementsDetails(eligibility.missingRequirements);
      throw error;
    }

    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: { id: true, status: true, community_id: true }
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    if (driver.status !== 'pending' && driver.status !== 'needs_documents') {
      throw new Error('Apenas motoristas pendentes podem ser aprovados');
    }

    const updatedDriver = await prisma.$transaction(async (tx) => {
      // Update driver status
      const updated = await tx.drivers.update({
        where: { id: driver_id },
        data: { 
          status: 'approved',
          approved_at: new Date(),
          approved_by: admin_id,
          suspension_reason: null,
          suspended_at: null,
          suspended_by: null,
        }
      });

      // Update verification record
      await tx.driver_verifications.update({
        where: { driver_id },
        data: {
          status: 'APPROVED',
          approved_at: new Date(),
          approved_by_admin_id: admin_id
        }
      });

      // Populate photo_url if driver has a profile photo
      const profilePhoto = await tx.driver_documents.findFirst({
        where: { driver_id, type: 'PROFILE_PHOTO', status: { not: 'rejected' } },
        orderBy: { created_at: 'desc' },
        select: { file_url: true, document_url: true },
      });
      if (profilePhoto) {
        const url = profilePhoto.file_url || profilePhoto.document_url;
        if (url) await tx.drivers.update({ where: { id: driver_id }, data: { photo_url: url } });
      }

      return updated;
    });

    // Reavaliar ativação da comunidade após aprovação
    if (driver.community_id) {
      await this.communityActivation.evaluateCommunityActivation(driver.community_id, admin_id);
    }

    return updatedDriver;
  }

  private formatMissingRequirementsDetails(missingRequirements: string[]): Record<string, string> {
    const details: Record<string, string> = {};
    
    for (const requirement of missingRequirements) {
      switch (requirement) {
        case 'LGPD_CONSENT':
          details.lgpdConsent = 'Consentimento LGPD não aceito';
          break;
        case 'CPF':
          details.cpf = 'Documento CPF não verificado';
          break;
        case 'RG':
          details.rg = 'Documento RG não verificado';
          break;
        case 'CNH':
          details.cnh = 'Documento CNH não verificado';
          break;
        case 'PROOF_OF_ADDRESS':
          details.proofOfAddress = 'Comprovante de residência não verificado';
          break;
        case 'VEHICLE_PHOTO':
          details.vehiclePhotos = 'Fotos do veículo não enviadas ou não verificadas';
          break;
        case 'BACKGROUND_CHECK':
          details.backgroundCheck = 'Verificação de antecedentes não realizada';
          break;
        case 'COMMUNITY_ASSIGNMENT':
          details.communityAssignment = 'Comunidade não atribuída';
          break;
        case 'VEHICLE_COLOR':
          details.vehicleColor = 'Cor do veículo não informada';
          break;
        default:
          details[requirement.toLowerCase()] = `Requisito ${requirement} não atendido`;
      }
    }
    
    return details;
  }

  // Suspender motorista (enhanced with audit)
  async suspendDriver(driver_id: string, data: SuspendDriverData, admin_id: string) {
    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: { id: true, status: true, community_id: true }
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    if (driver.status !== 'approved') {
      throw new Error('Apenas motoristas aprovados podem ser suspensos');
    }

    // Use enhanced suspension with audit trail
    const updatedDriver = await this.driverEnforcement.suspendDriverWithAudit(
      driver_id, 
      data.reason, 
      admin_id
    );

    // Reavaliar ativação da comunidade após suspensão
    if (driver.community_id) {
      await this.communityActivation.evaluateCommunityActivation(driver.community_id, admin_id);
    }

    return updatedDriver;
  }

  // Reativar motorista (enhanced with audit)
  async reactivateDriver(driver_id: string, admin_id: string) {
    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: { id: true, status: true, community_id: true }
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    if (driver.status !== 'suspended') {
      throw new Error('Apenas motoristas suspensos podem ser reativados');
    }

    // Use enhanced reactivation with audit trail
    const updatedDriver = await this.driverEnforcement.reactivateDriverWithAudit(
      driver_id,
      admin_id
    );

    // Reavaliar ativação da comunidade após reativação
    if (driver.community_id) {
      await this.communityActivation.evaluateCommunityActivation(driver.community_id, 'system');
    }

    return updatedDriver;
  }

  // Ban driver
  async banDriver(driver_id: string, reason: string, admin_id: string) {
    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: { id: true, banned_at: true, community_id: true }
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    if (driver.banned_at) {
      throw new Error('Motorista já está banido');
    }

    const updatedDriver = await this.driverEnforcement.banDriver(driver_id, reason, admin_id);

    // Reavaliar ativação da comunidade
    if (driver.community_id) {
      await this.communityActivation.evaluateCommunityActivation(driver.community_id, admin_id);
    }

    return updatedDriver;
  }

  // Unban driver
  async unbanDriver(driver_id: string, admin_id: string) {
    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: { id: true, banned_at: true }
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    if (!driver.banned_at) {
      throw new Error('Motorista não está banido');
    }

    return this.driverEnforcement.unbanDriver(driver_id, admin_id);
  }

  // Soft delete driver
  async softDeleteDriver(driver_id: string, admin_id: string) {
    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: { id: true, deleted_at: true, community_id: true }
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    if (driver.deleted_at) {
      throw new Error('Motorista já foi removido');
    }

    const updatedDriver = await this.driverEnforcement.softDeleteDriver(driver_id, admin_id);

    // Reavaliar ativação da comunidade
    if (driver.community_id) {
      await this.communityActivation.evaluateCommunityActivation(driver.community_id, admin_id);
    }

    return updatedDriver;
  }

  // Restore driver
  async restoreDriver(driver_id: string, admin_id: string) {
    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: { id: true, deleted_at: true }
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    if (!driver.deleted_at) {
      throw new Error('Motorista não foi removido');
    }

    return this.driverEnforcement.restoreDriver(driver_id, admin_id);
  }

  // Get enforcement history
  async getDriverEnforcementHistory(driver_id: string) {
    return this.driverEnforcement.getEnforcementHistory(driver_id);
  }

  // Get driver details
  async getDriverById(driver_id: string) {
    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      include: {
        rides: {
          take: 10,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            status: true,
            price: true,
            created_at: true,
            passengers: {
              select: { name: true }
            }
          }
        },
        _count: {
          select: { rides: true }
        }
      }
    });

    if (!driver) {
      throw new Error('Motorista não encontrado');
    }

    return driver;
  }

  // Check if driver can accept rides (enhanced with enforcement)
  async canDriverAcceptRides(driver_id: string): Promise<boolean> {
    // Check enforcement status first
    const enforcementStatus = await this.driverEnforcement.checkDriverStatus(driver_id);
    if (enforcementStatus.isBlocked) {
      return false;
    }

    // Check basic status
    const driver = await prisma.drivers.findUnique({
      where: { id: driver_id },
      select: { status: true }
    });

    return driver?.status === 'approved';
  }

  // Passengers
  async getPassengers(query: PassengersQuery) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [passengers, total] = await Promise.all([
      prisma.passengers.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          created_at: true,
          _count: {
            select: { rides: true },
          },
        },
      }),
      prisma.passengers.count(),
    ]);

    return {
      data: passengers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Rides
  async getRides(query: RidesQuery) {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      driver_id, 
      passengerId, 
      search, 
      dateFrom, 
      dateTo, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = query;
    
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    
    if (status) where.status = status;
    if (driver_id) where.driver_id = driver_id;
    if (passengerId) where.passengerId = passengerId;
    
    if (search) {
      where.OR = [
        { drivers: { name: { contains: search, mode: 'insensitive' } } },
        { passengers: { name: { contains: search, mode: 'insensitive' } } },
        { origin: { contains: search, mode: 'insensitive' } },
        { destination: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at.gte = new Date(dateFrom);
      if (dateTo) where.created_at.lte = new Date(dateTo);
    }

    const [rides, total] = await Promise.all([
      prisma.rides.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          drivers: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          passengers: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      prisma.rides.count({ where }),
    ]);

    return {
      data: rides,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Ride details
  async getRideById(id: string) {
    const ride = await prisma.rides.findUnique({
      where: { id },
      include: {
        drivers: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        passengers: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        ride_status_history: {
          orderBy: { created_at: 'asc' },
        },
        ride_admin_actions: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!ride) {
      throw new Error('Corrida não encontrada');
    }

    return ride;
  }

  // Cancel ride administratively
  async cancelRide(ride_id: string, data: CancelRideData, admin_id: string) {
    const ride = await prisma.rides.findUnique({
      where: { id: ride_id },
      select: { status: true }
    });

    if (!ride) {
      throw new Error('Corrida não encontrada');
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      throw new Error('Corrida já foi finalizada ou cancelada');
    }

    return prisma.$transaction(async (tx) => {
      // Update ride status
      const updatedRide = await tx.rides.update({
        where: { id: ride_id },
        data: {
          status: 'cancelled',
          cancel_reason: data.reason,
          cancelled_by: admin_id,
          cancelled_at: new Date(),
        },
      });

      // Add status history
      await tx.ride_status_history.create({
        data: {
          id: `${ride_id}-status-${Date.now()}`,
          ride_id,
          status: 'cancelled',
        },
      });

      // Log admin action
      await tx.ride_admin_actions.create({
        data: {
          id: `${ride_id}-action-${Date.now()}`,
          ride_id,
          admin_id,
          action: 'cancel',
          reason: data.reason,
        },
      });

      return updatedRide;
    });
  }

  // Reassign driver
  async reassignDriver(ride_id: string, data: ReassignRideData, admin_id: string) {
    const ride = await prisma.rides.findUnique({
      where: { id: ride_id },
      select: { status: true, driver_id: true }
    });

    if (!ride) {
      throw new Error('Corrida não encontrada');
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      throw new Error('Não é possível reatribuir corrida finalizada');
    }

    // Check if new driver exists and is approved
    const newDriver = await prisma.drivers.findUnique({
      where: { id: data.newDriverId },
      select: { status: true }
    });

    if (!newDriver) {
      throw new Error('Motorista não encontrado');
    }

    if (newDriver.status !== 'approved') {
      throw new Error('Motorista não está aprovado para receber corridas');
    }

    return prisma.$transaction(async (tx) => {
      const updatedRide = await tx.rides.update({
        where: { id: ride_id },
        data: {
          driver_id: data.newDriverId,
          status: 'driver_assigned',
        },
      });

      // Add status history
      await tx.ride_status_history.create({
        data: {
          id: `${ride_id}-status-${Date.now()}`,
          ride_id,
          status: 'driver_assigned',
        },
      });

      // Log admin action
      await tx.ride_admin_actions.create({
        data: {
          id: `${ride_id}-action-${Date.now()}`,
          ride_id,
          admin_id,
          action: 'reassign_driver',
          reason: data.reason,
          old_value: ride.driver_id,
          new_value: data.newDriverId,
        },
      });

      return updatedRide;
    });
  }

  // Force complete ride
  async forceCompleteRide(ride_id: string, data: ForceCompleteRideData, admin_id: string) {
    const ride = await prisma.rides.findUnique({
      where: { id: ride_id },
      select: { status: true }
    });

    if (!ride) {
      throw new Error('Corrida não encontrada');
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      throw new Error('Corrida já foi finalizada');
    }

    return prisma.$transaction(async (tx) => {
      const updatedRide = await tx.rides.update({
        where: { id: ride_id },
        data: {
          status: 'completed',
          forced_completed_by: admin_id,
          forced_completed_at: new Date(),
        },
      });

      // Add status history
      await tx.ride_status_history.create({
        data: {
          id: `${ride_id}-status-${Date.now()}`,
          ride_id,
          status: 'completed',
        },
      });

      // Log admin action
      await tx.ride_admin_actions.create({
        data: {
          id: `${ride_id}-action-${Date.now()}`,
          ride_id,
          admin_id,
          action: 'force_complete',
          reason: data.reason,
        },
      });

      return updatedRide;
    });
  }
}
