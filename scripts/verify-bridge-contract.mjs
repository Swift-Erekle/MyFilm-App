import fs from 'node:fs';
import path from 'node:path';

const siteRoot = process.argv[2];
if (!siteRoot) {
  console.error('usage: node scripts/verify-bridge-contract.mjs <site-repo-path>');
  process.exit(2);
}

const appSource = fs.readFileSync('App.js', 'utf8');
const platformSource = fs.readFileSync(path.join(siteRoot, 'website/js/platform.js'), 'utf8');
const tvNavigationSource = fs.readFileSync(path.join(siteRoot, 'website/js/tv-navigation.js'), 'utf8');

const requiredMessages = ['MYFILM_FULLSCREEN', 'MYFILM_BACK_RESULT'];
for (const message of requiredMessages) {
  if (!appSource.includes(message)) throw new Error(`App.js does not handle ${message}`);
  if (!platformSource.includes(message)) throw new Error(`website platform bridge does not emit ${message}`);
}

for (const token of ['MyFilmTV/1.1.0', 'onRenderProcessGone={retry}', 'mixedContentMode="never"', 'setSupportMultipleWindows={false}']) {
  if (!appSource.includes(token)) throw new Error(`App.js contract missing: ${token}`);
}
if (!tvNavigationSource.includes('MyFilmTV')) throw new Error('TV navigation does not recognize the native TV user agent');
if (!tvNavigationSource.includes('MyFilmPlatform.handleBack()')) throw new Error('TV Back key is not delegated to the shared platform bridge');
if (!platformSource.includes('history.back()')) throw new Error('website bridge cannot navigate back from a detail route');
if (!platformSource.includes('closeTransientUi()')) throw new Error('website bridge cannot close transient UI before navigation');

console.log(JSON.stringify({ ok: true, messages: requiredMessages }));
