# AXIS 3D — native Android build

This repo now carries a Capacitor wrapper. The web app is unchanged; `android/`
is a normal Android Studio project that loads the built site from inside the
APK instead of over the network.

## Build it

You need Android Studio (and a JDK 21, which Android Studio bundles). These build tools run on a developer machine or in GitHub Actions.

```
npm install
npm run android:sync     # vite build + copy dist into the native project
npm run android:open     # opens android/ in Android Studio
```

In Android Studio: **Build → Generate Signed App Bundle / APK**.
Use *APK* to sideload and test, *Android App Bundle* to upload to Play.

Re-run `npm run android:sync` after every web change. Editing `src/` alone does
nothing to the app until the build is copied across.

## Decisions already made, and how to change them

**Package id: `com.base6a5340f43f8fd031c5921680.app`** — deliberately the same
id as the app currently on Play, so this build can replace the existing listing
rather than starting a new one. It lives in `capacitor.config.json`,
`android/app/build.gradle` and `android/app/src/main/res/values/strings.xml`.
Changing it means a new listing, with no carry-over of installs or reviews.

**Version code:** Debug builds default to 25. Release builds require
`AXIS_VERSION_CODE` to be set explicitly. Choose an integer strictly higher
than **every** versionCode previously uploaded to Google Play, including internal
and rejected/test releases. Check the **transferred app** in the current Google
Play Console account; do not assume 25 is high enough. Set optional
`AXIS_VERSION_NAME` for the display version. The native package ID must stay
exactly as shown above.

**App name: AXIS 3D.** `strings.xml`.

**targetSdk 36, minSdk 24.** Above Play's current floor; Android 7.0 and up.

## Google Play upload key reset: verified 2026-10-19

The original upload key is no longer needed: after transferring Axis 3D to a
different Google Play developer account, Google Play recorded an upload key
reset. The new approved **SHA-256 certificate fingerprint** is:

```text
BC:50:EE:20:4E:11:C9:66:CC:48:E6:EC:0B:D2:5D:7D:5E:07:96:9D:F1:81:99:1C:3D:B4:80:E6:7D:D9:2D:5F
```

The privately stored `axis-release.jks` has been checked locally: it contains
the `axis` private-key entry and its certificate has that exact fingerprint.
The keystore itself, passwords and key properties **must remain outside this
repository** and outside build logs. The keystore was not committed or uploaded
to GitHub. Keep independent secure backups. A fingerprint/Pem certificate alone
cannot sign an app.

The Play account transfer does **not** change this application's package ID,
the app signing certificate used for users' APKs, or the required upload signing
identity. Use the **new** Play Console account for all subsequent versionCode
checks, app release management, permissions, and integrations.

### Build a signed release bundle locally

First run the existing web, modeling and Android checks and review the build on
a real Android device. Do not publish while regression/typecheck checks fail.

Provide the keystore **by absolute local path** and the passwords via local
environment variables, not a checked-in properties file:

```bash
export AXIS_UPLOAD_KEYSTORE="/secure/location/axis-release.jks"
export AXIS_UPLOAD_STORE_PASSWORD="your-local-keystore-password"
export AXIS_UPLOAD_KEY_PASSWORD="your-local-private-key-password"
export AXIS_UPLOAD_KEY_ALIAS="axis"            # optional; defaults to axis
export AXIS_VERSION_CODE="CHOOSE_PLAY_SAFE_INTEGER"
export AXIS_VERSION_NAME="CHOOSE_RELEASE_NAME" # optional

npm ci
npm run android:sync
cd android
./gradlew --no-daemon :app:bundleRelease
```

Replace the placeholders privately. Do not paste passwords into chat, CI logs,
committed shell scripts, or public issue comments. The variables must be set
in the environment where Gradle runs. Use the documented Gradle CLI signing
path; Android Studio's signing wizard is not part of this tested flow.

The Gradle release task **fails closed** if signing material or a version code
is missing, the key is inaccessible, or the certificate SHA-256 differs from
Google Play's approved upload certificate. The resulting **signed** Android App
Bundle, when all checks succeed, is:

`android/app/build/outputs/bundle/release/app-release.aab`

The build does **not** upload or publish anything. Before submitting the AAB
under the **transferred** Play developer account, check all active Play tracks,
confirm the maximum used versionCode, verify the Play Console app package
identifier, and test startup, Library, import/export, Free limitations, and
updating from the currently installed release. Signing an AAB does not imply
that app functionality or distribution requirements have passed review.

### GitHub Actions

The current PR workflow builds a debug APK without release credentials. The
signing key is intentionally **not** added as a GitHub repository file or
Actions artifact; no automatic Play publishing is configured. Use the local
signed-release steps above only once PR checks and Android device tests pass.
If a future approved signing workflow is added, store secrets in a protected
environment with restricted access and no untrusted-PR execution.

## Standalone test behavior

Startup loads the local Library directly, with no account request or backend
service dependency. Login, registration, Pro checkout, promo management, and
cloud backups are temporarily disabled. Free-tier project/tool/triangle limits
still apply; this test does not unlock paid features.

Local model data remains in IndexedDB and its Library index remains in
localStorage, using the original storage identifiers. Reference-image uploads
are kept in project data on-device. Android export uses a registered Capacitor
plugin (AxisFilesPlugin) and ACTION_CREATE_DOCUMENT to open Android's Save As
picker, then writes model bytes directly to the chosen document. Save succeeds
only after Android finishes writing the file. No storage permission or Base44
service is required. Native exports are currently behind the same Free/Pro
entitlement restrictions as the modeling app; this migration does not unlock Pro.

The package ID above is retained exactly. Debug builds use the existing
`.debug` suffix so they can be installed beside the release version. Do not
upload a standalone test artifact to Play without explicit review.

## Adding or changing a bundled image

Put the file in `public/media/` and reference it as `/media/<filename>`.
Vite copies `public/` into `dist` untouched, and `npm run android:sync` copies
`dist` into the APK. Do not point at `media.base44.com` again — anything on
that host disappears when the device is offline.
