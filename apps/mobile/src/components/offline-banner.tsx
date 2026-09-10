import { useNetInfo } from '@react-native-community/netinfo';
import { Text, View } from 'react-native';
import { colors, font } from '@/theme/tokens';

export function OfflineBanner() {
  const network = useNetInfo();
  if (network.isConnected !== false && network.isInternetReachable !== false) return null;
  return <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.panel, paddingHorizontal: 16, paddingVertical: 12 }}>
    <Text style={{ color: colors.amber, fontFamily: font.sans }}>You are offline. Your draft will stay here while you reconnect.</Text>
  </View>;
}
