import { Condition, Prisma } from '@prisma/client';
import { HealthBand, healthBand } from '../game/health';
import { uploadUrl } from '../images/upload-dir';

/** Quem está vendo: o mestre da campanha ou os jogadores. */
export const AUDIENCES = ['master', 'players'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Tudo o que a ficha mostra de um personagem. */
export const characterInclude = {
  summons: {
    orderBy: { createdAt: 'asc' },
    include: { conditions: { orderBy: { createdAt: 'asc' } } },
  },
  conditions: { orderBy: { createdAt: 'asc' } },
  inventory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CharacterInclude;

export const logSelect = {
  id: true,
  type: true,
  message: true,
  masterMessage: true,
  roll: true,
  characterId: true,
  createdAt: true,
  revertedAt: true,
  delta: true,
  actor: { select: { id: true, displayName: true } },
} satisfies Prisma.LogEntrySelect;

/** Entrada do log como o servidor a guarda: com as duas mensagens. */
export type LogDto = Omit<
  Prisma.LogEntryGetPayload<{ select: typeof logSelect }>,
  'delta'
> & { revertible: boolean };

/** Entrada do log como sai para o front: uma só `message`, a de quem lê. */
export type LogView = Omit<LogDto, 'masterMessage'>;

export const toLogDto = (
  entry: Prisma.LogEntryGetPayload<{ select: typeof logSelect }>,
): LogDto => {
  const { delta, ...rest } = entry;
  return { ...rest, revertible: !!delta && !entry.revertedAt };
};

/**
 * Escolhe a mensagem de quem vai ler: o mestre vê a completa, os jogadores a
 * narrada.
 */
export function logView(log: LogDto, audience: Audience): LogView {
  const { masterMessage, ...rest } = log;
  return {
    ...rest,
    message:
      audience === 'master' ? (masterMessage ?? log.message) : log.message,
  };
}

/**
 * Inimigo como o front recebe. Todos veem nome, faixa de saúde e condições;
 * a vida (números) e as anotações só o mestre recebe.
 */
export interface NpcView {
  id: string;
  campaignId: string;
  name: string;
  band: HealthBand;
  conditions: Condition[];
  hp?: number;
  hpMax?: number;
  notes?: string;
}

/** Monta o estado completo da campanha, como o mestre vê. */
export async function buildCampaignState(
  db: Prisma.TransactionClient,
  campaignId: string,
) {
  const c = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      master: { select: { id: true, displayName: true } },
      shownImage: true,
      players: {
        orderBy: { joinedAt: 'asc' },
        include: {
          user: { select: { id: true, displayName: true, username: true } },
        },
      },
      characters: {
        orderBy: { createdAt: 'asc' },
        include: characterInclude,
      },
      npcs: {
        orderBy: { createdAt: 'asc' },
        include: { conditions: { orderBy: { createdAt: 'asc' } } },
      },
    },
  });

  return {
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    createdAt: c.createdAt,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    master: c.master,
    /** Loja do mercador aberta para os jogadores. */
    shopOpen: c.shopOpen,
    combat: c.inCombat
      ? {
          round: c.round,
          turnIndex: c.turnIndex,
          order: c.turnOrder,
          /** null = turno do mestre. */
          currentCharacterId:
            c.turnIndex > 0 ? (c.turnOrder[c.turnIndex - 1] ?? null) : null,
        }
      : null,
    players: c.players.map((p) => ({
      userId: p.userId,
      displayName: p.user.displayName,
      username: p.user.username,
      ready: p.ready,
      joinedAt: p.joinedAt,
    })),
    characters: c.characters,
    npcs: c.npcs.map((n): NpcView => ({
      id: n.id,
      campaignId: n.campaignId,
      name: n.name,
      band: healthBand(n.hp, n.hpMax),
      conditions: n.conditions,
      hp: n.hp,
      hpMax: n.hpMax,
      notes: n.notes,
    })),
    shownImage: c.shownImage
      ? {
          id: c.shownImage.id,
          title: c.shownImage.title,
          url: uploadUrl(c.shownImage.filename),
        }
      : null,
  };
}

export type CampaignState = Awaited<ReturnType<typeof buildCampaignState>>;

/** O mesmo estado sem o que é só do mestre (vida e anotações dos inimigos). */
export function forPlayers(state: CampaignState): CampaignState {
  return {
    ...state,
    npcs: state.npcs.map(
      ({ id, campaignId, name, band, conditions }): NpcView => ({
        id,
        campaignId,
        name,
        band,
        conditions,
      }),
    ),
  };
}

// ───────────── envio por partes ─────────────

/** Lista de entidades com id: o que entrou/mudou, o que saiu e a ordem nova. */
export interface ListPatch<T> {
  upsert: T[];
  remove: string[];
  /** Só vem quando a ordem mudou. */
  order?: string[];
}

/**
 * O que mudou desde o último envio. Cada item vem INTEIRO (não é diferença
 * de campo), então aplicar o mesmo patch duas vezes, ou sobre um estado mais
 * novo, dá o mesmo resultado.
 */
export interface CampaignPatch {
  id: string;
  set?: Partial<Omit<CampaignState, 'characters' | 'npcs'>>;
  characters?: ListPatch<CampaignState['characters'][number]>;
  npcs?: ListPatch<CampaignState['npcs'][number]>;
}

/** Retrato serializado do estado, para comparar com o próximo. */
export interface StateSnapshot {
  fields: Map<string, string>;
  characters: Map<string, string>;
  npcs: Map<string, string>;
}

const byId = <T extends { id: string }>(list: T[]) =>
  new Map(list.map((x) => [x.id, JSON.stringify(x)]));

export function snapshotState(state: CampaignState): StateSnapshot {
  const { characters, npcs, ...rest } = state;
  return {
    fields: new Map(
      Object.entries(rest).map(([k, v]) => [k, JSON.stringify(v)]),
    ),
    characters: byId(characters),
    npcs: byId(npcs),
  };
}

function diffList<T extends { id: string }>(
  list: T[],
  now: Map<string, string>,
  before: Map<string, string>,
): ListPatch<T> | undefined {
  const upsert = list.filter((x) => before.get(x.id) !== now.get(x.id));
  const remove = [...before.keys()].filter((id) => !now.has(id));
  const sameOrder =
    [...before.keys()].filter((id) => now.has(id)).join() ===
    list
      .map((x) => x.id)
      .filter((id) => before.has(id))
      .join();
  if (!upsert.length && !remove.length && sameOrder) return undefined;
  return {
    upsert,
    remove,
    ...(sameOrder ? {} : { order: list.map((x) => x.id) }),
  };
}

/** Patch do estado novo em relação ao retrato anterior (null = nada mudou). */
export function diffState(
  state: CampaignState,
  now: StateSnapshot,
  before: StateSnapshot,
): CampaignPatch | null {
  const set: Record<string, unknown> = {};
  for (const [k, v] of now.fields) {
    if (before.fields.get(k) !== v) {
      set[k] = state[k as keyof CampaignState];
    }
  }
  const characters = diffList(
    state.characters,
    now.characters,
    before.characters,
  );
  const npcs = diffList(state.npcs, now.npcs, before.npcs);
  if (!Object.keys(set).length && !characters && !npcs) return null;
  return {
    id: state.id,
    ...(Object.keys(set).length ? { set } : {}),
    ...(characters ? { characters } : {}),
    ...(npcs ? { npcs } : {}),
  };
}
