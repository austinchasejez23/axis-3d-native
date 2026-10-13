# AXIS 3D — native Android build

This repo now carries a Capacitor wrapper. The web app is unchanged; `android/`
is a normal Android Studio project that loads the built site from inside the
APK instead of over the network.

## Build it

You need Android Studio (and a JDK 21, which Android Studio bundles). None of
that exists in the Base44 sandbox, so this has to be done on your machine.

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

**versionCode 25** — Play refuses an upload whose versionCode is not higher
than the live one, and the current listing is on 24. Raise it by one for every
upload, in `android/app/build.gradle`.

**App name: AXIS 3D.** `strings.xml`.

**targetSdk 36, minSdk 24.** Above Play's current floor; Android 7.0 and up.

## The signing question — settle this before uploading

The listing's existing APK was built by the Wix shell and signed with its
upload key. Play will only accept an update signed with that same upload key.
If you do not have it, there are two ways forward:

1. Ask Play support for an **upload key reset**. You keep the listing, its
   installs and its reviews. This is the normal route and takes a few days.
2. Publish under a new package id as a new listing. Immediate, but you start
   from zero on installs and ratings.

Nothing here forces that decision — the package id is one line if you change
your mind.

## What still needs a connection

Projects already live on the device (IndexedDB), so modelling, saving and
opening work with no network. These do not:

- **Sign-in, Pro entitlement, cloud backup, promo codes, the contact form** —
  all go through the Base44 SDK.
- **Texture presets and reflection environments** — their images are fetched
  from `media.base44.com`.
- **The AXIS logo** on the splash and sign-in screens — same host. The splash
  *video* is bundled locally and plays offline.

If you want a fully offline app, the next piece of work is downloading those
images into the repo and letting the modeler run without an account.
