import { SeededRng } from '@/engine/rng';
import { AssistantArchetype, AssistantComment, AssistantRole, AssistantWithQuality } from '@/types/assistant';
import { ASSISTANT_COMMENT_CHANCE_PER_WEEK } from '@/engine/balance';

export interface CommentContext {
  leaguePosition: number | null;
  totalTeams: number;
  week: number;
  season: number;
  budgetBalance: number;
  squadAvgAge: number;
  topYouthPotential: number | null;
}

type CommentTemplate = (ctx: CommentContext) => string;

const SQUAD_TEMPLATES: Record<AssistantArchetype, CommentTemplate[]> = {
  old_school: [
    (ctx) => ctx.leaguePosition && ctx.leaguePosition <= 5 ? "Good position in the table. Keep the discipline." : "We need to sharpen up. No room for complacency.",
    (ctx) => `Week ${ctx.week} — the squad needs to stay focused. Character is built in moments like these.`,
    () => "The lads are working hard. Consistency is what separates good teams from great ones.",
  ],
  analytics: [
    (ctx) => ctx.leaguePosition ? `Position ${ctx.leaguePosition}/${ctx.totalTeams}. Expected performance range: +/- 2 spots. Trending ${ctx.leaguePosition <= ctx.totalTeams / 2 ? 'above' : 'below'} median.` : "Insufficient positional data to generate projection.",
    (ctx) => `xG differential this block suggests ${ctx.budgetBalance > 0 ? 'sustainable' : 'strained'} squad output. Recommend tactical review.`,
    () => "Data shows squad rotation reduces injury rate by ~18%. Consider squad depth in upcoming fixtures.",
  ],
  motivator: [
    (ctx) => ctx.leaguePosition && ctx.leaguePosition <= 3 ? "The boys are flying! Let's keep the energy up!" : "We're capable of so much more. I believe in this group!",
    () => "Every training session, every rep — it all counts. The team is building something special.",
    () => "The spirit in the dressing room is strong. That's what wins championships.",
  ],
  tactician: [
    (ctx) => `Week ${ctx.week} — I've been analyzing the pressing triggers. We can exploit space behind their midfield line.`,
    () => "The 4-3-3 pressing shape is working, but we need sharper rotations in the final third.",
    () => "Set pieces are still an area of opportunity. We're leaving points on the table.",
  ],
  developer: [
    (ctx) => ctx.topYouthPotential ? `Top youth talent has potential of ${ctx.topYouthPotential}. Worth investing playtime this block.` : "The youth pipeline looks solid. Keep developing the youngsters.",
    () => "Young players need minutes to grow. Consider rotating in the next fixture.",
    () => "The academy players are progressing well. A few are knocking on the first-team door.",
  ],
  pragmatic: [
    (ctx) => ctx.leaguePosition && ctx.leaguePosition > ctx.totalTeams * 0.7 ? "We need points urgently. Pragmatic approach — protect what we have." : "Results are acceptable. Stay the course.",
    () => "No need to overthink it. Defend well, hit on the counter. Simple game plan.",
    () => "The opposition won't adapt to us — we adapt to them. That's how this works.",
  ],
};

const FINANCIAL_TEMPLATES: Record<AssistantArchetype, CommentTemplate[]> = {
  pragmatic: [
    (ctx) => ctx.budgetBalance >= 0 ? "Finances are stable. No alarm bells — keep an eye on wage commitments." : "We're in the red. Need to look at trimming costs or moving on some players.",
    () => "Transfer budget is tight. Better to develop from within than overpay in the market.",
    () => "Don't let sentiment drive financial decisions. If a player's value is high, consider selling.",
  ],
  analytics: [
    (ctx) => `Budget balance: ${ctx.budgetBalance >= 0 ? '+' : ''}${Math.round(ctx.budgetBalance / 1000)}K. ${ctx.budgetBalance >= 0 ? 'Within sustainable range.' : 'Below zero — cost reduction required.'}`,
    () => "Wage-to-revenue ratio is worth monitoring. Recommend quarterly financial review.",
    () => "Transfer ROI metrics suggest we're generating above-average value from recent signings.",
  ],
  old_school: [
    (ctx) => ctx.budgetBalance >= 0 ? "Money's in order. Don't spend what you don't have — that's my advice." : "We're spending more than we earn. That's not how I run things.",
    () => "Back in my day, clubs lived within their means. Still the right approach.",
    () => "The wage bill is the biggest risk. Keep it manageable.",
  ],
  motivator: [
    (ctx) => ctx.budgetBalance >= 0 ? "We're in a healthy spot financially! Resources are there to invest in the squad!" : "Tight budget, but we've overcome bigger challenges. Let's make smart moves.",
    () => "Every signing is an opportunity to bring in someone who believes in what we're building!",
    () => "Financial discipline now means more freedom later. Trust the process!",
  ],
  tactician: [
    (ctx) => `Budget analysis: ${ctx.budgetBalance >= 0 ? 'positive' : 'negative'} balance. Recommend targeting positions of highest tactical need.`,
    () => "Investing in the right profile matters more than the price tag. Quality over quantity.",
    () => "The best financial decision is a signing that fills a specific tactical gap.",
  ],
  developer: [
    () => "Youth development pays dividends. An academy product costs a fraction of a transfer.",
    (ctx) => ctx.budgetBalance < 0 ? "With limited funds, promoting youth is the smart play." : "Healthy budget — consider investing in youth infrastructure.",
    () => "Free agents and loan deals can bridge gaps without breaking the bank.",
  ],
};

const YOUTH_TEMPLATES: Record<AssistantArchetype, CommentTemplate[]> = {
  developer: [
    (ctx) => ctx.topYouthPotential && ctx.topYouthPotential >= 80 ? `One of our youngsters has potential of ${ctx.topYouthPotential}. This lad could be something special.` : "The youth group is progressing steadily. Patience is key.",
    () => "Loan deals should be a priority for players who need competitive minutes.",
    () => "A player's peak development window is 16-23. Let's not waste it on the bench.",
  ],
  motivator: [
    () => "The young ones are hungry — give them a chance and they'll deliver!",
    (ctx) => ctx.topYouthPotential ? `Potential of ${ctx.topYouthPotential}? That's exciting! This player deserves a shot!` : "The youth group has energy and ambition. That's half the battle!",
    () => "Nothing builds a player faster than knowing their manager believes in them.",
  ],
  old_school: [
    () => "Young players need discipline before flair. Make sure they earn their minutes.",
    () => "I've seen more talent wasted by impatience than by anything else.",
    () => "The best thing for a young player is a good loan — proper football, proper development.",
  ],
  analytics: [
    (ctx) => ctx.topYouthPotential ? `Projected development trajectory for top youth (pot: ${ctx.topYouthPotential}): reaching peak in 3-5 seasons if given 1500+ minutes/year.` : "Youth development data suggests regular playtime is the key variable.",
    () => "Statistical models show loan players in active squads develop 2x faster than bench-warmers.",
    () => "Tracking youth performance metrics weekly. No surprises — data tells the story early.",
  ],
  tactician: [
    () => "Young players must understand the system first. Technical skill follows tactical understanding.",
    () => "I'm running position-specific drills with the U21s. Two of them are ready to step up.",
    (ctx) => `Week ${ctx.week} — identified a youngster who fits our pressing profile perfectly. Worth promoting.`,
  ],
  pragmatic: [
    () => "Youth is valuable, but only if they're actually ready. Don't rush it.",
    () => "A loan is better than sitting in the reserves. Get them game time.",
    (ctx) => ctx.topYouthPotential && ctx.topYouthPotential >= 75 ? "This one might be worth keeping. High upside, low cost. Think long-term." : "Manage expectations — not every youngster makes it.",
  ],
};

const TEMPLATES_BY_ROLE: Record<AssistantRole, Record<AssistantArchetype, CommentTemplate[]>> = {
  squad:     SQUAD_TEMPLATES,
  financial: FINANCIAL_TEMPLATES,
  youth:     YOUTH_TEMPLATES,
};

export function maybeGenerateComment(
  assistant: AssistantWithQuality,
  context: CommentContext,
  rng: SeededRng,
): AssistantComment | null {
  const chance = rng.nextFloat(0, 1);
  if (chance > ASSISTANT_COMMENT_CHANCE_PER_WEEK) return null;

  const templates = TEMPLATES_BY_ROLE[assistant.role][assistant.archetype];
  const template = templates[rng.nextInt(0, templates.length - 1)];
  const text = template(context);

  return {
    assistantId: assistant.id,
    assistantName: assistant.name,
    archetype: assistant.archetype,
    role: assistant.role,
    text,
  };
}
