const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withTvLandscape(config) {
  return withAndroidManifest(config, androidConfig => {
    const manifest = androidConfig.modResults.manifest;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    mainActivity.$ = mainActivity.$ || {};
    mainActivity.$['android:screenOrientation'] = 'landscape';
    return androidConfig;
  });
};
