import { View, Text } from 'react-native';
import { commonStyles, colors, fontSize } from '@/theme';

export function HomeScreen() {
  return (
    <View style={[commonStyles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.text, fontSize: fontSize.xl }}>Home</Text>
    </View>
  );
}
