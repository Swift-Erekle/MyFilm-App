export const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/Swift-Erekle/MyFilm-App/releases/latest';

const EXPECTED_REPOSITORY_PATH = '/Swift-Erekle/MyFilm-App/releases/download/';

export function normalizeVersion(value) {
  const match = String(value || '').trim().match(/v?(\d+(?:\.\d+){0,3})/i);
  return match ? match[1] : '';
}

export function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').filter(Boolean).map(Number);
  const b = normalizeVersion(right).split('.').filter(Boolean).map(Number);
  if (!a.length || !b.length) return 0;
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] || 0;
    const bv = b[index] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function trustedDownloadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith(EXPECTED_REPOSITORY_PATH);
  } catch {
    return false;
  }
}

export function selectApkAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const apkAssets = assets.filter(asset =>
    typeof asset?.name === 'string'
    && /\.apk$/i.test(asset.name)
    && trustedDownloadUrl(asset.browser_download_url)
  );
  return apkAssets.find(asset => asset.name === 'MyFilm-TV.apk') || apkAssets[0] || null;
}

export function releaseUpdateInfo(release, currentVersion) {
  if (!release || release.draft || release.prerelease) return null;
  const version = normalizeVersion(release.tag_name || release.name);
  if (!version || compareVersions(version, currentVersion) <= 0) return null;

  const asset = selectApkAsset(release);
  if (!asset) return null;

  return {
    releaseId: release.id,
    tag: String(release.tag_name || ''),
    version,
    title: String(release.name || release.tag_name || `MyFilm v${version}`),
    downloadUrl: asset.browser_download_url,
    assetName: asset.name,
    assetSize: Number(asset.size) || 0,
    publishedAt: release.published_at || null,
  };
}

export async function fetchLatestUpdate(currentVersion, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(GITHUB_LATEST_RELEASE_API, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal,
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub Releases HTTP ${response.status}`);

  const release = await response.json();
  return releaseUpdateInfo(release, currentVersion);
}
