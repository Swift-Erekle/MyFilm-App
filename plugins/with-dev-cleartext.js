const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withDevCleartext(config) {
  return withAndroidManifest(config, androidConfig => {
    const developmentUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || '';
    const application = androidConfig.modResults.manifest.application?.[0];
    if (!application?.$) return androidConfig;

    if (/^http:\/\//i.test(developmentUrl)) {
      application.$['android:usesCleartextTraffic'] = 'true';
    } else {
      delete application.$['android:usesCleartextTraffic'];
    }
    return androidConfig;
  });
};
