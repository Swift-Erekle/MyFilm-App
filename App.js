import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar as SystemNavigationBar } from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import appConfig from './app.json';
import { fetchLatestUpdate } from './src/update.js';

const PRODUCTION_URL = 'https://myfilm-production.up.railway.app';
const CONFIGURED_URL = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || PRODUCTION_URL;
const WEB_APP_URL = `${CONFIGURED_URL.replace(/\/$/, '')}${CONFIGURED_URL.includes('?') ? '&' : '?'}tv=1`;
const ALLOWED_TOP_LEVEL_ORIGINS = new Set([
  new URL(PRODUCTION_URL).origin,
  new URL(CONFIGURED_URL).origin,
]);
const CURRENT_VERSION = String(appConfig?.expo?.version || '0.0.0');
const TV_USER_AGENT_SUFFIX = `MyFilmTV/${CURRENT_VERSION}`;
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

const BRIDGE_BOOTSTRAP = `
  (() => {
    const root = document.documentElement;
    root.classList.add('myfilm-tv-native');

    if (!window.__MYFILM_TV_POINTER_READY__) {
      window.__MYFILM_TV_POINTER_READY__ = true;

      // Android WebView already forwards USB/Bluetooth mouse click, hover and
      // wheel events. Keep the clicked web control focused so users can switch
      // between a mouse and the TV remote without losing their position.
      document.addEventListener('pointerdown', event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        root.classList.add('myfilm-tv-pointer');
        const control = event.target?.closest?.(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[role="link"],[tabindex]:not([tabindex="-1"])',
        );
        control?.focus?.({ preventScroll: true });
      }, true);

      document.addEventListener('keydown', () => {
        root.classList.remove('myfilm-tv-pointer');
      }, true);
    }

    window.dispatchEvent(new CustomEvent('myfilm:navigation'));
    true;
  })();
`;

function isAllowedTopLevelRequest(request) {
  if (request.isTopFrame === false) return true;
  if (request.url === 'about:blank') return true;
  try {
    return ALLOWED_TOP_LEVEL_ORIGINS.has(new URL(request.url).origin);
  } catch {
    return false;
  }
}

function isCurrentTopLevelUrl(url, currentUrl) {
  try {
    const candidate = new URL(url);
    const current = new URL(currentUrl);
    return candidate.origin === current.origin
      && candidate.pathname === current.pathname
      && candidate.search === current.search;
  } catch {
    return false;
  }
}

export default function App() {
  useKeepAwake('myfilm-tv');

  const webViewRef = useRef(null);
  const exitTimerRef = useRef(null);
  const currentUrlRef = useRef(WEB_APP_URL);
  const updateAbortRef = useRef(null);
  const updateCheckInFlightRef = useRef(false);
  const lastUpdateCheckRef = useRef(0);
  const dismissedUpdateTagRef = useRef(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateActionError, setUpdateActionError] = useState('');

  const applyImmersiveMode = useCallback(() => {
    StatusBar.setHidden(true, 'fade');
    if (Platform.OS === 'android') {
      SystemNavigationBar.setHidden(true);
      SystemNavigationBar.setStyle('dark');
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
  }, []);

  const restoreWebFocus = useCallback(() => {
    requestAnimationFrame(() => {
      webViewRef.current?.requestFocus?.();
      webViewRef.current?.injectJavaScript(
        `(window.MyFilmTVNavigation || (typeof MyFilmTVNavigation !== 'undefined' ? MyFilmTVNavigation : null))?.focusInitial?.(); true;`,
      );
    });
  }, []);

  const checkForUpdate = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (updateCheckInFlightRef.current) return;
    if (!force && now - lastUpdateCheckRef.current < UPDATE_CHECK_INTERVAL_MS) return;

    updateCheckInFlightRef.current = true;
    lastUpdateCheckRef.current = now;
    updateAbortRef.current?.abort?.();
    const controller = new AbortController();
    updateAbortRef.current = controller;

    try {
      const availableUpdate = await fetchLatestUpdate(CURRENT_VERSION, {
        signal: controller.signal,
      });
      if (!availableUpdate) return;
      if (dismissedUpdateTagRef.current === availableUpdate.tag) return;
      setUpdateActionError('');
      setUpdateInfo(availableUpdate);
    } catch (updateError) {
      if (updateError?.name !== 'AbortError') {
        // Update checks are intentionally silent when GitHub or the network is
        // temporarily unavailable; the next launch/resume will try again.
      }
    } finally {
      if (updateAbortRef.current === controller) updateAbortRef.current = null;
      updateCheckInFlightRef.current = false;
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    if (updateInfo?.tag) dismissedUpdateTagRef.current = updateInfo.tag;
    setUpdateActionError('');
    setUpdateInfo(null);
    restoreWebFocus();
  }, [restoreWebFocus, updateInfo]);

  const downloadUpdate = useCallback(async () => {
    if (!updateInfo?.downloadUrl) return;
    setUpdateActionError('');
    try {
      const supported = await Linking.canOpenURL(updateInfo.downloadUrl);
      if (!supported) throw new Error('download_url_not_supported');
      dismissedUpdateTagRef.current = updateInfo.tag;
      await Linking.openURL(updateInfo.downloadUrl);
      setUpdateInfo(null);
    } catch {
      setUpdateActionError('ჩამოტვირთვის გახსნა ვერ მოხერხდა. სცადე თავიდან.');
    }
  }, [updateInfo]);

  useEffect(() => {
    applyImmersiveMode();
    checkForUpdate({ force: true });
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        applyImmersiveMode();
        restoreWebFocus();
        checkForUpdate();
      }
    });
    return () => {
      updateAbortRef.current?.abort?.();
      appStateSubscription.remove();
    };
  }, [applyImmersiveMode, checkForUpdate, restoreWebFocus]);

  useEffect(() => {
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!webViewRef.current || error) {
        BackHandler.exitApp();
        return true;
      }

      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => {
        try {
          if (new URL(currentUrlRef.current).pathname !== '/') {
            webViewRef.current?.goBack?.();
            restoreWebFocus();
            return;
          }
        } catch { /* the allowlist already rejects malformed top-level URLs */ }
        BackHandler.exitApp();
      }, 1500);
      webViewRef.current.injectJavaScript(`
        (() => {
          const platform = window.MyFilmPlatform || (typeof MyFilmPlatform !== 'undefined' ? MyFilmPlatform : null);
          if (platform?.handleBack) {
            Promise.resolve(platform.handleBack()).catch(() => {});
          }
          true;
        })();
      `);
      return true;
    });

    return () => {
      clearTimeout(exitTimerRef.current);
      backSubscription.remove();
    };
  }, [error, restoreWebFocus]);

  const handleBridgeMessage = useCallback(event => {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'MYFILM_NAVIGATION' && typeof message.url === 'string') {
      try {
        const nextUrl = new URL(message.url);
        if (ALLOWED_TOP_LEVEL_ORIGINS.has(nextUrl.origin)) currentUrlRef.current = nextUrl.toString();
      } catch { /* ignore malformed route reports */ }
      return;
    }
    if (message.type === 'MYFILM_FULLSCREEN' && typeof message.active === 'boolean') {
      setFullscreen(message.active);
      applyImmersiveMode();
      if (!message.active) restoreWebFocus();
      return;
    }
    if (message.type === 'MYFILM_BACK_RESULT' && typeof message.handled === 'boolean') {
      clearTimeout(exitTimerRef.current);
      if (!message.handled) BackHandler.exitApp();
      else restoreWebFocus();
    }
  }, [applyImmersiveMode, restoreWebFocus]);

  const retry = useCallback(() => {
    clearTimeout(exitTimerRef.current);
    currentUrlRef.current = WEB_APP_URL;
    setFullscreen(false);
    setError(null);
    setLoading(true);
    setWebViewKey(key => key + 1);
  }, []);

  const source = useMemo(() => ({ uri: WEB_APP_URL }), []);

  return (
    <View style={[styles.container, fullscreen && styles.fullscreen]}>
      <StatusBar hidden />
      <WebView
        key={webViewKey}
        ref={webViewRef}
        source={source}
        style={styles.webView}
        containerStyle={styles.webView}
        applicationNameForUserAgent={TV_USER_AGENT_SUFFIX}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_BOOTSTRAP}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        domStorageEnabled
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="never"
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        nestedScrollEnabled
        overScrollMode="never"
        onShouldStartLoadWithRequest={isAllowedTopLevelRequest}
        onMessage={handleBridgeMessage}
        onNavigationStateChange={state => {
          if (state.url) currentUrlRef.current = state.url;
        }}
        onLoadStart={() => {
          setLoading(true);
          setError(null);
        }}
        onLoadEnd={() => {
          setLoading(false);
          applyImmersiveMode();
          restoreWebFocus();
        }}
        onError={event => {
          if (!isCurrentTopLevelUrl(event.nativeEvent.url, currentUrlRef.current)) return;
          setLoading(false);
          setError(event.nativeEvent.description || 'გვერდი ვერ ჩაიტვირთა');
        }}
        onHttpError={event => {
          if (event.nativeEvent.statusCode >= 400
            && isCurrentTopLevelUrl(event.nativeEvent.url, currentUrlRef.current)) {
            setLoading(false);
            setError(`სერვერის შეცდომა: ${event.nativeEvent.statusCode}`);
          }
        }}
        onRenderProcessGone={retry}
      />

      {loading && !error && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#ef1423" />
          <Text style={styles.statusText}>MyFilm იტვირთება…</Text>
        </View>
      )}

      {error && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>MyFilm ვერ ჩაიტვირთა</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            autoFocus
            hasTVPreferredFocus
            onPress={retry}
            style={({ focused }) => [styles.retryButton, focused && styles.retryButtonFocused]}
          >
            <Text style={styles.retryText}>თავიდან ცდა</Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={Boolean(updateInfo)}
        transparent
        animationType="fade"
        onRequestClose={dismissUpdate}
        statusBarTranslucent
      >
        <View style={styles.updateBackdrop}>
          <View style={styles.updateCard}>
            <Text style={styles.updateEyebrow}>MYFILM განახლება</Text>
            <Text style={styles.updateTitle}>ახალი ვერსია ხელმისაწვდომია</Text>
            <Text style={styles.updateVersion}>
              v{CURRENT_VERSION}  →  v{updateInfo?.version || ''}
            </Text>
            <Text style={styles.updateText}>
              ჩამოტვირთე ახალი APK GitHub Releases-დან და დააყენე მიმდინარე ვერსიის განახლებისთვის.
            </Text>
            {updateActionError ? (
              <Text style={styles.updateError}>{updateActionError}</Text>
            ) : null}
            <View style={styles.updateActions}>
              <Pressable
                autoFocus
                hasTVPreferredFocus
                onPress={downloadUpdate}
                style={({ focused }) => [styles.updatePrimaryButton, focused && styles.updateButtonFocused]}
              >
                <Text style={styles.updatePrimaryText}>განახლების ჩამოტვირთვა</Text>
              </Pressable>
              <Pressable
                onPress={dismissUpdate}
                style={({ focused }) => [styles.updateSecondaryButton, focused && styles.updateButtonFocused]}
              >
                <Text style={styles.updateSecondaryText}>მოგვიანებით</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  fullscreen: {
    backgroundColor: '#000000',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 48,
    backgroundColor: '#0a0a0f',
  },
  statusText: {
    color: '#f5f5f7',
    fontSize: 22,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
  },
  errorText: {
    color: '#a8a8b3',
    fontSize: 19,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: '#ef1423',
  },
  retryButtonFocused: {
    borderColor: '#ffffff',
    transform: [{ scale: 1.08 }],
  },
  retryText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  updateBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 56,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  updateCard: {
    width: '100%',
    maxWidth: 760,
    paddingHorizontal: 44,
    paddingVertical: 38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a34',
    backgroundColor: '#111117',
  },
  updateEyebrow: {
    color: '#ef1423',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  updateTitle: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
  },
  updateVersion: {
    marginTop: 14,
    color: '#f0f0f3',
    fontSize: 22,
    fontWeight: '700',
  },
  updateText: {
    marginTop: 16,
    color: '#b7b7c0',
    fontSize: 19,
    lineHeight: 29,
  },
  updateError: {
    marginTop: 14,
    color: '#ff7a84',
    fontSize: 17,
    fontWeight: '700',
  },
  updateActions: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 30,
  },
  updatePrimaryButton: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: '#ef1423',
  },
  updateSecondaryButton: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#3a3a45',
    backgroundColor: '#1b1b22',
  },
  updateButtonFocused: {
    borderColor: '#ffffff',
    transform: [{ scale: 1.06 }],
  },
  updatePrimaryText: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '900',
  },
  updateSecondaryText: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
  },
});
