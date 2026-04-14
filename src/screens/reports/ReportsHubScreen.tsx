import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { RootStackParamList } from '@/navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface HubCardProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent: string;
}

function HubCard({ icon, title, subtitle, onPress, accent }: HubCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: accent },
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function ReportsHubScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Relatórios</Text>
        <Text style={styles.headerSub}>Análises da comissão técnica</Text>
      </View>

      <HubCard
        icon="📋"
        title="Assistente Técnico"
        subtitle="Forma, evolução, quem merece chance"
        accent={colors.primary}
        onPress={() => navigation.navigate('ReportsTechnical')}
      />
      <HubCard
        icon="💰"
        title="Assistente Financeiro"
        subtitle="Lucro, saldo de transferências, folha"
        accent={colors.success}
        onPress={() => navigation.navigate('ReportsFinancial')}
      />
      <HubCard
        icon="📊"
        title="Analista de Dados"
        subtitle="Comparações com o resto da liga"
        accent={colors.accent}
        onPress={() => navigation.navigate('ReportsAnalytics')}
      />
      <HubCard
        icon="🌱"
        title="Analista Sub-21"
        subtitle="Talentos jovens em detalhe"
        accent={colors.gold}
        onPress={() => navigation.navigate('ReportsYouth')}
      />

      <View style={styles.secondary}>
        <HubCard
          icon="🏆"
          title="Tabela da Liga"
          subtitle="Classificação atualizada"
          accent={colors.primaryLight}
          onPress={() => navigation.navigate('LeagueStandings')}
        />
        <HubCard
          icon="📜"
          title="History"
          subtitle="Past champions, awards & records"
          accent={colors.gold}
          onPress={() => navigation.navigate('SeasonHistory')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  headerSub: {
    color: colors.primary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  cardPressed: { backgroundColor: colors.surfaceLight },
  icon: {
    fontSize: 26,
    width: 40,
    textAlign: 'center',
    marginRight: spacing.sm,
  },
  content: { flex: 1 },
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: fontSize.xxl,
    marginLeft: spacing.sm,
  },
  secondary: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});
