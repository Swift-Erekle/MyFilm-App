const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

module.exports = function withTvLandscape(config) {
  return withDangerousMod(config, [
    'android',
    async androidConfig => {
      const manifestPath = path.join(
        androidConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'AndroidManifest.xml',
      );

      let xml = fs.readFileSync(manifestPath, 'utf8');
      const activityRe = /<activity\b([^>]*android:name=["'][^"']*MainActivity["'][^>]*)>/;

      const match = xml.match(activityRe);
      if (!match) {
        throw new Error('MyFilm TV landscape plugin could not locate MainActivity in generated AndroidManifest.xml');
      }

      let attrs = match[1];
      if (/android:screenOrientation=["'][^"']+["']/.test(attrs)) {
        attrs = attrs.replace(/android:screenOrientation=["'][^"']+["']/, 'android:screenOrientation="landscape"');
      } else {
        attrs += ' android:screenOrientation="landscape"';
      }

      xml = xml.replace(activityRe, `<activity${attrs}>`);
      fs.writeFileSync(manifestPath, xml);
      return androidConfig;
    },
  ]);
};
