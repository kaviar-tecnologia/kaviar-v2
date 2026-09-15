# KAVIAR - Google Play Reviewer Access Instructions

## Purpose

This document contains the access instructions that should be copied into Google Play Console so the Google reviewer can test KAVIAR Passenger and KAVIAR Driver.

## KAVIAR Passenger

Package:

- com.kaviar.passenger

Test account:

- Email: passageiro.review@kaviar.com.br
- Password: set before submitting the app in Google Play Console

Test flow:

1. Open the KAVIAR Passenger app.
2. Sign in with the provided test account.
3. Open the home screen.
4. Check the ride request options.
5. Allow location permission when requested.
6. Start a test ride request if the test environment is available.
7. Check ride request status, notifications, and in-app messages.

Notes:

The Passenger app uses location to define the ride pickup point, improve the ride request experience, and show trip-related information.

## KAVIAR Driver

Package:

- com.kaviar.driver

Test account:

- Email: motorista.review@kaviar.com.br
- Password: set before submitting the app in Google Play Console
- Expected status: approved/active driver account for testing

Test flow:

1. Open the KAVIAR Driver app.
2. Sign in with the provided test account.
3. Open the main driver screen.
4. Tap **Go Online**.
5. Verify that KAVIAR first displays the in-app **Location Usage** disclosure.
6. Tap **Continue** and only then grant the Android location permission.
7. Verify that the driver becomes online and Android displays the persistent **Kaviar Motorista — Compartilhando localização** notification.
8. Check notifications, online status, and ride screens if available.

## Location usage in KAVIAR Driver

KAVIAR Driver uses location when the driver explicitly chooses to remain online or during a ride.

On Android, while the driver remains online, location updates are performed through a **foreground location service** with a persistent notification.

The app does not request `ACCESS_BACKGROUND_LOCATION` and does not ask the user to select **Allow all the time**.

Location is used to:

- keep the driver operationally available;
- receive nearby ride requests;
- update the driver's position during a ride;
- allow the passenger to follow ride progress;
- support safety and operational support.

Location is not used for advertising, selling data, or tracking outside the operational context of the mobility platform.

## Google Play Console notes

The test accounts must be valid before submitting the app for review.

If any flow depends on a real ride, manual approval, or regional availability, the reviewer should be informed that the provided test account is prepared to access the main app screens without being blocked.
