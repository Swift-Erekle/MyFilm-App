import assert from 'node:assert/strict';
import {
  compareVersions,
  normalizeVersion,
  releaseUpdateInfo,
  selectApkAsset,
} from '../src/update.js';

assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
assert.equal(normalizeVersion('MyFilm v2.0.1 TV'), '2.0.1');
assert.equal(compareVersions('1.1.1', '1.1.0'), 1);
assert.equal(compareVersions('1.1.0', '1.1.0'), 0);
assert.equal(compareVersions('1.0.9', '1.1.0'), -1);
assert.equal(compareVersions('2.0', '1.9.9'), 1);

const release = {
  id: 123,
  tag_name: 'v1.1.1',
  name: 'MyFilm TV v1.1.1',
  draft: false,
  prerelease: false,
  published_at: '2026-09-24T00:00:00Z',
  assets: [
    {
      name: 'notes.txt',
      browser_download_url: 'https://github.com/Swift-Erekle/MyFilm-App/releases/download/v1.1.1/notes.txt',
      size: 10,
    },
    {
      name: 'MyFilm-TV.apk',
      browser_download_url: 'https://github.com/Swift-Erekle/MyFilm-App/releases/download/v1.1.1/MyFilm-TV.apk',
      size: 70000000,
    },
  ],
};

assert.equal(selectApkAsset(release)?.name, 'MyFilm-TV.apk');
assert.equal(releaseUpdateInfo(release, '1.1.0')?.version, '1.1.1');
assert.equal(releaseUpdateInfo(release, '1.1.1'), null);
assert.equal(releaseUpdateInfo({ ...release, prerelease: true }, '1.1.0'), null);
assert.equal(releaseUpdateInfo({
  ...release,
  assets: [{
    name: 'MyFilm-TV.apk',
    browser_download_url: 'https://evil.example/MyFilm-TV.apk',
  }],
}, '1.1.0'), null);

console.log(JSON.stringify({ ok: true, current: '1.1.0', next: '1.1.1' }));
