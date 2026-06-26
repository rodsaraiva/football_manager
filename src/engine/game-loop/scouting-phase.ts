import { getPlayerById } from '@/database/queries/players';
import { getStaffByClub } from '@/database/queries/staff';
import { getActiveAssignments, setKnowledge, getPlayerKnowledge } from '@/database/queries/scouting';
import { insertNewsItem } from '@/database/queries/news';
import { advanceScouting, knowledgeTier, maskedRange } from '@/engine/scouting/scouting-engine';
import { getActiveMissions, completeMission, setMissionWeeks } from '@/database/queries/scout-missions';
import { advanceMission, missionVerdict } from '@/engine/scouting/scout-missions';
import { archetypeMultiplier } from '@/engine/scouting/scout-archetypes';
import { getStaffEffects } from '@/engine/staff/staff-effects';
import { calculateOverall } from '@/utils/overall';
import { Position } from '@/types';
import { WeekContext } from './week-context';

// Fase: progressão de scouting do clube humano — assignments legados (cache) +
// missões C3. Não consome o rng principal. No-op para saveId < 0.
export async function scoutingPhase(ctx: WeekContext): Promise<void> {
  const { db, saveId, season, week, playerClubId } = ctx;

  // 3·5 Scouting progression: each active assignment for the human club accrues
  // knowledge based on the assigned scout's ability. Persisting 100 frees the scout.
  if (saveId >= 0) {
    const assignments = await getActiveAssignments(db, saveId);
    if (assignments.length > 0) {
      const scoutStaff = await getStaffByClub(db, saveId, playerClubId);
      const abilityById = new Map(scoutStaff.map((s) => [s.id, s.ability]));
      for (const a of assignments) {
        const ability = abilityById.get(a.scoutId);
        if (ability == null) continue; // scout no longer at the club — skip
        const current = (await db
          .prepare('SELECT knowledge FROM scouting WHERE save_id = ? AND player_id = ?')
          .get(saveId, a.playerId)) as { knowledge: number } | undefined;
        const [advanced] = advanceScouting([
          { playerId: a.playerId, knowledge: current?.knowledge ?? 0, scoutAbility: ability },
        ]);
        await setKnowledge(db, saveId, a.playerId, advanced.knowledge);
        if (advanced.reachedFull) {
          const p = (await db
            .prepare('SELECT name, position, age FROM players WHERE save_id = ? AND id = ?')
            .get(saveId, a.playerId)) as { name: string; position: string; age: number } | undefined;
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.persist_scouting_title', titleVars: { name: p?.name ?? '' },
            bodyKey: 'news.persist_scouting_body',
            bodyVars: { name: p?.name ?? '', position: p?.position ?? '', age: p?.age ?? 0, verdict: 'verdict.solid' },
          });
        }
      }
    }
  }

  // 3·5b C3 Scouting missions: each active mission for the human club advances by its
  // type/pace/archetype. Completing a mission frees the scout and fires a news item with
  // REAL titleVars/bodyVars (player name + verdict). Orphan missions (scout gone) expire
  // with an interruption notice. Additive to (and independent of) the legacy assignment
  // path above — the scouting table stays a cache; scout_missions drives the new flow.
  if (saveId >= 0) {
    const missions = await getActiveMissions(db, saveId);
    if (missions.length > 0) {
      const scouts = (await getStaffByClub(db, saveId, playerClubId)).filter((s) => s.role === 'scout');
      const scoutById = new Map(scouts.map((s) => [s.id, s]));

      for (const m of missions) {
        const scout = scoutById.get(m.scoutId);
        if (scout == null) {
          // scout left the club → orphan mission expires + interruption news.
          await completeMission(db, saveId, m.id, 'expired');
          let orphanName = '';
          if (m.targetPlayerId != null) {
            const op = (await db
              .prepare('SELECT name FROM players WHERE save_id = ? AND id = ?')
              .get(saveId, m.targetPlayerId)) as { name: string } | undefined;
            orphanName = op?.name ?? '';
          }
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 70,
            titleKey: 'news.scouting_interrupted_title',
            bodyKey: 'news.scouting_interrupted_body',
            bodyVars: { name: orphanName },
          });
          continue;
        }

        // Build the archetype target from the real player (neutral for intel/youth).
        // region-base proxy: the user's club country (no dedicated scout-region column).
        const scoutRegionCode = '';
        let target = { age: 24, position: 'CM' as Position, regionCode: '' };
        let knowledgeBefore = 0;
        if (m.targetPlayerId != null) {
          const tp = (await db
            .prepare('SELECT age, position, nationality FROM players WHERE save_id = ? AND id = ?')
            .get(saveId, m.targetPlayerId)) as { age: number; position: Position; nationality: string } | undefined;
          if (tp == null) {
            // target vanished → expire silently.
            await completeMission(db, saveId, m.id, 'expired');
            continue;
          }
          target = { age: tp.age, position: tp.position, regionCode: tp.nationality };
          knowledgeBefore = await getPlayerKnowledge(db, saveId, m.targetPlayerId);
        }

        const archetypeMult = archetypeMultiplier(
          scout.archetype ?? 'generalist',
          target,
          { scoutRegionCode },
        );
        const result = advanceMission({
          missionId: m.id,
          type: m.type,
          knowledge: knowledgeBefore,
          weeksElapsed: m.weeksElapsed,
          scoutAbility: scout.ability,
          archetypeMult,
        });

        if (m.targetPlayerId != null) {
          await setKnowledge(db, saveId, m.targetPlayerId, result.knowledge);
        }
        await setMissionWeeks(db, saveId, m.id, result.weeksElapsed);

        if (!result.completed) continue;
        await completeMission(db, saveId, m.id, result.expiredEarly ? 'expired' : 'completed');

        // Type-specific report callback (news with real vars).
        if (m.type === 'opponent_intel' && m.targetClubId != null) {
          const club = (await db
            .prepare('SELECT name FROM clubs WHERE save_id = ? AND id = ?')
            .get(saveId, m.targetClubId)) as { name: string } | undefined;
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.scouting_intel_title', titleVars: { club: club?.name ?? '' },
            bodyKey: 'news.scouting_intel_body', bodyVars: { club: club?.name ?? '' },
          });
        } else if (m.type === 'youth_prospect') {
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.scouting_youth_title', titleVars: { name: '' },
            bodyKey: 'news.scouting_youth_body',
            bodyVars: { name: '', position: '', age: 0, potLo: 0, potHi: 0 },
          });
        } else if (m.targetPlayerId != null) {
          // short_eval / long_project: verdict over the real player.
          const full = await getPlayerById(db, saveId, m.targetPlayerId);
          const scoutAccuracy = getStaffEffects({
            fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: scout.ability,
            youthCoachAbility: 0, assistantAbility: 0,
          }).scoutAccuracy;
          const overall = full ? calculateOverall(full.attributes, full.position) : 0;
          const masked = maskedRange(overall, knowledgeTier(result.knowledge), scoutAccuracy);
          const maskedOvr = masked ? Math.round((masked.lo + masked.hi) / 2) : overall;
          const { verdictKey } = missionVerdict(result.knowledge, maskedOvr);
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.persist_scouting_title', titleVars: { name: full?.name ?? '' },
            bodyKey: 'news.persist_scouting_body',
            bodyVars: {
              name: full?.name ?? '', position: full?.position ?? '', age: full?.age ?? 0,
              verdict: verdictKey,
            },
          });
        }
      }
    }
  }
}
