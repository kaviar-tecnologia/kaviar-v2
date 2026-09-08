#!/bin/bash
set -e
set -u

echo "🔧 Build Driver APK"
echo "==================="

cd /home/goes/kaviar

# Garante variant consistente de ponta a ponta (Expo config, prebuild, bundle e Gradle),
# independente de qualquer valor APP_VARIANT vindo de .env local.
export APP_VARIANT=driver
echo "🧭 APP_VARIANT forçado para: ${APP_VARIANT}"

# Limpar cache
echo "🧹 Limpando cache..."
rm -rf .expo node_modules/.cache

# Build
echo "🏗️ Regenerando Android (driver)..."
npx expo prebuild --platform android

echo "📦 Gerando APK release driver..."
cd android
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
PATH=$JAVA_HOME/bin:$PATH \
./gradlew :app:assembleRelease

echo ""
echo "✅ Build concluído!"
echo ""
echo "📱 Para testar:"
echo "   adb install -r /home/goes/kaviar/android/app/build/outputs/apk/release/app-release.apk"
echo "   adb shell am start -n com.kaviar.driver/.MainActivity"
echo "   adb logcat | rg -i 'ReactNativeJS|Expo'"
