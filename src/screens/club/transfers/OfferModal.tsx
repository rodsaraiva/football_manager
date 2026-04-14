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
import { colors, spacing, fontSize } from '@/theme';

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
      Alert.alert('Insufficient budget', `Your budget is ${formatMoney(buyerBudget)}, the offer is ${formatMoney(fee)}.`);
      return;
    }
    if (fee < 0) {
      Alert.alert('Invalid fee', 'Fee cannot be negative.');
      return;
    }
    if (wage <= 0) {
      Alert.alert('Invalid wage', 'Wage must be greater than zero.');
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
            <Text style={styles.title}>Make an Offer</Text>

            {/* Type toggle */}
            <View style={styles.kindRow}>
              <Pressable
                style={[styles.kindTab, kind === 'transfer' && styles.kindTabActive]}
                onPress={() => setKind('transfer')}
              >
                <Text style={[styles.kindTabText, kind === 'transfer' && styles.kindTabTextActive]}>
                  Transfer
                </Text>
              </Pressable>
              <Pressable
                style={[styles.kindTab, kind === 'loan' && styles.kindTabActive]}
                onPress={() => setKind('loan')}
              >
                <Text style={[styles.kindTabText, kind === 'loan' && styles.kindTabTextActive]}>
                  Loan
                </Text>
              </Pressable>
            </View>

            {/* Player info */}
            <View style={styles.playerCard}>
              <Text style={styles.playerName}>{playerName}</Text>
              <Text style={styles.playerMeta}>
                {playerPosition} · Age {playerAge} · OVR {playerOverall}
              </Text>
              <View style={styles.playerStats}>
                <View style={styles.playerStat}>
                  <Text style={styles.playerStatLabel}>Market Value</Text>
                  <Text style={styles.playerStatValue}>{formatMoney(marketValue)}</Text>
                </View>
                <View style={styles.playerStat}>
                  <Text style={styles.playerStatLabel}>Current Wage</Text>
                  <Text style={styles.playerStatValue}>{formatMoney(currentWage)}/wk</Text>
                </View>
              </View>
            </View>

            {/* Fee input */}
            <Text style={styles.fieldLabel}>{kind === 'loan' ? 'Loan Fee' : 'Transfer Fee'}</Text>
            <TextInput
              style={[
                styles.input,
                insufficientBudget && styles.inputError,
                feeTooLow && !insufficientBudget && styles.inputWarning,
              ]}
              value={feeStr}
              onChangeText={setFeeStr}
              keyboardType="numeric"
              placeholder="Fee"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.helperRow}>
              <Text style={styles.helperText}>{formatMoney(fee)}</Text>
              <Text style={[styles.helperText, feeRatioColor(feeRatio)]}>
                {Math.round(feeRatio * 100)}% of market value
              </Text>
            </View>
            {insufficientBudget && (
              <Text style={styles.errorText}>
                Exceeds your budget ({formatMoney(buyerBudget)})
              </Text>
            )}

            {/* Wage input */}
            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Weekly Wage</Text>
            <TextInput
              style={styles.input}
              value={wageStr}
              onChangeText={setWageStr}
              keyboardType="numeric"
              placeholder="Wage / week"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.helperRow}>
              <Text style={styles.helperText}>{formatMoney(wage)}/wk</Text>
              <Text style={styles.helperText}>
                {currentWage > 0 ? `${Math.round((wage / currentWage) * 100)}% of current` : ''}
              </Text>
            </View>

            {/* Loan duration (only when kind = loan) */}
            {kind === 'loan' && (
              <>
                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Loan Duration</Text>
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
                        {yr} season{yr > 1 ? 's' : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.helperText}>
                  Returns to parent club after season {currentSeason + loanSeasons}
                </Text>
              </>
            )}

            {/* Preset buttons */}
            <View style={styles.presets}>
              <Pressable
                style={styles.preset}
                onPress={() => setFeeStr(String(marketValue))}
              >
                <Text style={styles.presetText}>Market Value</Text>
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
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary, (insufficientBudget || submitting) && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={insufficientBudget || submitting}
              >
                <Text style={styles.btnPrimaryText}>{submitting ? 'Sending...' : 'Send Offer'}</Text>
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
    marginTop: 2,
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
    marginTop: 2,
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
    borderRadius: 8,
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
    marginTop: 4,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginTop: 4,
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
    borderRadius: 8,
    paddingVertical: 8,
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
    padding: 4,
  },
  kindTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
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
    borderRadius: 8,
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
