import { z } from 'zod';

export const dailyCfoGoalSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.number().default(0),
  currentAmount: z.number().nonnegative(),
  targetAmount: z.number().nonnegative(),
  targetDate: z.string().nullable(),
  createdDate: z.string(),
});

export const dailyCfoWorkflowInputSchema = z.object({
  profileId: z.string(),
  firstName: z.string(),
  localDate: z.string(),
  timezone: z.string(),
  tone: z.enum(['natural', 'relaxed', 'direct', 'formal']).default('natural'),
  todayIncome: z.number(),
  todayExpenses: z.number(),
  monthIncome: z.number(),
  monthExpenses: z.number(),
  monthlyCapacity: z.number().nonnegative(),
  lifePriorities: z.array(z.string()).default([]),
  goals: z.array(dailyCfoGoalSchema),
  pendingTaskTitles: z.array(z.string()).default([]),
  recentConversation: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    createdAt: z.string(),
  })).default([]),
});

export const dailyCfoGoalPaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['needs_amount', 'needs_date', 'completed', 'behind', 'on_track']),
  remainingAmount: z.number(),
  dailyRequired: z.number(),
  weeklyRequired: z.number(),
  monthlyRequired: z.number(),
  paceGap: z.number(),
  daysRemaining: z.number().nullable(),
});

export const dailyCfoActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  goalId: z.string().nullable(),
  amount: z.number().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
});

export const dailyCfoPlanSchema = z.object({
  input: dailyCfoWorkflowInputSchema,
  goalPaces: z.array(dailyCfoGoalPaceSchema),
  actions: z.array(dailyCfoActionSchema).min(1).max(3),
});

export const dailyCfoWorkflowOutputSchema = z.object({
  message: z.string(),
  goalPaces: z.array(dailyCfoGoalPaceSchema),
  actions: z.array(dailyCfoActionSchema).min(1).max(3),
});
