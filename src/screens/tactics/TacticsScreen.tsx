import { View, Text } from 'react-native';
import { commonStyles, colors, fontSize } from '@/theme';

export function TacticsScreen() {
  return (
    <View style={[commonStyles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.text, fontSize: fontSize.xl }}>Tactics</Text>
    </View>
  );
}
