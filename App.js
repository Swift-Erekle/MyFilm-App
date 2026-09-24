import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
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

const PRODUCTION_URL = 'https://myfilm-production.up.railway.app';
const CONFIGURED_URL = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || PRODUCTION_URL;
const WEB_APP_URL = `${CONFIGURED_URL.replace(/\/$/, '')}${CONFIGURED_URL.includes('?') ? '&' : '?'}tv=1`;
const ALLOWED_TOP_LEVEL_ORIGINS = new Set([
  new URL(PRODUCTION_URL).origin,
  new URL(CONFIGURED_URL).origin,
]);
const TV_USER_AGENT_SUFFIX = 'MyFilmTV/1.1.0';

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
  const [webViewKey, setWebViewKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

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

  useEffect(() => {
    applyImmersiveMode();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        applyImmersiveMode();
        restoreWebFocus();
      }
    });
    return () => appStateSubscription.remove();
  }, [applyImmersiveMode, restoreWebFocus]);

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
});
