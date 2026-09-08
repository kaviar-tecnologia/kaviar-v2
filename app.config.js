const variant = process.env.APP_VARIANT || 'driver';

const config = {
  driver: {
    name: 'Kaviar Motorista',
    slug: 'kaviar-driver',
    package: 'com.kaviar.driver',
    icon: './assets/icon-driver.png',
    splash: './assets/splash-driver.png',
    adaptiveIcon: './assets/adaptive-icon-driver.png',
    scheme: 'kaviar-driver',
    projectId: '01426c18-feb5-44f2-94f1-dab900d8bc85',
    version: '1.12.2',
    versionCode: 7,
  },
  passenger: {
    name: 'Kaviar Passageiro',
    slug: 'kaviar-passenger',
    package: 'com.kaviar.passenger',
    icon: './assets/icon-passenger.png',
    splash: './assets/splash-passenger.png',
    adaptiveIcon: './assets/adaptive-icon-passenger.png',
    scheme: 'kaviar-passenger',
    projectId: '23cab91b-82a5-4d92-9709-017279a2539d',
    version: '1.13.8',
    versionCode: 22,
  }
};

const variantConfig = config[variant];

// Permissões base (ambos os apps)
const basePermissions = [
  'ACCESS_COARSE_LOCATION',
  'ACCESS_FINE_LOCATION',
  'INTERNET',
  'VIBRATE',
];

// Motorista: precisa de background location para tracking durante corrida
const driverPermissions = [
  ...basePermissions,
  'ACCESS_BACKGROUND_LOCATION',
  'FOREGROUND_SERVICE',
  'FOREGROUND_SERVICE_LOCATION',
  'POST_NOTIFICATIONS',
];

const passengerPermissions = [...basePermissions];

export default {
  expo: {
    owner: 'usbtecnok',
    name: variantConfig.name,
    slug: variantConfig.slug,
    version: variantConfig.version,
    orientation: 'portrait',
    icon: variantConfig.icon,
    userInterfaceStyle: 'light',
    newArchEnabled: false,
    scheme: variantConfig.scheme,
    splash: {
      image: variantConfig.splash,
      resizeMode: 'contain',
      backgroundColor: '#1a1a1a'
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: variantConfig.package,
      infoPlist: {
        NSLocationAlwaysAndWhenInUseUsageDescription: variant === 'driver'
          ? 'O Kaviar Motorista usa sua localização em segundo plano para enviar sua posição ao passageiro durante a corrida.'
          : undefined,
        NSLocationWhenInUseUsageDescription: variant === 'driver'
          ? 'O Kaviar Motorista usa sua localização para encontrar corridas próximas e navegar até o passageiro.'
          : 'O Kaviar usa sua localização para encontrar motoristas próximos e acompanhar sua corrida.',
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: variantConfig.adaptiveIcon,
        backgroundColor: '#1a1a1a'
      },
      package: variantConfig.package,
      versionCode: variantConfig.versionCode,
      googleServicesFile: variant === 'driver'
        ? './google-services.json'
        : './google-services-passenger.json',
      permissions: variant === 'driver' ? driverPermissions : passengerPermissions,
      blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_PLACES_KEY || ''
        }
      }
    },
    plugins: [
      'expo-updates',
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 29,
            targetSdkVersion: 36,
            compileSdkVersion: 36,
            enableMinifyInReleaseBuilds: variant === 'driver',
            enableShrinkResourcesInReleaseBuilds: variant === 'driver',
          }
        }
      ],
      ['expo-notifications', { sounds: ['./assets/sounds/kaviar_ride.wav'] }],
      ['expo-av', { microphonePermission: false }],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: variant === 'driver'
            ? 'O Kaviar Motorista usa sua localização em segundo plano para enviar sua posição ao passageiro durante a corrida.'
            : undefined,
          locationWhenInUsePermission: variant === 'driver'
            ? 'O Kaviar Motorista usa sua localização para encontrar corridas próximas.'
            : 'O Kaviar usa sua localização para encontrar motoristas próximos.',
          isAndroidBackgroundLocationEnabled: variant === 'driver',
          isAndroidForegroundServiceEnabled: variant === 'driver',
        }
      ],
      (config) => {
        // Injeta sdk.dir no local.properties para builds EAS local
        const { withDangerousMod } = require('@expo/config-plugins');
        const fs = require('fs');
        const path = require('path');
        return withDangerousMod(config, ['android', async (cfg) => {
          const localProps = path.join(cfg.modRequest.platformProjectRoot, 'local.properties');
          const sdkDir = process.env.ANDROID_HOME || '/usr/lib/android-sdk';
          fs.writeFileSync(localProps, `sdk.dir=${sdkDir}\n`);
          return cfg;
        }]);
      },
      (config) => {
        // KAVIAR: Create notification channels natively in MainApplication.onCreate
        const { withMainApplication } = require('@expo/config-plugins');
        return withMainApplication(config, (cfg) => {
          const channelCode = [
            '    // --- KAVIAR: Native notification channels ---',
            '    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {',
            '      val nm = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager',
            '      val chRides = android.app.NotificationChannel("rides", "Corridas", android.app.NotificationManager.IMPORTANCE_HIGH)',
            '      chRides.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build())',
            '      nm.createNotificationChannel(chRides)',
            '      val chKaviar = android.app.NotificationChannel("rides_kaviar_native_v1", "Corridas KAVIAR", android.app.NotificationManager.IMPORTANCE_HIGH)',
            '      chKaviar.setSound(android.net.Uri.parse("android.resource://" + packageName + "/raw/kaviar_ride"), android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build())',
            '      chKaviar.enableVibration(true)',
            '      nm.createNotificationChannel(chKaviar)',
            '    }',
            '    // --- END KAVIAR ---',
          ].join('\n');
          cfg.modResults.contents = cfg.modResults.contents.replace(
            'super.onCreate()',
            'super.onCreate()\n' + channelCode
          );
          return cfg;
        });
      },
    ],
    runtimeVersion: {
      policy: 'appVersion'
    },
    updates: {
      url: `https://u.expo.dev/${variantConfig.projectId}`
    },
    extra: {
      eas: {
        projectId: variantConfig.projectId
      },
      EXPO_PUBLIC_API_URL: 'https://api.kaviar.com.br',
      EXPO_PUBLIC_PLACES_KEY: process.env.EXPO_PUBLIC_PLACES_KEY || '',
      APP_VARIANT: variant
    }
  }
};
