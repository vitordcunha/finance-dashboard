import type { CaptureDraft, LineItem } from './parse.ts';

const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
    amountRaw: {
      type: 'string',
      description: 'Valor em reais como string pt-BR, ex: "35,90"',
    },
    description: { type: 'string' },
    date: {
      type: ['string', 'null'],
      description: 'yyyy-MM-dd se conhecido; null se hoje',
    },
    personHint: {
      type: ['string', 'null'],
      description: 'casa, eu, ou nome da pessoa',
    },
    accountHint: { type: ['string', 'null'] },
    transferAccountHint: {
      type: ['string', 'null'],
      description: 'Conta destino se kind=transfer',
    },
    categoryHint: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    installments: {
      type: ['integer', 'null'],
      description: 'N parcelas se houver (ex. 10); null se à vista',
    },
    lineItems: {
      type: ['array', 'null'],
      description: 'Itens do cupom se legíveis; null se só o total',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          amountRaw: { type: 'string' },
        },
        required: ['description', 'amountRaw'],
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'kind',
    'amountRaw',
    'description',
    'confidence',
    'warnings',
  ],
} as const;

const STRICT_SCHEMA = {
  ...DRAFT_JSON_SCHEMA,
  required: [
    ...DRAFT_JSON_SCHEMA.required,
    'personHint',
    'accountHint',
    'transferAccountHint',
    'categoryHint',
    'notes',
    'date',
    'installments',
    'lineItems',
  ],
};

function systemPrompt(context: {
  accounts: string[];
  people: string[];
  categories: string[];
}): string {
  return [
    'Você extrai lançamentos financeiros de mensagens, fotos, PDFs ou áudio em português do Brasil.',
    'Responda só com o JSON do schema. Não invente valores: se o total for incerto, baixe confidence e use warnings.',
    'Em cupons/NFs, use o TOTAL A PAGAR (não subtotal, não troco, não CNPJ).',
    'Se o cupom tiver vários itens legíveis, preencha lineItems; senão lineItems=null.',
    'kind: expense (saída), income (entrada), transfer (entre contas da casa — só se origem e destino forem claros).',
    'amountRaw: string com vírgula decimal pt-BR. Em parcelas, amountRaw é o TOTAL.',
    'installments: número N se "10x"/"em 10 vezes"; null se à vista.',
    'personHint: "casa" para gasto da casa, "eu" para pessoal, ou nome.',
    `Contas: ${context.accounts.join(', ') || '(nenhuma)'}`,
    `Pessoas: Casa, ${context.people.join(', ') || ''}`,
    `Categorias: ${context.categories.join(', ') || '(nenhuma)'}`,
  ].join('\n');
}

function normalizeDraft(parsed: CaptureDraft & {
  installments?: number | null;
  lineItems?: LineItem[] | null;
  transferAccountHint?: string | null;
}): CaptureDraft {
  const installments =
    typeof parsed.installments === 'number' &&
    parsed.installments >= 2 &&
    parsed.installments <= 48
      ? parsed.installments
      : undefined;

  const lineItems = Array.isArray(parsed.lineItems)
    ? parsed.lineItems
        .map((it) => ({
          description: String(it.description ?? '').slice(0, 200),
          amountRaw: String(it.amountRaw ?? ''),
        }))
        .filter((it) => it.description && it.amountRaw)
    : null;

  return {
    kind:
      parsed.kind === 'income'
        ? 'income'
        : parsed.kind === 'transfer'
          ? 'transfer'
          : 'expense',
    amountRaw: String(parsed.amountRaw ?? ''),
    description: String(parsed.description ?? '').slice(0, 200),
    date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : undefined,
    personHint: parsed.personHint ?? null,
    accountHint: parsed.accountHint ?? null,
    transferAccountHint: parsed.transferAccountHint ?? null,
    categoryHint: parsed.categoryHint ?? null,
    notes: parsed.notes ?? null,
    installments,
    lineItems: lineItems && lineItems.length >= 2 ? lineItems : null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}

export async function extractWithGpt(input: {
  apiKey: string;
  text?: string;
  imageUrl?: string;
  pdfBase64?: string;
  pdfFilename?: string;
  context: {
    accounts: string[];
    people: string[];
    categories: string[];
  };
}): Promise<CaptureDraft> {
  if (input.pdfBase64) {
    return extractFromPdf(input);
  }
  return extractFromChatCompletions(input);
}

/**
 * Enrichment: cheap-parse já fixou o valor. LLM normaliza descrição e sugere
 * categoria/conta/quem — amountRaw do retorno é informativo (merge trava o cheap).
 */
export async function enrichWithGpt(input: {
  apiKey: string;
  text: string;
  locked: {
    amountRaw: string;
    kind: CaptureDraft['kind'];
    description: string;
  };
  context: {
    accounts: string[];
    people: string[];
    categories: string[];
  };
}): Promise<CaptureDraft> {
  const enrichPrompt = [
    systemPrompt(input.context),
    '',
    'MODO ENRIQUECIMENTO: o valor e o tipo já foram parseados localmente.',
    `amountRaw OBRIGATÓRIO (não altere): "${input.locked.amountRaw}"`,
    `kind sugerido: ${input.locked.kind}`,
    `descrição bruta: "${input.locked.description}"`,
    'Normalize a description (Title Case / nome do merchant), preencha categoryHint',
    'com uma categoria da lista, accountHint/personHint se fizer sentido.',
    'Se discordar do valor, ainda assim devolva o amountRaw travado e use warnings.',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'capture_draft',
          strict: true,
          schema: STRICT_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: enrichPrompt },
        {
          role: 'user',
          content: `Mensagem original: ${input.text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI enrich ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = json.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI enrich sem conteúdo');

  const draft = normalizeDraft(JSON.parse(content));
  // Força amount travado mesmo se o modelo ignorar
  draft.amountRaw = input.locked.amountRaw;
  return draft;
}

async function extractFromChatCompletions(input: {
  apiKey: string;
  text?: string;
  imageUrl?: string;
  context: {
    accounts: string[];
    people: string[];
    categories: string[];
  };
}): Promise<CaptureDraft> {
  const userContent: unknown[] = [];
  if (input.text) {
    userContent.push({ type: 'text', text: input.text });
  }
  if (input.imageUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: input.imageUrl },
    });
  }
  if (userContent.length === 0) {
    throw new Error('Nada para extrair');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'capture_draft',
          strict: true,
          schema: STRICT_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: systemPrompt(input.context) },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = json.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI sem conteúdo');

  return normalizeDraft(JSON.parse(content));
}

async function extractFromPdf(input: {
  apiKey: string;
  text?: string;
  pdfBase64?: string;
  pdfFilename?: string;
  context: {
    accounts: string[];
    people: string[];
    categories: string[];
  };
}): Promise<CaptureDraft> {
  const filename = (input.pdfFilename || 'cupom.pdf').replace(/[^\w.\-]+/g, '_');
  const userText =
    input.text?.trim() ||
    'Extraia o lançamento financeiro deste PDF de cupom/nota fiscal.';

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      instructions: systemPrompt(input.context),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename,
              file_data: `data:application/pdf;base64,${input.pdfBase64}`,
            },
            { type: 'input_text', text: userText },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'capture_draft',
          strict: true,
          schema: STRICT_SCHEMA,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI PDF ${res.status}: ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  let content = json.output_text?.trim() ?? '';
  if (!content && Array.isArray(json.output)) {
    for (const item of json.output) {
      if (item.type !== 'message' || !item.content) continue;
      for (const part of item.content) {
        if (part.type === 'output_text' && part.text) {
          content = part.text;
          break;
        }
      }
      if (content) break;
    }
  }
  if (!content) throw new Error('OpenAI PDF sem conteúdo');

  return normalizeDraft(JSON.parse(content));
}

/** Transcrição Whisper (pt-BR). */
export async function transcribeAudio(input: {
  apiKey: string;
  bytes: Uint8Array;
  filename: string;
  mimeType?: string;
}): Promise<string> {
  const form = new FormData();
  const blob = new Blob([input.bytes], {
    type: input.mimeType || 'audio/ogg',
  });
  form.append('file', blob, input.filename);
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as { text?: string };
  return (json.text ?? '').trim();
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
