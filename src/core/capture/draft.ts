import { z } from 'zod';

/** Rascunho de captura (Telegram / GPT) antes de gravar no ledger. */
export const captureDraftSchema = z.object({
  kind: z.enum(['expense', 'income', 'transfer']),
  /** Valor como o modelo/usuário escreveu — converter com money.parse. */
  amountRaw: z.string().min(1),
  description: z.string().min(1).max(200),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** "casa" | "eu" | short_name / nome. */
  personHint: z.string().nullable().optional(),
  accountHint: z.string().nullable().optional(),
  /** Conta destino (só transferência). */
  transferAccountHint: z.string().nullable().optional(),
  categoryHint: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  /** Número de parcelas (2–48). Valor = total a dividir. */
  installments: z.number().int().min(2).max(48).optional(),
  /** Itens de cupom (opcional; soma ≈ total). */
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(200),
        amountRaw: z.string().min(1),
      }),
    )
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1).default(0.8),
  warnings: z.array(z.string()).default([]),
});

export type CaptureDraft = z.infer<typeof captureDraftSchema>;

/** Payload persistido em capture_drafts + ids já resolvidos. */
export type ResolvedCaptureDraft = CaptureDraft & {
  amountCents: number;
  accountId: string | null;
  personId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
};
