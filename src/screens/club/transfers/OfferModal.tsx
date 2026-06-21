import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TextInput, ScrollView } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { Card, Chip, Button, Sheet, useConfirm } from '@/components/kit';
import { Title, Body, Label, Caption } from '@/components/typography';
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
  const confirm = useConfirm();
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
      await confirm({
        title: t('transfer.alert_budget_title'),
        message: t('transfer.alert_budget_msg', { budget: formatMoney(buyerBudget), offer: formatMoney(fee) }),
        confirmLabel: t('kit.ok'),
        tone: 'danger',
      });
      return;
    }
    if (fee < 0) {
      await confirm({
        title: t('transfer.alert_fee_title'),
        message: t('transfer.alert_fee_msg'),
        confirmLabel: t('kit.ok'),
        tone: 'danger',
      });
      return;
    }
    if (wage <= 0) {
      await confirm({
        title: t('transfer.alert_wage_title'),
        message: t('transfer.alert_wage_msg'),
        confirmLabel: t('kit.ok'),
        tone: 'danger',
      });
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
    <Sheet visible={visible} onClose={onClose} testID="offer-modal-sheet">
      <ScrollView contentContainerStyle={styles.sheetContent}>
        <Title style={styles.title}>{t('transfer.make_offer')}</Title>

        {/* Type toggle */}
        <View style={styles.kindRow}>
          <Chip
            label={t('transfer.kind_transfer')}
            selected={kind === 'transfer'}
            onPress={() => setKind('transfer')}
            accent={colors.primary}
            testID="offer-kind-transfer"
            accessibilityLabel={t('transfer.kind_transfer')}
          />
          <Chip
            label={t('transfer.kind_loan')}
            selected={kind === 'loan'}
            onPress={() => setKind('loan')}
            accent={colors.primary}
            testID="offer-kind-loan"
            accessibilityLabel={t('transfer.kind_loan')}
          />
        </View>

        {/* Player info */}
        <Card variant="detail" style={styles.playerCard}>
          <Body style={styles.playerName}>{playerName}</Body>
          <Label>
            {t('transfer.player_meta', { position: playerPosition, age: playerAge, ovr: playerOverall })}
          </Label>
          <View style={styles.playerStats}>
            <View style={styles.playerStat}>
              <Caption style={styles.playerStatLabel}>{t('transfer.market_value')}</Caption>
              <Body style={styles.playerStatValue}>{formatMoney(marketValue)}</Body>
            </View>
            <View style={styles.playerStat}>
              <Caption style={styles.playerStatLabel}>{t('transfer.current_wage')}</Caption>
              <Body style={styles.playerStatValue}>{formatMoney(currentWage)}/wk</Body>
            </View>
          </View>
        </Card>

        {/* Fee input */}
        <Caption style={styles.fieldLabel}>{kind === 'loan' ? t('transfer.loan_fee') : t('transfer.transfer_fee')}</Caption>
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
          testID="offer-fee-input"
          accessibilityLabel={kind === 'loan' ? t('transfer.loan_fee') : t('transfer.transfer_fee')}
        />
        <View style={styles.helperRow}>
          <Label>{formatMoney(fee)}</Label>
          <Label style={feeRatioColor(feeRatio)}>
            {t('transfer.pct_of_market', { pct: Math.round(feeRatio * 100) })}
          </Label>
        </View>
        {insufficientBudget && (
          <Caption style={styles.errorText}>
            {t('transfer.exceeds_budget', { budget: formatMoney(buyerBudget) })}
          </Caption>
        )}

        {/* Wage input */}
        <Caption style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('transfer.weekly_wage')}</Caption>
        <TextInput
          style={styles.input}
          value={wageStr}
          onChangeText={setWageStr}
          keyboardType="numeric"
          placeholder={t('transfer.wage_placeholder')}
          placeholderTextColor={colors.textMuted}
          testID="offer-wage-input"
          accessibilityLabel={t('transfer.weekly_wage')}
        />
        <View style={styles.helperRow}>
          <Label>{formatMoney(wage)}/wk</Label>
          <Label>
            {currentWage > 0 ? t('transfer.pct_of_current', { pct: Math.round((wage / currentWage) * 100) }) : ''}
          </Label>
        </View>

        {/* Loan duration (only when kind = loan) */}
        {kind === 'loan' && (
          <>
            <Caption style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t('transfer.loan_duration')}</Caption>
            <View style={styles.presets}>
              {[1, 2].map((yr) => (
                <Chip
                  key={yr}
                  label={t(yr > 1 ? 'transfer.seasons_other' : 'transfer.seasons_one', { n: yr })}
                  selected={loanSeasons === yr}
                  onPress={() => setLoanSeasons(yr)}
                  accent={colors.primary}
                  testID={`offer-loan-seasons-${yr}`}
                  accessibilityLabel={t(yr > 1 ? 'transfer.seasons_other' : 'transfer.seasons_one', { n: yr })}
                />
              ))}
            </View>
            <Label style={styles.loanReturns}>
              {t('transfer.loan_returns', { season: currentSeason + loanSeasons })}
            </Label>
          </>
        )}

        {/* Preset buttons */}
        <View style={styles.presets}>
          <Chip
            label={t('transfer.market_value')}
            onPress={() => setFeeStr(String(marketValue))}
            accent={colors.primary}
            testID="offer-preset-market"
            accessibilityLabel={t('transfer.market_value')}
          />
          <Chip
            label="+10%"
            onPress={() => setFeeStr(String(Math.round(marketValue * 1.1)))}
            accent={colors.primary}
            testID="offer-preset-110"
            accessibilityLabel="+10%"
          />
          <Chip
            label="+25%"
            onPress={() => setFeeStr(String(Math.round(marketValue * 1.25)))}
            accent={colors.primary}
            testID="offer-preset-125"
            accessibilityLabel="+25%"
          />
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={onClose}
            disabled={submitting}
            testID="offer-cancel"
            accessibilityLabel={t('common.cancel')}
          />
          <Button
            label={submitting ? t('transfer.sending') : t('transfer.send_offer')}
            variant="primary"
            onPress={handleSubmit}
            disabled={insufficientBudget || submitting}
            loading={submitting}
            testID="offer-send"
            accessibilityLabel={t('transfer.send_offer')}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

function feeRatioColor(ratio: number) {
  if (ratio >= 1.1) return { color: colors.success };
  if (ratio >= 0.9) return { color: colors.warning };
  return { color: colors.danger };
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingBottom: spacing.xs,
  },
  title: {
    marginBottom: spacing.md,
  },
  playerCard: {
    marginBottom: spacing.md,
  },
  playerName: {
    fontWeight: '700',
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
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playerStatValue: {
    fontWeight: '600',
    marginTop: spacing.xxs,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  fieldLabelSpaced: {
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  errorText: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  loanReturns: {
    marginTop: spacing.sm,
  },
  kindRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
