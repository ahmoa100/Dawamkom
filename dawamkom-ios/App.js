import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

const origin = 'https://www.dawamkom.net';
const entry = { uri: origin + '/' };
const employeePath = /^\/company\/[a-f0-9-]{36}\/employee\/?$/i;
const isEmployeePage = url => typeof url === 'string' && url.startsWith(origin + '/') &&
  employeePath.test(url.slice(origin.length).split(/[?#]/, 1)[0]);

const locationBridge = `
  if (location.origin === ${JSON.stringify(origin)} && ${employeePath}.test(location.pathname)) {
    const pending = new Map();
    window.dawamkomLocationResult = (id, result) => {
      const callback = pending.get(id);
      if (!callback) return;
      pending.delete(id);
      clearTimeout(callback.timer);
      if (result.coords) callback.success(result);
      else callback.failure?.(result.error);
    };
    navigator.geolocation.getCurrentPosition = (success, failure, options) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => window.dawamkomLocationResult(id, {
        error: {code: 3, message: 'Location request timed out'}
      }), options?.timeout ?? 30000);
      pending.set(id, { success, failure, timer });
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'attendance-location', id}));
    };
  }
  true;
`;

async function attendancePosition() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { error: {code: 1, message: 'Location permission denied'} };
  const { coords, timestamp } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { coords, timestamp };
}

function Dawamkom() {
  const web = useRef(null);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);

  async function handleMessage({ nativeEvent }) {
    if (!isEmployeePage(nativeEvent.url)) return;
    let message;
    try { message = JSON.parse(nativeEvent.data); }
    catch { return; }
    if (message?.type !== 'attendance-location' || typeof message.id !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(message.id)) return;
    let result;
    try { result = await attendancePosition(); }
    catch { result = { error: {code: 2, message: 'Position unavailable'} }; }
    web.current?.injectJavaScript(
      'window.dawamkomLocationResult?.(' + JSON.stringify(message.id) + ',' + JSON.stringify(result) + '); true;'
    );
  }

  function openExternal(url) {
    if (url?.startsWith('https://')) void Linking.openURL(url).catch(() => {});
  }

  return <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <WebView key={revision} ref={web} source={entry} style={styles.screen}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={request => {
        if (request.url.startsWith(origin + '/')) return true;
        if (request.navigationType === 'click') openExternal(request.url);
        return false;
      }}
      onOpenWindow={({ nativeEvent }) => openExternal(nativeEvent.targetUrl)}
      injectedJavaScript={locationBridge}
      onMessage={handleMessage}
      startInLoadingState
      renderLoading={() => <ActivityIndicator style={styles.indicator} color="#80caac" accessibilityLabel="جارٍ التحميل" />}
      onError={() => setFailed(true)}
      onHttpError={({ nativeEvent }) => {
        if (nativeEvent.statusCode >= 500 && nativeEvent.url === entry.uri) setFailed(true);
      }}
      onContentProcessDidTerminate={() => web.current?.reload()}
    />
    {failed && <View style={styles.recovery}>
      <Text style={styles.message}>تعذّر الاتصال بدوامكم.</Text>
      <Pressable accessibilityRole="button" style={styles.retry} onPress={() => {
        setFailed(false);
        setRevision(value => value + 1);
      }}><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable>
    </View>}
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><Dawamkom /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111d22' },
  indicator: { ...StyleSheet.absoluteFillObject },
  recovery: { ...StyleSheet.absoluteFillObject, backgroundColor: '#111d22', justifyContent: 'center', alignItems: 'center', gap: 16 },
  message: { color: '#eef8f8', fontSize: 17 },
  retry: { borderRadius: 10, backgroundColor: '#80caac', paddingVertical: 12, paddingHorizontal: 22 },
  retryText: { color: '#112823', fontSize: 16, fontWeight: '700' },
});
