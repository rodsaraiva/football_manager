import { View, Text } from 'react-native';
import { commonStyles, colors, fontSize } from '@/theme';

export function ClubOverviewScreen() {
  return (
    <View style={[commonStyles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.text, fontSize: fontSize.xl }}>Club</Text>
    </View>
  );
}
