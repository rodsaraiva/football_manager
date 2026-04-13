import { View, Text } from 'react-native';
import { commonStyles, colors, fontSize } from '@/theme';

export function MainMenuScreen() {
  return (
    <View style={[commonStyles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.text, fontSize: fontSize.xxl, fontWeight: 'bold' }}>Football Manager</Text>
      <Text style={{ color: colors.textSecondary, fontSize: fontSize.md, marginTop: 8 }}>Main Menu</Text>
    </View>
  );
}
