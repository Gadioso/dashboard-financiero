import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  virafiProductionPackageSchema,
  virafiQualityReviewSchema,
  virafiWeeklyPlanSchema,
  type VirafiQualityReview,
  type VirafiWeeklyPlan,
} from '../marketing/virafi-content-contracts';

const entertainmentPillars = new Set([
  'financial-entertainment',
  'interactive-challenge',
  'relatable-money-moment',
]);

const salesLanguage = /\b(compra|suscr[ií]bete|descarga ahora|aprovecha|oferta|precio especial|última oportunidad)\b/i;
const guaranteeLanguage = /\b(garantizad[oa]|sin riesgo|hazte ric[oa]|duplica tu dinero|rendimiento seguro)\b/i;

export function reviewVirafiPlan(plan: VirafiWeeklyPlan): VirafiQualityReview {
  const issues: string[] = [];
  const warnings: string[] = [];
  const weekdays = plan.episodes.map((episode) => episode.weekday);
  const entertainmentLedEpisodes = plan.episodes.filter((episode) => entertainmentPillars.has(episode.pillar)).length;
  const totalEstimatedOpusCredits = plan.episodes.reduce((total, episode) => total + episode.estimatedOpusCredits, 0);

  if (new Set(weekdays).size !== 5) issues.push('Each weekday from Monday to Friday must appear exactly once.');
  if (entertainmentLedEpisodes < 3) issues.push('At least three episodes must be entertainment-led or interactive.');
  if (totalEstimatedOpusCredits > 75) issues.push('The weekly estimate exceeds the 75 Opus-credit operating limit.');

  for (const episode of plan.episodes) {
    const allCopy = [episode.workingTitle, episode.hook, ...episode.script, episode.caption].join(' ');
    if (salesLanguage.test(allCopy)) issues.push(`${episode.weekday}: contains sales language.`);
    if (guaranteeLanguage.test(allCopy)) issues.push(`${episode.weekday}: contains a financial guarantee or unsafe claim.`);
    if (!episode.interactionPrompt.trim()) issues.push(`${episode.weekday}: missing interaction prompt.`);
    if (!episode.loopEnding.trim()) issues.push(`${episode.weekday}: missing loop ending.`);

    if (episode.productionMode === 'real-ui-capture' && !episode.requiredUiAsset) {
      issues.push(`${episode.weekday}: real UI content requires a verified asset.`);
    }
    if (episode.productFeatureShown && episode.productionMode !== 'real-ui-capture') {
      warnings.push(`${episode.weekday}: verify that the product feature is not visually invented.`);
    }
  }

  return virafiQualityReviewSchema.parse({
    passed: issues.length === 0,
    totalEstimatedOpusCredits,
    entertainmentLedEpisodes,
    issues,
    warnings,
  });
}

export const reviewVirafiPlanTool = createTool({
  id: 'review-virafi-content-plan',
  description: 'Checks a Virafi weekly content plan for editorial, safety, UI-evidence, and Opus-credit rules.',
  inputSchema: virafiWeeklyPlanSchema,
  outputSchema: virafiQualityReviewSchema,
  execute: async (inputData) => reviewVirafiPlan(inputData),
});
export const buildVirafiOpusHandoffTool = createTool({
  id: 'build-virafi-opus-handoff',
  description: 'Builds a non-publishing production queue for Agent Opus, OpusClip MCP, and real UI capture.',
  inputSchema: z.object({
    plan: virafiWeeklyPlanSchema,
    review: virafiQualityReviewSchema,
    socialAccountsReady: z.boolean(),
  }),
  outputSchema: virafiProductionPackageSchema,
  execute: async ({ plan, review, socialAccountsReady }) => {
    const publishingBlockers = [
      'Human approval is required before production.',
      ...(!socialAccountsReady ? ['Official Virafi social accounts are not connected.'] : []),
      ...(!review.passed ? ['The editorial quality review has unresolved issues.'] : []),
    ];

    return {
      plan,
      review,
      queue: plan.episodes.map((episode, index) => ({
        id: `${plan.weekOf}-${String(index + 1).padStart(2, '0')}-${episode.weekday}`,
        weekday: episode.weekday,
        workingTitle: episode.workingTitle,
        productionMode: episode.productionMode,
        destination:
          episode.productionMode === 'agent-opus-animation'
            ? ('agent-opus-web' as const)
            : episode.productionMode === 'real-ui-capture'
              ? ('manual-ui-capture' as const)
              : ('opusclip-mcp' as const),
        state: review.passed ? ('awaiting-approval' as const) : ('blocked-quality' as const),
        estimatedOpusCredits: episode.estimatedOpusCredits,
        handoffInstructions: [
          `Produce a ${episode.durationSeconds}-second vertical 9:16 video.`,
          `Open with: ${episode.hook}`,
          `Visual direction: ${episode.visualDirection.join(' | ')}`,
          `End in a seamless loop: ${episode.loopEnding}`,
          'Do not publish, schedule, or connect a social account from this queue item.',
        ],
      })),
      approvalStatus: 'draft' as const,
      publishingBlocked: true,
      publishingBlockers,
    };
  },
});
