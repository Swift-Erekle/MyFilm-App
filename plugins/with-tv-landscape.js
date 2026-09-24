const { withAndroidManifest } = require('@expo/config-plugins');

function isMainIntent(activity) {
  return (activity?.['intent-filter'] || []).some(filter =>
    (filter?.action || []).some(action => action?.$?.['android:name'] === 'android.intent.action.MAIN')
  );
}

module.exports = function withTvLandscape(config) {
  return withAndroidManifest(config, androidConfig => {
    const application = androidConfig.modResults.manifest.application?.[0];
    const activities = application?.activity || [];
    const mainActivity = activities.find(activity =>
      String(activity?.$?.['android:name'] || '').endsWith('MainActivity')
    ) || activities.find(isMainIntent);

    if (!mainActivity) {
      throw new Error('MyFilm TV landscape plugin could not locate the Android main activity');
    }

    mainActivity.$ = mainActivity.$ || {};
    mainActivity.$['android:screenOrientation'] = 'landscape';
    return androidConfig;
  });
};
