# MyFilm Android TV

This project is the Android TV shell for MyFilm. Phones install the PWA from the
website; this project intentionally targets Android TV only and loads the same
Railway web application and provider/player backend.

## Development

Use Node.js 20+ and Yarn 1.x.

```powershell
yarn install
$env:EXPO_TV = '1'
$env:EXPO_PUBLIC_WEB_APP_URL = 'http://10.0.2.2:3000'
yarn start:tv
```

`EXPO_PUBLIC_WEB_APP_URL` may be any trusted MyFilm development origin. The
production profile uses `https://myfilm-production.up.railway.app`.

## Builds

```powershell
yarn build:tv:preview
yarn build:tv:production
```

Both commands set `EXPO_TV=1`. The production build keeps package
`com.myfilm.app`, the existing EAS project ID, and the account's Android signing
identity. A local Gradle release can be built with `yarn build:tv:local`; that
artifact is suitable for device testing but is not a production-signed release.

The public release asset name is `MyFilm-TV.apk`, published at:

`https://github.com/Swift-Erekle/MyFilm/releases/download/v1.1.0/MyFilm-TV.apk`

## TV controls

- D-pad moves focus between visible controls.
- Enter/Play activates the focused item.
- A USB or Bluetooth mouse supports pointer movement, click, hover, and wheel
  scrolling; the last clicked control remains ready for D-pad navigation.
- Back exits fullscreen first, then closes a player/menu/modal, then navigates
  back. Back exits the app only from the web application's root.
- Playback and fullscreen behavior live in the shared website, so provider fixes
  apply to the PWA and TV app together.
