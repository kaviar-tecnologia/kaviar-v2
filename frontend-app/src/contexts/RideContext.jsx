import { createContext, useContext, useState } from 'react';
import { canRunLegacyRideDemo } from './legacyRideDemoPolicy';

const RideContext = createContext();

const demoEnabled = canRunLegacyRideDemo(import.meta.env.DEV, import.meta.env.VITE_LEGACY_RIDE_DEMO_ENABLED);

export const useRide = () => {
  const context = useContext(RideContext);
  if (!context) {
    throw new Error('useRide deve ser usado dentro de RideProvider');
  }
  return context;
};

export const RideProvider = ({ children }) => {
  const [rideStatus, setRideStatus] = useState('idle');
  const [currentRide, setCurrentRide] = useState(null);

  // Dados mockados para demonstração
  const mockDrivers = [
    {
      id: 1,
      name: 'Carlos Silva',
      rating: 4.8,
      car: 'Honda Civic Prata',
      plate: 'ABC-1234',
      photo: '👨‍💼',
      eta: '3 min'
    },
    {
      id: 2,
      name: 'Ana Santos',
      rating: 4.9,
      car: 'Toyota Corolla Branco',
      plate: 'XYZ-5678',
      photo: '👩‍💼',
      eta: '5 min'
    }
  ];

  const requestRide = (rideData) => {
    // This context uses fictional drivers, prices and timers. Never dispatch in production.
    if (!demoEnabled) return false;
    setRideStatus('requesting');
    
    const mockRide = {
      id: Date.now(),
      isDemo: true,
      origin: rideData.origin || 'Origem selecionada',
      destination: rideData.destination || 'Destino selecionado',
      serviceType: rideData.serviceType || 'STANDARD_RIDE',
      price: Math.floor(Math.random() * 20) + 15, // R$ 15-35
      driver: null,
      requestTime: new Date(),
      estimatedDuration: '15-20 min'
    };
    
    setCurrentRide(mockRide);

    // Simular busca de motorista (3 segundos)
    setTimeout(() => {
      const selectedDriver = mockDrivers[Math.floor(Math.random() * mockDrivers.length)];
      setCurrentRide(prev => ({ ...prev, driver: selectedDriver }));
      setRideStatus('driver_assigned');
      
      // Simular motorista chegando (5 segundos)
      setTimeout(() => {
        setRideStatus('on_trip');
        
        // Simular corrida em andamento (10 segundos)
        setTimeout(() => {
          setRideStatus('completed');
        }, 10000);
      }, 5000);
    }, 3000);
    return true;
  };

  const rateRide = (rating, comment) => {
    if (!demoEnabled) return false;
    setCurrentRide(prev => ({ 
      ...prev, 
      rating, 
      comment,
      completedAt: new Date()
    }));
    setRideStatus('rated');
    
    // Reset após 3 segundos para nova corrida
    setTimeout(() => {
      setRideStatus('idle');
      setCurrentRide(null);
    }, 3000);
  };

  const cancelRide = () => {
    setRideStatus('idle');
    setCurrentRide(null);
  };

  const value = {
    rideStatus,
    currentRide,
    requestRide,
    rateRide,
    demoEnabled,
    cancelRide
  };

  return (
    <RideContext.Provider value={value}>
      {children}
    </RideContext.Provider>
  );
};

export default RideContext;
