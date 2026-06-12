import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/i18n';

export type OfferKind = 'transfer' | 'loan';

export interface OfferModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    fee: number,
    wage: number,
    kind: OfferKind,
    loanDurationSeasons?: number,
  ) => void | Promise<void>;
  playerName: string;
  playerPosition: string;
  playerAge: number;
  playerOverall: number;
  marketValue: number;
  currentWage: number;
  buyerBudget: number;
  currentSeason: number;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function parseNumber(input: string): number {
  const cleaned = input.replace(/[^0-9]/g, '');
  return cleaned === '' ? 0 : parseInt(cleaned, 10);
}

export function OfferModal({
  visible,
  onClose,
  onSubmit,
  playerName,
  playerPosition,
  playerAge,
  playerOverall,
  marketValue,
  currentWage,
  buyerBudget,
  currentSeason,
}: OfferModalProps) {
  const { t } = useTranslation();
  const suggestedFee = Math.round(marketValue * 1.05);
  const suggestedWage = Math.round(currentWage * 1.1);
  // Loan fee is typically 10-20% of market value
  const suggestedLoanFee = Math.round(marketValue * 0.12);

  const [kind, setKind] = useState<OfferKind>('transfer');
  const [feeStr, setFeeStr] = useState(String(suggestedFee));
  const [wageStr, setWageStr] = useState(String(suggestedWage));
  const [loanSeasons, setLoanSeasons] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Reset fields when modal re-opens for a different player
  React.useEffect(() => {
    if (visible) {
      setKind('transfer');
      setFeeStr(String(suggestedFee));
      setWageStr(String(suggestedWage));
      setLoanSeasons(1);
    }
  }, [visible, suggestedFee, suggestedWage]);

  // When switching kind, update fee suggestion
  React.useEffect(() => {
    if (kind === 'loan') {
      setFeeStr(String(suggestedLoanFee));
    } else {
      setFeeStr(String(suggestedFee));
    }
  }, [kind, suggestedLoanFee, suggestedFee]);

  const fee = useMemo(() => parseNumber(feeStr), [feeStr]);
  const wage = useMemo(() => parseNumber(wageStr), [wageStr]);

  const feeRatio = marketValue > 0 ? fee / marketValue : 0;
  const insufficientBudget = fee > buyerBudget;
  const feeTooLow = kind === 'transfer' && fee < marketValue * 0.5;

  const handleSubmit = async () => {
    if (insufficientBudget) {
      Alert.alert(t('transfer.alert_budget_title'), t('transfer.alert_budget_msg', { budget: formatMoney(buyerBudget), offer: formatMoney(fee) }));
      return;
    }
    if (fee < 0) {
      Alert.alert(t('transfer.alert_fee_title'), t('transfer.alert_fee_msg'));
      return;
    }
    if (wage <= 0) {
      Alert.alert(t('transfer.alert_wage_title'), t('transfer.alert_wage_msg'));
      return;
    }
    setSubmitting(true);
    try {
      if (kind === 'loan') {
        await onSubmit(fee, wage, 'loan', loanSeasons);
      } else {
        await onSubmit(fee, wage, 'transfer');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Text style={styles.title}>{t('transfer.make_offer')}</Text>

            {/* Type toggle */}
            <View style={styles.kindRow}>
              <Pressable
                style={[styles.kindTab, kind === 'transfer' && styles.kindTabActive]}
                onPress={() => setKind('transfer')}
              >
                <Text style={[styles.kindTabText, kind === 'transfer' && styles.kindTabTextActive]}>
                  {t('transfer.kind_transfer')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.kindTab, kind === 'loan' && styles.kindTabActive]}
                onPress={() => setKind('loan')}
              >
                <Text style={[styles.kindTabText, kind === 'loan' && styles.kindTabTextActive]}>
                  {t('transfer.kind_loan')}
                </Text>
              </Pressable>
            </View>

            {/* Player info */}
            <View style={styles.playerCard}>
              <Text style={styles.playerName}>{playerName}</Text>
              <Text style={styles.playerMeta}>
                {t('transfer.player_meta', { position: playerPosition, age: playerAge, ovr: playerOverall })}
              </Text>
              <View style={styles.playerStats}>
                <View style={styles.playerStat}>
                  <Text style={styles.playerStatLabel}>{t('transfer.market_value')}</Text>
                  <Text style={styles.playerStatValue}>{formatMoney(marketValue)}</Text>
                </View>
                <View style={styles.playerStat}>
                  <Text style={styles.playerStatLabel}>{t('transfer.current_wage')}</Text>
                  <Text style={styles.playerStatValue}>{formatMoney(currentWage)}/wk</Text>
                </View>
              </View>
            </View>

            {/* Fee input */}
            <Text style={styles.fieldLabel}>{kind === 'loan' ? t('transfer.loan_fee') : t('transfer.transfer_fee')}</Text>
            <TextInput
              style={[
                styles.input,
                insufficientBudget && styles.inputError,
                feeTooLow && !insufficientBudget && styles.inputWarning,
              ]}
              value={feeStr}
              onChangeText={setFeeStr}
              keyboardType="numeric"
              placeholder={t('transfer.fee_placeholder')}
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.helperRow}>
              <Text style={styles.helperText}>{formatMoney(fee)}</Text>
              <Text style={[styles.helperText, feeRatioColor(feeRatio)]}>
                {t('transfer.pct_of_market', { pct: Math.round(feeRatio * 100) })}
              </Text>
            </View>
            {insufficientBudget && (
              <Text style={styles.errorText}>
                {t('transfer.exceeds_budget', { budget: formatMoney(buyerBudget) })}
              </Text>
            )}

            {/* Wage input */}
            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('transfer.weekly_wage')}</Text>
            <TextInput
              style={styles.input}
              value={wageStr}
              onChangeText={setWageStr}
              keyboardType="numeric"
              placeholder={t('transfer.wage_placeholder')}
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.helperRow}>
              <Text style={styles.helperText}>{formatMoney(wage)}/wk</Text>
              <Text style={styles.helperText}>
                {currentWage > 0 ? t('transfer.pct_of_current', { pct: Math.round((wage / currentWage) * 100) }) : ''}
              </Text>
            </View>

            {/* Loan duration (only when kind = loan) */}
            {kind === 'loan' && (
              <>
                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('transfer.loan_duration')}</Text>
                <View style={styles.presets}>
                  {[1, 2].map((yr) => (
                    <Pressable
                      key={yr}
                      style={[styles.preset, loanSeasons === yr && styles.presetActive]}
                      onPress={() => setLoanSeasons(yr)}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          loanSeasons === yr && styles.presetTextActive,
                        ]}
                      >
                        {t(yr > 1 ? 'transfer.seasons_other' : 'transfer.seasons_one', { n: yr })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.helperText}>
                  {t('transfer.loan_returns', { season: currentSeason + loanSeasons })}
                </Text>
              </>
            )}

            {/* Preset buttons */}
            <View style={styles.presets}>
              <Pressable
                style={styles.preset}
                onPress={() => setFeeStr(String(marketValue))}
              >
                <Text style={styles.presetText}>{t('transfer.market_value')}</Text>
              </Pressable>
              <Pressable
                style={styles.preset}
                onPress={() => setFeeStr(String(Math.round(marketValue * 1.1)))}
              >
                <Text style={styles.presetText}>+10%</Text>
              </Pressable>
              <Pressable
                style={styles.preset}
                onPress={() => setFeeStr(String(Math.round(marketValue * 1.25)))}
              >
                <Text style={styles.presetText}>+25%</Text>
              </Pressable>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={submitting}>
                <Text style={styles.btnSecondaryText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary, (insufficientBudget || submitting) && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={insufficientBudget || submitting}
              >
                <Text style={styles.btnPrimaryText}>{submitting ? t('transfer.sending') : t('transfer.send_offer')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function feeRatioColor(ratio: number) {
  if (ratio >= 1.1) return { color: colors.success };
  if (ratio >= 0.9) return { color: colors.warning };
  return { color: colors.danger };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetContent: {
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  playerCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  playerName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  playerMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  playerStats: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  playerStat: {
    flex: 1,
  },
  playerStatLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playerStatValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.xxs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  fieldLabelSpaced: {
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: fontSize.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  inputWarning: {
    borderColor: colors.warning,
  },
  helperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  preset: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  presetActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  presetTextActive: {
    color: colors.text,
  },
  kindRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    padding: spacing.xs,
  },
  kindTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  kindTabActive: {
    backgroundColor: colors.primary,
  },
  kindTabText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  kindTabTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnSecondaryText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
