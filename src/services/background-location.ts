import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TASK_NAME = 'kaviar-driver-location';
const RIDE_ID_KEY = 'kaviar_active_ride_id';
const API_URL_KEY = 'kaviar_api_url';
const EMERGENCY_KEY = 'kaviar_emergency_active';

// --- Persistent ride ID ---

export async function setActiveRideId(rideId: string | null): Promise<void> {
  if (rideId) {
    await AsyncStorage.setItem(RIDE_ID_KEY, rideId);
  } else {
    await AsyncStorage.removeItem(RIDE_ID_KEY);
  }
}

export async function getActiveRideId(): Promise<string | null> {
  return AsyncStorage.getItem(RIDE_ID_KEY);
}

// --- Task definition (runs outside React) ---
// MUST be called at module scope — this module must be imported
// from the app entry point (or a layout that always loads).

let _taskDefined = false;

function ensureTaskDefined() {
  if (_taskDefined) return;
  _taskDefined = true;

  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) return;
    if (!data) return;

    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    const token = await AsyncStorage.getItem('auth_token');
    if (!token) return;

    const apiUrl = (await AsyncStorage.getItem(API_URL_KEY)) || 'https://api.kaviar.com.br';
    const { latitude: lat, longitude: lng } = locations[locations.length - 1].coords;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // Drain offline queue on each cycle (piggyback on background task)
    try {
      const { drain } = require('./offline-queue');
      await drain(token);
    } catch {}

    // Always send driver location
    try {
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 10000);
      await fetch(`${apiUrl}/api/v2/drivers/me/location`, {
        method: 'POST', headers, body: JSON.stringify({ lat, lng }), signal: ctrl1.signal,
      });
      clearTimeout(t1);
    } catch {
      try {
        const { enqueue } = require('./offline-queue');
        await enqueue({ method: 'POST' as const, url: `${apiUrl}/api/v2/drivers/me/location`, body: { lat, lng } });
      } catch {}
    }

    // If active ride, also send ride location (SSE to passenger)
    const rideId = await AsyncStorage.getItem(RIDE_ID_KEY);
    if (rideId) {
      try {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 10000);
        await fetch(`${apiUrl}/api/v2/rides/${rideId}/location`, {
          method: 'POST', headers, body: JSON.stringify({ lat, lng }), signal: ctrl2.signal,
        });
        clearTimeout(t2);
      } catch {
        try {
          const { enqueue } = require('./offline-queue');
          await enqueue({ method: 'POST' as const, url: `${apiUrl}/api/v2/rides/${rideId}/location`, body: { lat, lng } });
        } catch {}
      }
    }
  });
}

// --- Start / Stop ---

let _running = false;

export async function startBackgroundLocation(apiUrl: string): Promise<'background' | 'foreground'> {
  // Persist API URL for the task
  await AsyncStorage.setItem(API_URL_KEY, apiUrl);

  // Ensure task is defined before any TaskManager calls
  ensureTaskDefined();

  // Guard against double-start
  const alreadyRunning = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (alreadyRunning) {
    _running = true;
    return 'background';
  }

  // Foreground permission (required first)
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('FOREGROUND_DENIED');
  }

  // User-initiated foreground location service.
  // No ACCESS_BACKGROUND_LOCATION permission is requested.
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,
    distanceInterval: 30,
    deferredUpdatesInterval: 15000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Kaviar Motorista',
      notificationBody: 'Compartilhando localização',
      notificationColor: '#D4AF37',
    },
  });

  _running = true;
  return 'background';
}

export async function stopBackgroundLocation(): Promise<void> {
  _running = false;
  await AsyncStorage.removeItem(RIDE_ID_KEY);
  await AsyncStorage.removeItem(EMERGENCY_KEY);
  const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (registered) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}

export function isBackgroundRunning(): boolean {
  return _running;
}

export async function setEmergencyMode(active: boolean): Promise<void> {
  if (active) {
    await AsyncStorage.setItem(EMERGENCY_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(EMERGENCY_KEY);
  }
  // Restart with tighter interval if running
  if (_running) {
    const apiUrl = (await AsyncStorage.getItem(API_URL_KEY)) || 'https://api.kaviar.com.br';
    const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (registered) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
    }
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: active ? 5000 : 15000,
      distanceInterval: active ? 10 : 30,
      deferredUpdatesInterval: active ? 5000 : 15000,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Kaviar Motorista',
        notificationBody: active ? '🚨 Modo de proteção ativo' : 'Compartilhando localização',
        notificationColor: active ? '#FF0000' : '#D4AF37',
      },
    });
  }
}
