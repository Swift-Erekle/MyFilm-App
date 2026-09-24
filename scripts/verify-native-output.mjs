import fs from 'node:fs';

function fail(message) {
  console.error(`native_output_check_failed: ${message}`);
  process.exit(1);
}

function read(path) {
  if (!fs.existsSync(path)) fail(`missing generated file: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const buildGradlePath = 'android/app/build.gradle';
const manifest = read(manifestPath);
const buildGradle = read(buildGradlePath);

if (!manifest.includes('android.intent.category.LEANBACK_LAUNCHER')) {
  fail('Android TV LEANBACK_LAUNCHER intent is missing');
}
if (!/android:banner=/.test(manifest)) {
  fail('Android TV application banner is missing');
}
if (!/android:screenOrientation=["']landscape["']/.test(manifest)) {
  fail('MainActivity is not locked to landscape');
}
if (/android:usesCleartextTraffic=["']true["']/.test(manifest)) {
  fail('production prebuild unexpectedly enables cleartext traffic');
}
if (!/applicationId\s+["']com\.myfilm\.app["']/.test(buildGradle)) {
  fail('Android applicationId is not com.myfilm.app');
}
if (!/namespace\s+["']com\.myfilm\.app["']/.test(buildGradle)) {
  fail('Android namespace is not com.myfilm.app');
}

console.log(JSON.stringify({
  ok: true,
  checks: [
    'leanback launcher',
    'TV banner',
    'landscape orientation',
    'production cleartext disabled',
    'applicationId',
    'namespace',
  ],
}));
