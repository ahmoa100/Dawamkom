# Dawamkom iOS

The Expo app loads Dawamkom’s live mobile interface at `https://www.dawamkom.net`, including its employee and manager views. Attendance location requests on employee pages use iOS foreground location permissions. Use a test employee account for attendance testing because successful punches are saved by the server.

## Run from Windows

```powershell
cd dawamkom-ios
npm ci
npm run check
```

## First TestFlight build

Sign in to Expo with an account you control. Link this project to that account, then build with the Apple Developer team that registered `net.dawamkom.app`.

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform ios --profile testflight
npx eas-cli@latest submit --platform ios --latest
```

In App Store Connect, add the processed build to a TestFlight internal testing group. Verify the iPhone can retain its session, request device approval when needed, get a location fix, and record both a clock-in and a clock-out before starting App Review.
