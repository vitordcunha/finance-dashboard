export const qk = {
  session: ['session'] as const,
  household: () => ['household'] as const,
  people: () => ['people'] as const,
  accounts: () => ['accounts'] as const,
  categories: () => ['categories'] as const,
  settings: () => ['settings'] as const,
  contributionMode: () => ['settings', 'contribution_mode'] as const,
  minimumBalance: () => ['settings', 'minimum_balance_cents'] as const,
  month: (ym: string) => ['month', ym] as const,
  contributionCustomBps: () =>
    ['settings', 'contribution_custom_bps'] as const,
  transactions: (ym: string) => ['transactions', ym] as const,
  transactionsRecent: () => ['transactions', 'recent'] as const,
  timelineRows: (from: string, to: string) =>
    ['transactions', 'timeline', from, to] as const,
  transactionsBetween: (from: string, to: string) =>
    ['transactions', 'between', from, to] as const,
  cards: () => ['cards'] as const,
  card: (accountId: string) => ['card', accountId] as const,
  cardInvoice: (accountId: string, ym: string) =>
    ['card', accountId, ym] as const,
  cardPayments: (accountId: string, ym: string) =>
    ['card', accountId, ym, 'payments'] as const,
  cardPurchases: (accountId: string, ym: string) =>
    ['card', accountId, ym, 'purchases'] as const,
  accountBalances: () => ['account-balances'] as const,
  accountBalance: (accountId: string) =>
    ['account-balances', accountId] as const,
  balanceAnchor: () => ['balance-anchor'] as const,
  monthCloses: () => ['month-closes'] as const,
  monthClose: (ym: string) => ['month-closes', ym] as const,
  goals: () => ['goals'] as const,
  goalContributions: (ym: string) => ['goals', 'contributions', ym] as const,
  importBatch: (id: string) => ['import', id] as const,
  importLines: (batchId: string) => ['import', batchId, 'lines'] as const,
  categorizationRules: () => ['categorization-rules'] as const,
};
