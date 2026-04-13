import { View, Text } from 'react-native';
import { commonStyles, colors, fontSize } from '@/theme';

export function NewGameScreen() {
  return (
    <View style={[commonStyles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.text, fontSize: fontSize.xl }}>New Game</Text>
    </View>
  );
}
