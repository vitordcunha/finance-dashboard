/** Modelos de domínio (não confundir com rows do Supabase). */

export type PersonId = string;
export type AccountId = string;
export type CategoryId = string;
export type HouseholdId = string;
export type TransactionId = string;

export type MoneyCents = number;

export type TransactionKind = 'income' | 'expense' | 'transfer';

export type TransactionSource = 'manual' | 'import' | 'recurring' | 'telegram';

/** `skipped` é marcador: a ocorrência daquele mês da série foi cancelada. */
export type TransactionStatus = 'actual' | 'planned' | 'skipped';

export type TransactionRecurrence = 'none' | 'monthly';

/** Alcance de uma edição sobre uma série. */
export type SeriesEditScope = 'one' | 'forward';

export type Transaction = {
  id: TransactionId;
  householdId: HouseholdId;
  date: string;
  competenceMonth: string;
  kind: TransactionKind;
  description: string;
  amountCents: MoneyCents;
  categoryId: CategoryId | null;
  personId: PersonId | null;
  accountId: AccountId | null;
  transferAccountId: AccountId | null;
  /** `planned` é lançamento futuro — o planejamento vive aqui. */
  status: TransactionStatus;
  /** `monthly` faz desta linha o modelo de uma série. */
  recurrence: TransactionRecurrence;
  /** Último dia em que a série ocorre. Null = indefinidamente. */
  recurrenceEnd: string | null;
  /** Exceção de um mês: aponta para a linha-modelo da série. */
  seriesId: TransactionId | null;
  notes: string | null;
  tags: string[];
  source: TransactionSource;
  externalId: string | null;
  createdAt: string;
};

export type CreateTransactionInput = {
  householdId: HouseholdId;
  date: string;
  kind: TransactionKind;
  description: string;
  amountCents: MoneyCents;
  categoryId?: CategoryId | null;
  personId?: PersonId | null;
  accountId?: AccountId | null;
  transferAccountId?: AccountId | null;
  status?: TransactionStatus;
  recurrence?: TransactionRecurrence;
  recurrenceEnd?: string | null;
  seriesId?: TransactionId | null;
  notes?: string | null;
  createdBy?: string | null;
  source?: TransactionSource;
  externalId?: string | null;
  /** Se omitido, resolve via conta (closing_day em credit). */
  competenceMonth?: string;
};

export type UpdateTransactionInput = {
  date?: string;
  kind?: TransactionKind;
  description?: string;
  amountCents?: MoneyCents;
  categoryId?: CategoryId | null;
  personId?: PersonId | null;
  accountId?: AccountId | null;
  transferAccountId?: AccountId | null;
  status?: TransactionStatus;
  recurrence?: TransactionRecurrence;
  recurrenceEnd?: string | null;
  notes?: string | null;
};


export type StatementStatus = 'open' | 'closed';

export type Statement = {
  accountId: AccountId;
  month: string;
  totalCents: MoneyCents | null;
  paidCents: MoneyCents | null;
  closingDate: string | null;
  dueDate: string | null;
  notes: string | null;
  status: StatementStatus;
};

export type StatementPayment = {
  id: string;
  statementAccountId: AccountId;
  statementMonth: string;
  transactionId: TransactionId;
  amountCents: MoneyCents;
  createdAt: string;
};

export type UpsertStatementInput = {
  accountId: AccountId;
  month: string;
  totalCents?: MoneyCents | null;
  paidCents?: MoneyCents | null;
  closingDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  status?: StatementStatus;
};

/**
 * Saldo informado por conta.
 * Ativo (corrente/poupança/cash): positivo = quanto tem.
 * Crédito: negativo = quanto deve (dívida).
 */
export type AccountBalance = {
  id: string;
  householdId: HouseholdId;
  accountId: AccountId;
  asOfDate: string;
  balanceCents: MoneyCents;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type CreateAccountBalanceInput = {
  householdId: HouseholdId;
  accountId: AccountId;
  asOfDate: string;
  balanceCents: MoneyCents;
  notes?: string | null;
  createdBy?: string | null;
};

export type MonthClose = {
  householdId: HouseholdId;
  month: string;
  realBalanceCents: MoneyCents;
  notes: string | null;
  closedAt: string | null;
};

export type UpsertMonthCloseInput = {
  householdId: HouseholdId;
  month: string;
  realBalanceCents: MoneyCents;
  notes?: string | null;
};

export type GoalId = string;

export type Goal = {
  id: GoalId;
  householdId: HouseholdId;
  name: string;
  targetCents: MoneyCents;
  savedCents: MoneyCents;
  personId: PersonId | null;
  deadlineMonth: string | null;
  priority: number;
  estimated: boolean;
  archived: boolean;
  notes: string | null;
  createdAt: string;
};

export type GoalContribution = {
  id: string;
  goalId: GoalId;
  month: string;
  amountCents: MoneyCents;
  notes: string | null;
  createdAt: string;
};

export type ImportBatchId = string;
export type ImportLineId = string;

export type ImportBatchSource = 'ofx' | 'csv';
export type ImportBatchStatus = 'pending' | 'reviewed' | 'applied';
export type ImportLineStatus =
  | 'suggested'
  | 'matched'
  | 'created'
  | 'ignored'
  | 'unmatched';

export type ImportBatch = {
  id: ImportBatchId;
  householdId: HouseholdId;
  accountId: AccountId;
  source: ImportBatchSource;
  fileName: string;
  checksum: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  competenceMonth: string | null;
  status: ImportBatchStatus;
  createdAt: string;
  createdBy: string | null;
};

export type ImportLine = {
  id: ImportLineId;
  batchId: ImportBatchId;
  postedOn: string;
  amountCents: MoneyCents;
  descriptionRaw: string;
  externalId: string | null;
  kind: 'expense' | 'income';
  status: ImportLineStatus;
  matchedTransactionId: TransactionId | null;
  createdTransactionId: TransactionId | null;
  /** 0–100 */
  matchConfidence: number | null;
  createdAt: string;
};

export type CategorizationRuleId = string;

/** Regra: fingerprint da descrição → categoria (import). */
export type CategorizationRule = {
  id: CategorizationRuleId;
  householdId: HouseholdId;
  fingerprint: string;
  matchExample: string;
  categoryId: CategoryId;
  personId: PersonId | null;
  hits: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

