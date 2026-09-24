# MyFilm Android TV

This repository contains the Android TV shell for MyFilm. The website/backend lives
in `Swift-Erekle/MyFilm`; this app intentionally stays separate and loads the
same production web application inside a TV-optimized React Native WebView.

## Requirements

- Node.js 22.13 or newer (Expo SDK 57 minimum)
- Yarn 1.22.x
- Android Studio / Android SDK for local native builds

## Local development

Run the MyFilm website locally on its default port `8080`, then in this project:

```powershell
yarn install --frozen-lockfile
$env:EXPO_PUBLIC_WEB_APP_URL = 'http://10.0.2.2:8080'
yarn start:tv
```

`10.0.2.2` is the Android Emulator alias for the host computer. On a physical
Android TV, use the computer's LAN IP instead. The TV config plugin enables
cleartext traffic only when `EXPO_PUBLIC_WEB_APP_URL` explicitly uses `http://`.

The production URL remains:

`https://myfilm-production.up.railway.app`

## Validation

```powershell
yarn check
yarn prebuild:check
```

`yarn check` verifies Expo dependency compatibility and resolves the Expo config.
`yarn prebuild:check` regenerates the Android TV native project without installing
dependencies so config-plugin failures are caught early.

## Builds

```powershell
yarn build:tv:preview
yarn build:tv:production
```

Both EAS profiles set `EXPO_TV=1`. The production build keeps Android package
`com.myfilm.app`, the existing EAS project ID, and the account's Android signing
identity. A local Gradle release can be built with `yarn build:tv:local`; that
artifact is for device testing and is not a substitute for the production-signed
EAS artifact.

The public TV release belongs to this repository:

`https://github.com/Swift-Erekle/MyFilm-App/releases/download/v1.1.0/MyFilm-TV.apk`

The v1.1.0 migration workflow copies the already tested APK from the legacy
`MyFilm` release and verifies SHA-256 before publishing it here. Future TV
releases should be published only from `MyFilm-App`.

## TV controls

- D-pad moves focus between visible controls.
- Enter/Play activates the focused item.
- USB/Bluetooth mouse click, hover and wheel scrolling are supported.
- Back exits fullscreen first, then closes transient web UI, then navigates back.
- Back exits the app only from the web application's root.
- Playback/provider logic remains in the shared website, so provider fixes apply
  to both the PWA and Android TV shell.
