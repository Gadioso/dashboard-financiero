import { createStep, createWorkflow } from '@mastra/core/workflows';
import {
  dailyCfoPlanSchema,
  dailyCfoWorkflowInputSchema,
  dailyCfoWorkflowOutputSchema,
  type dailyCfoGoalPaceSchema,
} from '../finance/virafi-daily-cfo-contracts';
import { z } from 'zod';

type GoalPace = z.infer<typeof dailyCfoGoalPaceSchema>;

function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const calculateDailyPlan = createStep({
  id: 'calculate-virafi-daily-cfo-plan',
  description: 'Calculates goal pace and the next one-to-three actions without using an LLM for financial math.',
  inputSchema: dailyCfoWorkflowInputSchema,
  outputSchema: dailyCfoPlanSchema,
  execute: async ({ inputData }) => {
    const goalPaces: GoalPace[] = inputData.goals.map((goal) => {
      const remainingAmount = Math.max(goal.targetAmount - goal.currentAmount, 0);
      const daysRemaining = goal.targetDate ? Math.max(daysBetween(inputData.localDate, goal.targetDate), 0) : null;
      const totalDays = goal.targetDate ? Math.max(daysBetween(goal.createdDate, goal.targetDate), 1) : null;
      const elapsed = totalDays ? Math.min(Math.max(daysBetween(goal.createdDate, inputData.localDate), 0), totalDays) : 0;
      const expected = totalDays ? goal.targetAmount * (elapsed / totalDays) : goal.currentAmount;
      const dailyRequired = daysRemaining === null ? 0 : remainingAmount / Math.max(daysRemaining, 1);
      const status: GoalPace['status'] = goal.targetAmount <= 0
        ? 'needs_amount'
        : !goal.targetDate
          ? 'needs_date'
          : remainingAmount <= 0
            ? 'completed'
            : goal.currentAmount + 1 < expected
              ? 'behind'
              : 'on_track';
      return {
        id: goal.id,
        name: goal.name,
        status,
        remainingAmount,
        dailyRequired,
        weeklyRequired: dailyRequired * 7,
        monthlyRequired: dailyRequired * 30.4375,
        paceGap: goal.currentAmount - expected,
        daysRemaining,
      };
    }).sort((a, b) => {
      const rank = { behind: 0, needs_amount: 1, needs_date: 2, on_track: 3, completed: 4 };
      return rank[a.status] - rank[b.status];
    });

    const focus = goalPaces.find((goal) => goal.status !== 'completed');
    const action = !focus
      ? { title: 'Define tu siguiente meta financiera', description: 'No hay una meta activa con una brecha pendiente.', goalId: null, amount: null, priority: 'medium' as const }
      : focus.status === 'needs_amount' || focus.status === 'needs_date'
        ? { title: `Completa el plan de “${focus.name}”`, description: `Falta ${focus.status === 'needs_amount' ? 'el monto' : 'la fecha'} para calcular el ritmo.`, goalId: focus.id, amount: null, priority: 'high' as const }
        : {
            title: `Aparta $${Math.max(focus.dailyRequired, Math.min(focus.weeklyRequired, inputData.monthlyCapacity / 4.345)).toFixed(0)} para “${focus.name}”`,
            description: focus.status === 'behind' ? 'Recupera parte del atraso frente al plan.' : 'Mantiene el ritmo de la meta.',
            goalId: focus.id,
            amount: Math.max(focus.dailyRequired, Math.min(focus.weeklyRequired, inputData.monthlyCapacity / 4.345)),
            priority: focus.status === 'behind' ? 'high' as const : 'medium' as const,
          };

    return { input: inputData, goalPaces, actions: [action] };
  },
});

const writeDailyMentorMessage = createStep({
  id: 'write-virafi-daily-cfo-message',
  description: 'Turns verified financial calculations into one short, human, conversational mentor message.',
  inputSchema: dailyCfoPlanSchema,
  outputSchema: dailyCfoWorkflowOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('financieroAgent');
    const response = await agent.generate(`
Write today's proactive VirafIA message in natural Mexican Spanish.

Verified plan:
${JSON.stringify(inputData, null, 2)}

Use 2-4 short paragraphs, no headings or bullets, under 850 characters. Briefly say what happened today, what it means for the most relevant goal, and what action you recommend. If there were no movements, still discuss goals naturally. Use the first name, vary the greeting, preserve conversational continuity, and end with one natural question. Do not change any number and do not sound like a report or scripted AI.
`, {
      structuredOutput: { schema: z.object({ message: z.string().min(40).max(1200) }) },
    });
    return {
      message: response.object.message,
      goalPaces: inputData.goalPaces,
      actions: inputData.actions,
    };
  },
});

export const virafiDailyCfoWorkflow = createWorkflow({
  id: 'virafi-daily-cfo-workflow',
  description: 'Calculates every active goal pace and writes one conversational daily CFO mentor message.',
  inputSchema: dailyCfoWorkflowInputSchema,
  outputSchema: dailyCfoWorkflowOutputSchema,
})
  .then(calculateDailyPlan)
  .then(writeDailyMentorMessage)
  .commit();
