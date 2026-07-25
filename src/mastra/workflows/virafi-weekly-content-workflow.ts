import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  virafiProductionPackageSchema,
  virafiWeeklyPlanSchema,
  virafiWeeklyRequestSchema,
} from '../marketing/virafi-content-contracts';
import { buildVirafiOpusHandoffTool, reviewVirafiPlanTool } from '../tools/virafi-marketing-tools';

const generatedDraftSchema = z.object({
  request: virafiWeeklyRequestSchema,
  plan: virafiWeeklyPlanSchema,
});

const generateWeeklyDraft = createStep({
  id: 'generate-virafi-weekly-draft',
  description: 'Generates five entertainment-led Virafi short-form video concepts.',
  inputSchema: virafiWeeklyRequestSchema,
  outputSchema: generatedDraftSchema,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('virafiContentAgent');
    const response = await agent.generate(
      `Create Virafi's five-video plan for the week.

      Request: ${JSON.stringify(inputData, null, 2)}

      Use Monday through Friday exactly once. Use only verifiedUiAssets for requiredUiAsset.
      If no verified UI asset is supplied, do not choose real-ui-capture and do not show a product feature.
      The audience should feel seen and entertained, not marketed to.`,
      {
        structuredOutput: {
          schema: virafiWeeklyPlanSchema,
        },
      },
    );

    return {
      request: inputData,
      plan: virafiWeeklyPlanSchema.parse(response.object),
    };
  },
});

const reviewAndQueue = createStep({
  id: 'review-and-queue-virafi-content',
  description: 'Runs deterministic editorial checks and creates a production-only Opus handoff queue.',
  inputSchema: generatedDraftSchema,
  outputSchema: virafiProductionPackageSchema,
  execute: async ({ inputData, requestContext }) => {
    const review = await reviewVirafiPlanTool.execute(inputData.plan, { requestContext });
    return buildVirafiOpusHandoffTool.execute(
      {
        plan: inputData.plan,
        review,
        socialAccountsReady: inputData.request.socialAccountsReady,
      },
      { requestContext },
    );
  },
});

export const approveVirafiContentStep = createStep({
  id: 'approve-virafi-content',
  description: 'Requires a human decision before any production can begin.',
  inputSchema: virafiProductionPackageSchema,
  resumeSchema: z.object({
    approved: z.boolean(),
    notes: z.string().default(''),
  }),
  suspendSchema: virafiProductionPackageSchema,
  outputSchema: virafiProductionPackageSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) return suspend(inputData);

    const accountBlocker = inputData.publishingBlockers.includes('Official Virafi social accounts are not connected.');
    const qualityBlocker = !inputData.review.passed;
    const approved = resumeData.approved && !qualityBlocker;

    return {
      ...inputData,
      queue: inputData.queue.map((item) => ({
        ...item,
        state: approved ? ('ready-for-production' as const) : ('blocked-quality' as const),
      })),
      approvalStatus: approved ? ('approved' as const) : ('rejected' as const),
      approvalNotes: resumeData.notes,
      publishingBlocked: accountBlocker || !approved,
      publishingBlockers: [
        ...(accountBlocker ? ['Official Virafi social accounts are not connected.'] : []),
        ...(!approved ? ['The content package was not approved for production.'] : []),
      ],
    };
  },
});

export const virafiWeeklyContentWorkflow = createWorkflow({
  id: 'virafi-weekly-content-workflow',
  description: 'Creates, checks, queues, and pauses a weekly Virafi content package for human approval.',
  inputSchema: virafiWeeklyRequestSchema,
  outputSchema: virafiProductionPackageSchema,
})
  .then(generateWeeklyDraft)
  .then(reviewAndQueue)
  .then(approveVirafiContentStep)
  .commit();
