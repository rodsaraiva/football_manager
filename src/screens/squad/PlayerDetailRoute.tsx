import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, commonStyles } from '@/theme';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getPlayerById } from '@/database/queries/players';
import { Player, PlayerAttributes } from '@/types';
import { RootStackParamList } from '@/navigation/types';
import PlayerDetailScreen from './PlayerDetailScreen';

type DetailRoute = RouteProp<RootStackParamList, 'PlayerDetail'>;

export function PlayerDetailRoute() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation();
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const playerId = route.params.playerId;

  const [player, setPlayer] = useState<(Player & { attributes: PlayerAttributes }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle || saveId == null) return;
    let cancelled = false;
    (async () => {
      const loaded = await getPlayerById(dbHandle, saveId, playerId);
      if (!cancelled) {
        setPlayer(loaded);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbHandle, saveId, playerId]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <PlayerDetailScreen player={player} onBack={() => navigation.goBack()} />;
}
