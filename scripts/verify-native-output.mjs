import fs from 'node:fs';

function fail(message) {
  console.error(`native_output_check_failed: ${message}`);
  process.exit(1);
}

function read(path) {
  if (!fs.existsSync(path)) fail(`missing generated file: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function tags(name, xml) {
  return xml.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) || [];
}

function tagHas(tag, key, value) {
  return tag.includes(`${key}="${value}"`) || tag.includes(`${key}='${value}'`);
}

function hasTag(name, attributes, xml) {
  return tags(name, xml).some(tag => Object.entries(attributes).every(([key, value]) => tagHas(tag, key, value)));
}

function pngSize(path) {
  if (!fs.existsSync(path)) fail(`missing PNG asset: ${path}`);
  const buffer = fs.readFileSync(path);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    fail(`invalid PNG asset: ${path}`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const buildGradlePath = 'android/app/build.gradle';
const manifest = read(manifestPath);
const buildGradle = read(buildGradlePath);

if (!manifest.includes('android.intent.category.LEANBACK_LAUNCHER')) fail('Android TV LEANBACK_LAUNCHER intent is missing');
if (!/android:banner=/.test(manifest)) fail('Android TV application banner is missing');
if (!hasTag('uses-permission', { 'android:name': 'android.permission.INTERNET' }, manifest)) fail('Android INTERNET permission is missing');
if (!hasTag('uses-feature', { 'android:name': 'android.software.leanback' }, manifest)) fail('Android TV leanback feature declaration is missing');
if (!hasTag('uses-feature', { 'android:name': 'android.hardware.touchscreen', 'android:required': 'false' }, manifest)) fail('touchscreen must be optional for Android TV');
const fakeTouchTags = tags('uses-feature', manifest).filter(tag => tagHas(tag, 'android:name', 'android.hardware.faketouch'));
if (fakeTouchTags.some(tag => !tagHas(tag, 'android:required', 'false'))) fail('faketouch must not be required for Android TV');
if (!/android:screenOrientation=["']landscape["']/.test(manifest)) {
  fail(`TV MainActivity is not explicitly locked to landscape; activities=${tags('activity', manifest).join(' || ')}`);
}
if (/android:usesCleartextTraffic=["']true["']/.test(manifest)) fail('production prebuild unexpectedly enables cleartext traffic');
if (!/applicationId\s+["']com\.myfilm\.app["']/.test(buildGradle)) fail('Android applicationId is not com.myfilm.app');
if (!/namespace\s+["']com\.myfilm\.app["']/.test(buildGradle)) fail('Android namespace is not com.myfilm.app');

const banner = pngSize('assets/tv-banner.png');
if (banner.width !== 320 || banner.height !== 180) {
  fail(`Android TV banner must be 320x180, got ${banner.width}x${banner.height}`);
}

console.log(JSON.stringify({
  ok: true,
  checks: [
    'leanback launcher', 'leanback feature', 'touchscreen optional', 'faketouch not required',
    'TV banner 320x180', 'INTERNET permission', 'landscape orientation',
    'production cleartext disabled', 'applicationId', 'namespace',
  ],
}));
