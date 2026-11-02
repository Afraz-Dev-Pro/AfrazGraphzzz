# AfrazGraphzzz

A phone-first graphing calculator packaged as an Android APK, and also usable as a progressive web app.

## Download the Android app

The installable APK is `build/AfrazGraphzzz-1.1.apk`. Copy it to the phone and open it to install. Android may ask you to allow installs from the app used to open the file. The APK is signed with this project's local debug key so it can be installed directly; keep `android/debug.keystore` if you want to sign future updates with the same key. This debug key is for personal sideloading and must not be used for a public release.

Rebuild on a Windows machine with Android SDK build tools 36.0.0, Android platform 37.2 and a JDK installed:

```powershell
powershell -ExecutionPolicy Bypass -File android/build-apk.ps1
```

## Use on Android

For the web app, serve this folder from any static host over HTTPS, then open its address in Chrome on the phone. Choose **Install app** or **Add to Home screen** in Chrome's menu. The app shell and calculator are cached after the first visit, so graphing works offline. A plain `file://` URL does not support installation or offline caching.

For local development, serve this folder with any static HTTP server, such as `npx serve .`.

## Expressions

Enter an expression in `x`, such as `x^2`, `sin(x)`, `2x`, or `1/(x-2)`. Supported functions include `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sqrt`, `abs`, `ln`, `log` (base 10), `exp`, `floor`, `ceil`, `round`, `sinh`, `cosh`, and `tanh`. Constants: `pi`, `e`. Angles use radians. Analyze a curve to trace values, estimate slopes and integrals, find x-intercepts, or build a value table. Each graph accepts up to 8 equations, each up to 256 characters, to keep rendering responsive.

Use the plus/minus buttons or wheel to zoom; drag to pan; two fingers to pinch zoom. Add more equations to compare curves.
