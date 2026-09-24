import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function fail(message) {
  console.error(`apk_check_failed: ${message}`);
  process.exit(1);
}

const apkPath = 'android/app/build/outputs/apk/release/app-release.apk';
if (!fs.existsSync(apkPath)) fail(`missing release APK: ${apkPath}`);
const stat = fs.statSync(apkPath);
if (stat.size < 1000000) fail(`release APK is unexpectedly small: ${stat.size} bytes`);

let entries;
try {
  entries = execFileSync('unzip', ['-Z1', apkPath], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
} catch (error) {
  fail(`cannot inspect release APK: ${error instanceof Error ? error.message : String(error)}`);
}

for (const required of ['AndroidManifest.xml', 'classes.dex', 'resources.arsc', 'assets/index.android.bundle']) {
  if (!entries.includes(required)) fail(`release APK is missing ${required}`);
}

console.log(JSON.stringify({
  ok: true, apkPath, bytes: stat.size,
  checks: ['binary manifest', 'DEX bytecode', 'Android resources', 'React Native JS bundle'],
}));
