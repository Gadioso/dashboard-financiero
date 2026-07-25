import { z } from 'zod';

export const virafiWeekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

export const virafiContentPillars = [
  'financial-entertainment',
  'interactive-challenge',
  'contrarian-tip',
  'real-product-story',
  'relatable-money-moment',
] as const;

export const virafiProductionModes = [
  'agent-opus-animation',
  'real-ui-capture',
  'opus-motion-graphics',
  'native-social-edit',
] as const;

export const virafiWeeklyRequestSchema = z.object({
  weekOf: z.string().date().describe('Monday of the content week in YYYY-MM-DD format'),
  audience: z.string().default('Spanish-speaking adults in Mexico and Latin America'),
  weeklyTheme: z.string().optional(),
  productMomentsAvailable: z.array(z.string()).default([]),
  verifiedUiAssets: z.array(z.string()).default([]),
  socialAccountsReady: z.boolean().default(false),
});

export const virafiVideoConceptSchema = z.object({
  weekday: z.enum(virafiWeekdays),
  workingTitle: z.string().min(3),
  pillar: z.enum(virafiContentPillars),
  productionMode: z.enum(virafiProductionModes),
  durationSeconds: z.number().int().min(10).max(60),
  estimatedOpusCredits: z.number().int().min(0).max(60),
  hook: z.string().min(5),
  script: z.array(z.string().min(1)).min(3).max(12),
  visualDirection: z.array(z.string().min(1)).min(2).max(10),
  interactionPrompt: z.string().min(3),
  caption: z.string().min(10),
  onScreenText: z.array(z.string().min(1)).min(1).max(10),
  soundDirection: z.string().min(3),
  loopEnding: z.string().min(3),
  productFeatureShown: z.string().nullable(),
  requiredUiAsset: z.string().nullable(),
  financialDisclaimer: z.string().nullable(),
  platformNotes: z.object({
    instagram: z.string(),
    tiktok: z.string(),
    facebook: z.string(),
  }),
});

export const virafiWeeklyPlanSchema = z.object({
  weekOf: z.string().date(),
  theme: z.string(),
  strategicHypothesis: z.string(),
  episodes: z.array(virafiVideoConceptSchema).length(5),
});

export const virafiQualityReviewSchema = z.object({
  passed: z.boolean(),
  totalEstimatedOpusCredits: z.number().int().min(0),
  entertainmentLedEpisodes: z.number().int().min(0),
  issues: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const virafiProductionItemSchema = z.object({
  id: z.string(),
  weekday: z.enum(virafiWeekdays),
  workingTitle: z.string(),
  productionMode: z.enum(virafiProductionModes),
  destination: z.enum(['agent-opus-web', 'opusclip-mcp', 'manual-ui-capture']),
  state: z.enum(['blocked-quality', 'awaiting-approval', 'ready-for-production']),
  estimatedOpusCredits: z.number().int().min(0),
  handoffInstructions: z.array(z.string()),
});

export const virafiProductionPackageSchema = z.object({
  plan: virafiWeeklyPlanSchema,
  review: virafiQualityReviewSchema,
  queue: z.array(virafiProductionItemSchema).length(5),
  approvalStatus: z.enum(['draft', 'approved', 'rejected']),
  publishingBlocked: z.boolean(),
  publishingBlockers: z.array(z.string()),
  approvalNotes: z.string().optional(),
});

export type VirafiWeeklyRequest = z.infer<typeof virafiWeeklyRequestSchema>;
export type VirafiWeeklyPlan = z.infer<typeof virafiWeeklyPlanSchema>;
export type VirafiQualityReview = z.infer<typeof virafiQualityReviewSchema>;
export type VirafiProductionPackage = z.infer<typeof virafiProductionPackageSchema>;
