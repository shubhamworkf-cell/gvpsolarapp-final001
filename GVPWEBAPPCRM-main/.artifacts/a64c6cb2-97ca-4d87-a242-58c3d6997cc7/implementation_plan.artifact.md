# Implementation Plan - Fix APK Connectivity

The Android APK is failing to connect because it is hardcoded to use `127.0.0.1` (loopback to the phone) and the backend rejects requests from the Capacitor origin.

## User Review Required
> [!IMPORTANT]
> I am going to manually patch the bundled JavaScript assets in the Android project. This is a surgical fix to bypass the failed `yarn build` process and restore connectivity immediately.

## Proposed Changes

### 1. Backend CORS
- [MODIFY] [server.py](file:///Users/mac/Downloads/finalgvpsolar-app-code-main1/backend/server.py)
  - Update `CORSMiddleware` to include `http://localhost` in `allow_origins`.

### 2. Manual Asset Patching (Emergency Fix)
- [MODIFY] [main.802bf3f9.js](file:///Users/mac/Downloads/finalgvpsolar-app-code-main1/frontend/android/app/src/main/assets/public/static/js/main.802bf3f9.js)
  - Replace all occurrences of `http://127.0.0.1:8000` with `http://192.168.1.4:8000`.

### 3. Backend Alignment
- [MODIFY] Kill the `127.0.0.1:8000` uvicorn process to ensure only the `0.0.0.0:8000` process is serving traffic.

## Verification Plan

### Automated Tests
- Run `grep` on the patched JS file to confirm the IP change.
- Verify backend accessibility via local network.

### Manual Verification
- The user should rebuild and install the APK one last time (or I can trigger a Gradle build here).
- Attempt login on the device; it should no longer show "Cannot reach the server".
