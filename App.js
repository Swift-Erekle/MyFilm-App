import React from 'react';
import { StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';

// შეცვალე ეს ლინკი შენი ჰოსტინგის ლინკით, როცა საიტს ატვირთავ ინტერნეტში!
const WEB_APP_URL = 'https://myfilm-production.up.railway.app'; 

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <WebView
        source={{ uri: WEB_APP_URL }}
        style={styles.webview}
        allowsFullscreenVideo={true}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        // Pretending to be a standard Chrome browser helps avoid issues with iframe players blocking Mobile WebViews
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
});
