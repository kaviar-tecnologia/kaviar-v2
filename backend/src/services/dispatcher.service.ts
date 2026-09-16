import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { rankDriversByFavorites } from './favorites-matching.service';
import { getCreditBalance } from './credit.service';
import { isFlatFeeEnabled } from './pricing-engine';
import { canDriverOperateInMunicipality, mapServiceCategoryToMunicipalModality } from './municipal-regulation.service';
import { resolveTerritory } from './territory-resolver.service';
import { config } from '../config';

interface DriverCandidate {
  driver_id: string;
  distance_km: number;
  score: number;
  same_community: boolean;
  same_neighborhood: boolean;
  same_geofence?: boolean;
  women_eligible?: boolean;
  lat?: number;
  lng?: number;
}

export class DispatcherService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly OFFER_TIMEOUT_SECONDS = 45;
  private readonly MAX_DISTANCE_KM = 12;
  private readonly LOCATION_FRESHNESS_SECONDS = process.env.NODE_ENV === 'production' ? 60 : 3600; // DEV: 1h

  private async getCityStateFromNeighborhood(neighborhoodId: string) {
    const neighborhood = await prisma.neighborhoods.findUnique({
      where: { id: neighborhoodId },
      select: {
        city: true,
        territory: {
          select: { uf: true },
        },
      },
    });

    return {
      city: neighborhood?.city || null,
      state: neighborhood?.territory?.uf || null,
    };
  }

  private async resolveRideMunicipality(ride: any) {
    if (ride.origin_neighborhood_id) {
      const fromOriginNeighborhood = await this.getCityStateFromNeighborhood(ride.origin_neighborhood_id);
      if (fromOriginNeighborhood.city && fromOriginNeighborhood.state) {
        return {
          city: fromOriginNeighborhood.city,
          state: fromOriginNeighborhood.state,
          source: 'origin_neighborhood',
        };
      }
    }

    if (ride.dest_neighborhood_id) {
      const fromDestNeighborhood = await this.getCityStateFromNeighborhood(ride.dest_neighborhood_id);
      if (fromDestNeighborhood.city && fromDestNeighborhood.state) {
        return {
          city: fromDestNeighborhood.city,
          state: fromDestNeighborhood.state,
          source: 'dest_neighborhood',
        };
      }
    }

    if (ride.passenger?.neighborhood_id) {
      const fromPassengerNeighborhood = await this.getCityStateFromNeighborhood(ride.passenger.neighborhood_id);
      if (fromPassengerNeighborhood.city && fromPassengerNeighborhood.state) {
        return {
          city: fromPassengerNeighborhood.city,
          state: fromPassengerNeighborhood.state,
          source: 'passenger_neighborhood',
        };
      }
    }

    const originLat = Number(ride.origin_lat);
    const originLng = Number(ride.origin_lng);
    if (!Number.isNaN(originLat) && !Number.isNaN(originLng)) {
      const territory = await resolveTerritory(originLng, originLat);
      if (territory?.neighborhood?.id) {
        const fromOriginCoords = await this.getCityStateFromNeighborhood(territory.neighborhood.id);
        if (fromOriginCoords.city && fromOriginCoords.state) {
          return {
            city: fromOriginCoords.city,
            state: fromOriginCoords.state,
            source: 'origin_coordinates',
          };
        }
      }
    }

    return {
      city: null,
      state: null,
      source: 'unresolved',
    };
  }

  async dispatchRide(rideId: string): Promise<void> {
    const ride = await prisma.rides_v2.findUnique({
      where: { id: rideId },
      include: {
        offers: true,
        passenger: { select: { neighborhood_id: true, community_id: true } }
      }
    });

    if (!ride) {
      console.error(`[DISPATCHER] Ride ${rideId} not found`);
      return;
    }

    if (ride.status !== 'requested' && ride.status !== 'offered') {
      console.log(`[DISPATCHER] Ride ${rideId} status=${ride.status}, skipping dispatch`);
      return;
    }

    const failedOffers = ride.offers.filter(
      o => o.status === 'expired' || o.status === 'rejected' || o.status === 'canceled'
    );

    const outsideFallbackActive =
      ride.is_homebound === true &&
      ride.outside_fallback_allowed === true &&
      !!ride.outside_fallback_consented_at;

    // Cada fase possui sua própria janela de tentativas:
    // - antes do consentimento: até MAX_ATTEMPTS no território local
    // - depois do consentimento: até MAX_ATTEMPTS novas ofertas
    //   mantendo os motoristas anteriores excluídos.
    const attemptCount = outsideFallbackActive
      ? failedOffers.filter(
          o => o.created_at >= ride.outside_fallback_consented_at!
        ).length
      : failedOffers.length;

    const maxAttemptsForRide = this.MAX_ATTEMPTS;

    if (attemptCount >= maxAttemptsForRide) {
      console.log(`[DISPATCHER] Ride ${rideId} reached max attempts (${maxAttemptsForRide}) in current dispatch phase, setting no_driver`);
      await prisma.rides_v2.update({
        where: { id: rideId },
        data: { status: 'no_driver' }
      });
      return;
    }

    // Buscar candidatos
    const allCandidates = await this.findCandidates(ride);

    // Excluir motoristas que já receberam oferta para esta corrida (expired/rejected)
    const excludedDriverIds = new Set(
      ride.offers.filter((o: any) => o.status === 'expired' || o.status === 'rejected' || o.status === 'canceled').map((o: any) => o.driver_id)
    );
    const candidates = allCandidates.filter(c => !excludedDriverIds.has(c.driver_id));
    
    console.log(`[DISPATCH_CANDIDATES] ride_id=${rideId} attempt=${attemptCount + 1} candidates=${candidates.length} excluded=${excludedDriverIds.size} top3=${JSON.stringify(candidates.slice(0, 3))}`);

    if (candidates.length === 0) {
      console.log(`[DISPATCHER] No candidates for ride ${rideId}, setting no_driver`);
      await prisma.rides_v2.update({
        where: { id: rideId },
        data: { status: 'no_driver' }
      });
      return;
    }

    // Pegar o melhor candidato
    const bestCandidate = candidates[0];

    // Defesa em profundidade:
    // OUTSIDE só é permitido em retorno para casa com consentimento explícito.
    const isOutsideCandidate =
      !bestCandidate.same_community &&
      !bestCandidate.same_neighborhood;

    const allowOutsideFallback =
      ride.is_homebound === true &&
      ride.outside_fallback_allowed === true &&
      !!ride.outside_fallback_consented_at;

    if (isOutsideCandidate && !allowOutsideFallback) {
      console.warn(`[DISPATCHER_TERRITORY_BLOCK] ride_id=${rideId} driver_id=${bestCandidate.driver_id} action=no_driver`);
      await prisma.rides_v2.update({
        where: { id: rideId },
        data: { status: 'no_driver' }
      });
      return;
    }

    const matchTier = bestCandidate.same_community
      ? 'COMMUNITY'
      : bestCandidate.same_neighborhood
        ? 'NEIGHBORHOOD'
        : 'OUTSIDE';

    // Criar oferta + atualizar ride atomicamente
    const expiresAt = new Date(Date.now() + this.OFFER_TIMEOUT_SECONDS * 1000);
    
    const offer = await prisma.$transaction(async (tx) => {
      const o = await tx.ride_offers.create({
        data: {
          ride_id: rideId,
          driver_id: bestCandidate.driver_id,
          status: 'pending',
          territory_tier: matchTier,
          expires_at: expiresAt,
          rank_score: new Decimal(bestCandidate.score)
        }
      });
      await tx.rides_v2.update({
        where: { id: rideId },
        data: { status: 'offered', offered_at: new Date() }
      });
      return o;
    });

    console.log(`[OFFER_SENT] ride_id=${rideId} offer_id=${offer.id} driver_id=${bestCandidate.driver_id} tier=${matchTier} distance_km=${bestCandidate.distance_km.toFixed(1)} score=${bestCandidate.score}`);

    // Emitir evento real-time para o motorista
    this.emitOfferToDriver(bestCandidate.driver_id, offer.id, ride, matchTier);

    // DEV: simular decisão do driver com probabilidades
    if (process.env.NODE_ENV !== 'production' && process.env.DEV_AUTO_ACCEPT === 'true') {
      let acceptProb = parseFloat(process.env.DEV_ACCEPT_PROB || '0.85');
      const rejectProb = parseFloat(process.env.DEV_REJECT_PROB || '0.10');
      const ignoreProb = parseFloat(process.env.DEV_IGNORE_PROB || '0.05');
      const geofenceBoost = parseFloat(process.env.DEV_GEOFENCE_BOOST || '0');
      const timeScale = parseFloat(process.env.DEV_TIME_SCALE || '1');
      
      const acceptProbBase = acceptProb;
      
      // Boost accept prob if same geofence
      if (bestCandidate.same_geofence && geofenceBoost > 0) {
        acceptProb = Math.min(0.98, acceptProb + geofenceBoost * 0.2);
        console.log(`[DEV_GEOFENCE_BOOST_APPLIED] driver_id=${bestCandidate.driver_id} accept_prob_base=${acceptProbBase.toFixed(3)} accept_prob_boosted=${acceptProb.toFixed(3)} boost=${geofenceBoost}`);
      }
      
      const rand = Math.random();
      let action: 'accept' | 'reject' | 'ignore';
      
      if (rand < acceptProb) {
        action = 'accept';
      } else if (rand < acceptProb + rejectProb) {
        action = 'reject';
      } else {
        action = 'ignore';
      }
      
      const jitterRaw = 200 + Math.random() * 400;
      const jitter = jitterRaw / timeScale;
      
      console.log(`[DEV_DRIVER_DECISION] offer_id=${offer.id} driver_id=${bestCandidate.driver_id} action=${action} prob=${rand.toFixed(3)} accept_prob=${acceptProb.toFixed(3)} same_geofence=${bestCandidate.same_geofence || false} jitter_ms=${Math.round(jitter)}`);
      
      setTimeout(async () => {
        try {
          if (action === 'accept') {
            const { acceptOfferInternal } = require('./offer-acceptance.service');
            await acceptOfferInternal(offer.id, bestCandidate.driver_id);
            console.log(`[DEV_AUTO_ACCEPT_DONE] offer_id=${offer.id} ride_id=${rideId} driver_id=${bestCandidate.driver_id}`);
            
            // DEV: auto-release após duração simulada
            if (process.env.DEV_AUTO_RELEASE === 'true') {
              const minDuration = parseInt(process.env.DEV_RELEASE_MIN_MS || '90000');
              const maxDuration = parseInt(process.env.DEV_RELEASE_MAX_MS || '180000');
              const durationSim = minDuration + Math.random() * (maxDuration - minDuration);
              const durationReal = durationSim / timeScale;
              
              console.log(`[DEV_AUTO_RELEASE_SCHEDULED] driver_id=${bestCandidate.driver_id} duration_ms_sim=${Math.round(durationSim)} duration_ms_real=${Math.round(durationReal)}`);
              
              setTimeout(async () => {
                try {
                  await prisma.driver_status.update({
                    where: { driver_id: bestCandidate.driver_id },
                    data: { availability: 'online' }
                  });
                  console.log(`[DEV_AUTO_RELEASE_DONE] driver_id=${bestCandidate.driver_id} availability=online`);
                } catch (err: any) {
                  console.log(`[DEV_AUTO_RELEASE_FAILED] driver_id=${bestCandidate.driver_id} error=${err.message}`);
                }
              }, durationReal);
            }
          } else if (action === 'reject') {
            await prisma.ride_offers.update({
              where: { id: offer.id },
              data: { status: 'rejected', responded_at: new Date() }
            });
            console.log(`[DEV_AUTO_REJECT_DONE] offer_id=${offer.id} driver_id=${bestCandidate.driver_id}`);
            
            // Redispatch
            await prisma.rides_v2.update({
              where: { id: rideId },
              data: { status: 'requested' }
            });
            await this.dispatchRide(rideId);
          } else {
            console.log(`[DEV_AUTO_IGNORE] offer_id=${offer.id} driver_id=${bestCandidate.driver_id} will_expire=true`);
          }
        } catch (error: any) {
          console.log(`[DEV_DRIVER_ACTION_FAILED] offer_id=${offer.id} action=${action} reason=${error.message}`);
        }
      }, jitter);
    }
  }

  private async findCandidates(ride: any): Promise<DriverCandidate[]> {
    const cutoffTime = new Date(Date.now() - this.LOCATION_FRESHNESS_SECONDS * 1000);
    const municipalGateEnabled = config.driverEnforcement.municipalRegulatoryGateEnabled;
    const requiredMunicipalModality = mapServiceCategoryToMunicipalModality(ride.service_category);

    let municipalityCity: string | null = null;
    let municipalityState: string | null = null;

    if (municipalGateEnabled) {
      const municipalityResolution = await this.resolveRideMunicipality(ride);
      municipalityCity = municipalityResolution.city;
      municipalityState = municipalityResolution.state;

      if (!municipalityCity || !municipalityState) {
        console.warn(`[DISPATCHER_MUNICIPAL_UNRESOLVED] ride_id=${ride.id} source=${municipalityResolution.source} action=fail_closed`);
        return [];
      }
    }

    // Buscar motoristas online com localização recente
    const onlineDrivers = await prisma.driver_status.findMany({
      where: {
        availability: 'online'
      },
      include: {
        driver: {
          include: {
            driver_location: true
          }
        }
      }
    });

    // Diagnóstico: contar motoristas por filtro
    const onlineDriversCount = onlineDrivers.length;
    
    // Log inicial para debug
    console.log(`[DISPATCHER_DEBUG] ride_id=${ride.id} query_returned=${onlineDriversCount} drivers with availability=online`);
    if (onlineDriversCount > 0) {
      console.log(`[DISPATCHER_DEBUG] Sample driver:`, JSON.stringify({
        driver_id: onlineDrivers[0].driver_id,
        availability: onlineDrivers[0].availability,
        has_location: !!onlineDrivers[0].driver.driver_location,
        location_updated_at: onlineDrivers[0].driver.driver_location?.updated_at
      }));
    }
    
    let withLocationCount = 0;
    let withFreshLocationCount = 0;
    let withinDistanceCount = 0;
    const droppedReasons: { [key: string]: number } = {
      no_location: 0,
      stale_location: 0,
      too_far: 0,
      no_credits: 0,
      wrong_vehicle: 0,
      municipal_block: 0,
      outside_territory: 0,
    };

    const candidates: DriverCandidate[] = [];

    // Moto Express/Passenger: determine required vehicle type from service_category
    const serviceCategory = ride.service_category || 'CAR_NORMAL';
    const requiredVehicleType = (serviceCategory === 'MOTO_DELIVERY' || serviceCategory === 'MOTO_PASSENGER') ? 'MOTORCYCLE' : null;

    for (const ds of onlineDrivers) {
      // Vehicle type filter: MOTO_DELIVERY requires MOTORCYCLE only
      if (requiredVehicleType && (ds.driver.vehicle_type || 'CAR') !== requiredVehicleType) {
        droppedReasons.wrong_vehicle++;
        continue;
      }

      const location = ds.driver.driver_location;
      
      if (!location) {
        droppedReasons.no_location++;
        continue;
      }
      withLocationCount++;
      
      if (location.updated_at < cutoffTime) {
        droppedReasons.stale_location++;
        continue;
      }
      withFreshLocationCount++;

      const distance = this.haversineDistance(
        Number(ride.origin_lat),
        Number(ride.origin_lng),
        Number(location.lat),
        Number(location.lng)
      );

      if (distance > this.MAX_DISTANCE_KM) {
        droppedReasons.too_far++;
        continue;
      }
      withinDistanceCount++;

      // Credit gate: driver must have sufficient balance
      if (process.env.CREDIT_GATE_ENABLED === 'true') {
        try {
          const balance = await getCreditBalance(ds.driver_id);
          const flatFee = await isFlatFeeEnabled();
          const minRequired = flatFee
            ? Number(ride.quoted_price || 0) * 0.18  // 18% do preço da corrida
            : 2; // legado: 2 créditos
          if (balance < minRequired) {
            droppedReasons.no_credits++;
            continue;
          }
        } catch {
          // If credit check fails, allow driver through (fail-open)
        }
      }

      if (municipalGateEnabled) {
        const municipalGate = await canDriverOperateInMunicipality(
          ds.driver_id,
          municipalityCity!,
          municipalityState!,
          requiredMunicipalModality,
        );

        if (!municipalGate.allowed) {
          droppedReasons.municipal_block++;
          continue;
        }
      }

      // Referência territorial:
      // - retorno para casa: território residencial do passageiro
      // - corrida normal: exclusivamente o território da origem
      const refNeighborhood = ride.is_homebound
        ? ride.passenger?.neighborhood_id
        : ride.origin_neighborhood_id;
      const refCommunity = ride.is_homebound
        ? ride.passenger?.community_id
        : ride.origin_community_id;

      const sameNeighborhood = refNeighborhood &&
                               ds.driver.neighborhood_id === refNeighborhood;

      const sameCommunity = refCommunity &&
                            ds.driver.community_id === refCommunity;

      // Regra comunitária KAVIAR:
      // motorista precisa pertencer à mesma comunidade ou ao mesmo bairro.
      // Exceção: retorno para casa com consentimento explícito do passageiro.
      const allowOutsideFallback =
        ride.is_homebound === true &&
        ride.outside_fallback_allowed === true &&
        !!ride.outside_fallback_consented_at;

      if (!sameCommunity && !sameNeighborhood && !allowOutsideFallback) {
        droppedReasons.outside_territory++;
        continue;
      }

      // Score = distância GPS pura (desempate operacional dentro de cada tier)
      let score = distance;

      // DEV: Geofence boost (INSIDE coords: -22.965 to -22.975 lat, -43.170 to -43.185 lng)
      let sameGeofence = false;
      if (process.env.NODE_ENV !== 'production' && process.env.DEV_GEOFENCE_BOOST) {
        const rideLat = Number(ride.origin_lat);
        const rideLng = Number(ride.origin_lng);
        const driverLat = Number(location.lat);
        const driverLng = Number(location.lng);
        
        const rideInside = rideLat >= -22.975 && rideLat <= -22.965 && rideLng >= -43.185 && rideLng <= -43.170;
        const driverInside = driverLat >= -22.975 && driverLat <= -22.965 && driverLng >= -43.185 && driverLng <= -43.170;
        
        if (rideInside && driverInside) {
          const boost = parseFloat(process.env.DEV_GEOFENCE_BOOST);
          score *= (1 - boost);
          sameGeofence = true;
        }
      }

      candidates.push({
        driver_id: ds.driver_id,
        distance_km: distance,
        score,
        same_community: !!sameCommunity,
        same_neighborhood: !!sameNeighborhood,
        same_geofence: sameGeofence,
        women_eligible: !!(ds.driver.women_preference_eligible && ds.driver.women_matching_opt_in),
        lat: Number(location.lat),
        lng: Number(location.lng),
      });
    }

    // Log de diagnóstico
    console.log(`[DISPATCHER_FILTER] ride_id=${ride.id} online=${onlineDriversCount} with_location=${withLocationCount} fresh_location=${withFreshLocationCount} within_distance=${withinDistanceCount} final_candidates=${candidates.length} dropped=${JSON.stringify(droppedReasons)}`);

    // Ordenar por tier territorial, GPS como desempate dentro de cada tier
    // Tier 1: mesma comunidade  |  Tier 2: mesmo bairro  |  Tier 3: fora
    candidates.sort((a, b) => {
      const tierA = a.same_community ? 0 : a.same_neighborhood ? 1 : 2;
      const tierB = b.same_community ? 0 : b.same_neighborhood ? 1 : 2;
      if (tierA !== tierB) return tierA - tierB;
      return a.score - b.score;
    });

    console.log(`[DISPATCH_TIERS] ride_id=${ride.id} community=${candidates.filter(c => c.same_community).length} neighborhood=${candidates.filter(c => !c.same_community && c.same_neighborhood).length} outside=${candidates.filter(c => !c.same_community && !c.same_neighborhood).length}`);

    // Women preference: priorizar motoristas mulheres elegíveis DENTRO de cada tier
    const womenPriorityEnabled = process.env.WOMEN_DRIVER_PREFERENCE_ENABLED === 'true';
    if (womenPriorityEnabled && ride.prefer_woman_driver && candidates.length > 1) {
      const eligibleCount = candidates.filter(c => c.women_eligible).length;
      if (eligibleCount > 0) {
        candidates.sort((a, b) => {
          const tierA = a.same_community ? 0 : a.same_neighborhood ? 1 : 2;
          const tierB = b.same_community ? 0 : b.same_neighborhood ? 1 : 2;
          if (tierA !== tierB) return tierA - tierB;
          if (a.women_eligible !== b.women_eligible) return a.women_eligible ? -1 : 1;
          return a.score - b.score;
        });
      }
      console.log(`[DISPATCH_WOMEN_PRIORITY] ride_id=${ride.id} women_eligible=${eligibleCount} total=${candidates.length} top=${candidates[0]?.driver_id} top_eligible=${candidates[0]?.women_eligible}`);
    }

    // Hybrid scoring: favorites refine ranking WITHIN each territorial tier
    const favWeight = parseFloat(process.env.FAVORITES_WEIGHT || '0');
    if (favWeight > 0 && candidates.length > 1 && ride.passenger_id) {
      try {
        const pickup = { lat: Number(ride.origin_lat), lng: Number(ride.origin_lng) };
        const driverObjects = candidates.map(c => ({ id: c.driver_id, last_lat: c.lat, last_lng: c.lng }));
        const ranked = await rankDriversByFavorites(driverObjects, ride.passenger_id, pickup);

        if (ranked.length > 0 && ranked[0].score !== undefined) {
          const maxFavScore = 20;
          const maxDistScore = Math.max(...candidates.map(c => c.score), 1);

          for (const c of candidates) {
            const favResult = ranked.find((r: any) => r.id === c.driver_id);
            const favNorm = favResult ? (favResult.score / maxFavScore) : 1;
            const distNorm = c.score / maxDistScore;
            c.score = distNorm * (1 - favWeight) + favNorm * favWeight;
          }

          // Re-sort preserving 3-tier territorial priority
          candidates.sort((a, b) => {
            const tierA = a.same_community ? 0 : a.same_neighborhood ? 1 : 2;
            const tierB = b.same_community ? 0 : b.same_neighborhood ? 1 : 2;
            if (tierA !== tierB) return tierA - tierB;
            if (womenPriorityEnabled && ride.prefer_woman_driver && a.women_eligible !== b.women_eligible) return a.women_eligible ? -1 : 1;
            return a.score - b.score;
          });
          console.log(`[HYBRID_RANK] ride_id=${ride.id} weight=${favWeight} territory_first=true top=${candidates.slice(0, 3).map(c => `${c.driver_id}(c=${c.same_community},n=${c.same_neighborhood})`).join(',')}`);
        }
      } catch (err: any) {
        console.log(`[HYBRID_SCORE_ERROR] ride_id=${ride.id} error=${err.message} fallback=territory+distance`);
      }
    }

    return candidates;
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Raio da Terra em km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async checkExpiredOffers(): Promise<void> {
    const expiredOffers = await prisma.ride_offers.findMany({
      where: {
        status: 'pending',
        expires_at: {
          lt: new Date()
        }
      },
      include: {
        ride: true
      }
    });

    for (const offer of expiredOffers) {
      console.log(`[OFFER_EXPIRED] offer_id=${offer.id} ride_id=${offer.ride_id} driver_id=${offer.driver_id}`);
      
      await prisma.ride_offers.update({
        where: { id: offer.id },
        data: { status: 'expired' }
      });

      // Redispatch
      if (offer.ride.status === 'offered') {
        await prisma.rides_v2.update({
          where: { id: offer.ride_id },
          data: { status: 'requested' }
        });
        
        await this.dispatchRide(offer.ride_id);
      }
    }

    // Check expired adjustment responses (60s timeout)
    const adjustmentCutoff = new Date(Date.now() - 60 * 1000);
    const staleAdjustments = await prisma.ride_offers.findMany({
      where: {
        adjustment_status: 'pending',
        responded_at: { lt: adjustmentCutoff }
      },
      include: { ride: true }
    });

    for (const offer of staleAdjustments) {
      if (offer.ride.status !== 'pending_adjustment') continue;

      console.log(`[ADJUSTMENT_TIMEOUT] offer_id=${offer.id} ride_id=${offer.ride_id} driver_id=${offer.driver_id}`);

      await prisma.$transaction(async (tx) => {
        await tx.ride_offers.update({
          where: { id: offer.id },
          data: { adjustment_status: 'rejected' }
        });
        await tx.rides_v2.update({
          where: { id: offer.ride_id },
          data: { status: 'requested', driver_id: null, driver_adjustment: null, adjusted_price: null, accepted_at: null }
        });
        await tx.driver_status.update({
          where: { driver_id: offer.driver_id },
          data: { availability: 'online' }
        });
      });

      await this.dispatchRide(offer.ride_id);
    }
  }

  private emitOfferToDriver(driverId: string, offerId: string, ride: any, tier: string): void {
    const event = {
      type: 'ride.offer.created',
      offer: {
        id: offerId,
        ride_id: ride.id,
        territory_tier: tier,
        expires_at: new Date(Date.now() + this.OFFER_TIMEOUT_SECONDS * 1000).toISOString()
      },
      ride: {
        origin: {
          lat: Number(ride.origin_lat),
          lng: Number(ride.origin_lng),
          text: ride.origin_text
        },
        destination: {
          lat: Number(ride.dest_lat),
          lng: Number(ride.dest_lng),
          text: ride.destination_text
        },
        homebound: ride.is_homebound || false,
        trip_details: ride.trip_details || null,
        wait_requested: ride.wait_requested || false,
        wait_estimated_min: ride.wait_estimated_min || null
      }
    };

    // Enviar via SSE
    const { realTimeService } = require('./realtime.service');
    realTimeService.emitToDriver(driverId, event);

    // Push notification (aditivo — não bloqueia se falhar)
    const pushProvider = process.env.DRIVER_PUSH_PROVIDER || 'expo';
    const fcmAllowlist = (process.env.DRIVER_FCM_ALLOWLIST || '').split(',').filter(Boolean);
    const usesFcmForDriver = fcmAllowlist.includes(driverId) || pushProvider === 'fcm' || pushProvider === 'dual';

    if (usesFcmForDriver) {
      const { sendFcmPushToDriver } = require('./fcm-push.service');
      sendFcmPushToDriver(driverId, '🚗 Nova corrida disponível', 'Abra o KAVIAR Motorista para aceitar.')
        .then(() => console.log(`[FCM] Sent to driver ${driverId}`))
        .catch((e: any) => {
          console.warn(`[FCM] Failed for driver ${driverId}:`, e?.message);
          const { sendPushToDriver } = require('./push.service');
          sendPushToDriver(driverId, '🚗 Nova corrida disponível', 'Abra o KAVIAR Motorista para aceitar.')
            .then(() => console.log(`[PUSH] Expo fallback sent to driver ${driverId}`))
            .catch((e2: any) => console.warn(`[PUSH] Expo fallback failed for driver ${driverId}:`, e2?.message));
        });
    } else {
      const { sendPushToDriver } = require('./push.service');
      sendPushToDriver(driverId, '🚗 Nova corrida disponível', 'Abra o KAVIAR Motorista para aceitar.')
        .then(() => console.log(`[PUSH] Sent to driver ${driverId}`))
        .catch((e: any) => console.warn(`[PUSH] Failed for driver ${driverId}:`, e?.message));
    }
    
    console.log(`[REALTIME] Emitted to driver ${driverId}:`, JSON.stringify(event));
  }
}

export const dispatcherService = new DispatcherService();
