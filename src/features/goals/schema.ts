import { z } from 'zod';

const yearMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM)');

export const goalSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da meta'),
  targetCents: z.number().int().positive('Informe um valor alvo'),
  personId: z.string().uuid().nullable(),
  deadlineMonth: yearMonth.nullable(),
  notes: z.string().trim().nullable().optional(),
});

export const contributionSchema = z.object({
  amountCents: z.number().int().nonnegative('Informe o aporte'),
  notes: z.string().trim().nullable().optional(),
});

export type GoalFormValues = z.infer<typeof goalSchema>;
