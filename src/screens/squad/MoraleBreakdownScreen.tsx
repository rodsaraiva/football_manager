import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, commonStyles, spacing } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getPlayerById } from '@/database/queries/players';
import { getMoraleEvents, getChemistryGroups } from '@/database/queries/morale';
import type { MoraleDriver } from '@/engine/morale/driver-ledger';
import type { ChemistryGroup } from '@/engine/morale/chemistry';
import type { Player, PlayerAttributes } from '@/types';
import { RootStackParamList } from '@/navigation/types';
import { Card, Badge, EmptyState } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Title, Body, Label, Caption } from '@/components/typography';

type BreakdownRoute = RouteProp<RootStackParamList, 'MoraleBreakdown'>;

function fmtDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

export function MoraleBreakdownScreen() {
  const route = useRoute<BreakdownRoute>();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const accent = useClubAccent();
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const playerId = route.params.playerId;

  const [player, setPlayer] = useState<(Player & { attributes: PlayerAttributes }) | null>(null);
  const [events, setEvents] = useState<MoraleDriver[]>([]);
  const [groups, setGroups] = useState<ChemistryGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle || saveId == null) return;
    let cancelled = false;
    (async () => {
      const [p, ev] = await Promise.all([
        getPlayerById(dbHandle, saveId, playerId),
        getMoraleEvents(dbHandle, saveId, playerId, 20),
      ]);
      const gs = p?.clubId != null ? await getChemistryGroups(dbHandle, saveId, p.clubId) : [];
      if (!cancelled) {
        setPlayer(p);
        setEvents(ev);
        setGroups(gs);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dbHandle, saveId, playerId]);

  if (loading || !player) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const myGroup = groups.find((g) => g.memberIds.includes(playerId));

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content}>
      <Pressable
        onPress={() => navigation.goBack()}
        testID="morale-breakdown-back"
        accessibilityLabel={t('playerdetail.back')}
        style={styles.back}
      >
        <Label color={accent.accent}>{t('playerdetail.back')}</Label>
      </Pressable>

      <Title>{t('psychology.title')}</Title>
      <Body color={colors.textSecondary} style={styles.name}>{player.name}</Body>

      <Card variant="detail" accent={accent.accent} style={styles.section}>
        <View style={styles.badgeRow}>
          <Badge value={t(('psychology.archetype_' + player.personality) as TKey)} tone="primary" size="sm" />
          <Badge
            value={t(('psychology.fallout_' + player.falloutState) as TKey)}
            tone={player.falloutState === 'wantsOut' ? 'danger' : player.falloutState === 'unsettled' ? 'warning' : 'success'}
            size="sm"
          />
        </View>
        <View style={styles.moraleBar}>
          <StatBar label={t('morale.label')} value={player.morale} maxValue={100} />
        </View>
        {myGroup && (
          <Caption color={colors.textMuted} style={styles.chem}>
            {t('psychology.chemistry_group', { cohesion: Math.round(myGroup.cohesion * 100) })}
          </Caption>
        )}
      </Card>

      {events.length === 0 ? (
        <EmptyState art="generic" title={t('psychology.empty')} accent={accent.accent} />
      ) : (
        <Card variant="detail" accent={accent.accent} style={styles.section}>
          {events.map((e, i) => (
            <View key={i} style={styles.driverRow} testID="morale-driver-row">
              <Body>{t(('psychology.driver_' + e.kind) as TKey)}</Body>
              <Label color={e.delta >= 0 ? colors.success : colors.danger}>{fmtDelta(e.delta)}</Label>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  back: { marginBottom: spacing.sm },
  name: { marginBottom: spacing.md },
  section: { marginTop: spacing.md },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  moraleBar: { marginTop: spacing.md },
  chem: { marginTop: spacing.sm },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
