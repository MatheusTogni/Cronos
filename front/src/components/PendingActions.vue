<script setup lang="ts">
import { computed, reactive } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useClassesStore } from '@/stores/classes'
import type { Ability, ActionResult, LogEntry } from '@/types/api'

/**
 * Mestre: as ações que os jogadores declararam e esperam por ele. O jogador
 * rola o d20 na mesa; o mestre toca no número (que vira o dano e vale para o
 * crítico) e resolve, ou nega e a mana volta.
 */
const campaign = useCampaignStore()
const classes = useClassesStore()

const entries = computed(() => campaign.pendingActions)

interface Draft {
  roll: number | null
  summonName: string
  busy: boolean
}
const drafts = reactive<Record<string, Draft>>({})
const draft = (id: string) => (drafts[id] ??= { roll: null, summonName: '', busy: false })

function abilityOf(e: LogEntry): Ability | undefined {
  const a = e.pendingAction
  if (!a) return undefined
  const classId = campaign.characterById(a.characterId)?.classId
  return classId ? classes.byId(classId)?.abilities.find((x) => x.id === a.abilityId) : undefined
}
const critAt = (e: LogEntry, roll: number) => abilityOf(e)?.crits?.find((c) => roll >= c.min && roll <= c.max)

const targetName = (e: LogEntry) => {
  const t = e.pendingAction?.target
  return t ? (t.kind === 'self' ? 'si mesmo' : t.name) : ''
}

async function send(e: LogEntry, path: 'resolve' | 'deny', body: object = {}) {
  const d = draft(e.id)
  d.busy = true
  const ok = await campaign.act(() => api.post<ActionResult>(`/logs/${e.id}/${path}`, body))
  d.busy = false
  if (ok) delete drafts[e.id]
}

function resolve(e: LogEntry) {
  const a = e.pendingAction
  const d = draft(e.id)
  if (!a || (a.needsRoll && d.roll === null)) return
  const body: Record<string, unknown> = {}
  if (a.needsRoll) body.roll = d.roll
  if (d.summonName.trim()) body.summonName = d.summonName.trim()
  return send(e, 'resolve', body)
}
</script>

<template>
  <v-card v-if="entries.length" class="pending card-frame pa-4" color="surface">
    <div class="side-title">Aguardando você ({{ entries.length }})</div>

    <div v-for="e in entries" :key="e.id" class="item">
      <template v-if="e.pendingAction">
        <div class="line">
          <strong>{{ e.pendingAction.characterName }}</strong> usa <strong>{{ e.pendingAction.abilityName }}</strong>
          <template v-if="targetName(e)"> em <strong>{{ targetName(e) }}</strong></template>
        </div>
        <div v-if="e.pendingAction.manaCost || e.pendingAction.note" class="meta">
          <span v-if="e.pendingAction.manaCost">{{ e.pendingAction.manaCost }} de mana já cobrada</span>
          <span v-if="e.pendingAction.note"> · "{{ e.pendingAction.note }}"</span>
        </div>

        <template v-if="e.pendingAction.needsRoll">
          <div class="dice-label">
            <v-icon icon="mdi-dice-d20" size="small" /> d20 da mesa
            <span v-if="e.pendingAction.dealsDamage" class="hint">(vira o dano)</span>
          </div>
          <div class="dice" role="group" aria-label="Resultado do d20">
            <button
              v-for="n in 20"
              :key="n"
              type="button"
              class="die"
              :class="{ on: draft(e.id).roll === n, crit: !!critAt(e, n) }"
              :aria-pressed="draft(e.id).roll === n"
              @click="draft(e.id).roll = n"
            >
              {{ n }}
            </button>
          </div>
          <div v-if="draft(e.id).roll !== null" class="outcome">
            <template v-if="e.pendingAction.dealsDamage">
              Dano: <strong>{{ draft(e.id).roll }}</strong>
            </template>
            <template v-if="critAt(e, draft(e.id).roll!)">
              <template v-if="e.pendingAction.dealsDamage"> · </template>
              Crítico: {{ critAt(e, draft(e.id).roll!)!.text }}
            </template>
            <template v-else-if="!e.pendingAction.dealsDamage">Sem crítico.</template>
          </div>
        </template>
        <div v-else class="hint">Sem dado: só confirmar.</div>

        <v-text-field
          v-if="abilityOf(e)?.effect === 'SUMMON'"
          v-model="draft(e.id).summonName"
          label="Nome da criatura (opcional)"
          maxlength="60"
          density="compact"
          hide-details
          class="mt-2"
        />

        <div class="actions">
          <v-btn
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="mdi-check"
            :loading="draft(e.id).busy"
            :disabled="e.pendingAction.needsRoll && draft(e.id).roll === null"
            @click="resolve(e)"
          >
            Resolver
          </v-btn>
          <v-btn variant="text" size="small" prepend-icon="mdi-close" :disabled="draft(e.id).busy" @click="send(e, 'deny')">
            Negar
          </v-btn>
        </div>
      </template>
    </div>
  </v-card>
</template>

<style scoped>
.pending {
  border-left: 3px solid var(--gold) !important;
}

.side-title {
  font-family: var(--font-title);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 8px;
}

.item {
  padding: 10px 0;
  border-top: 1px solid var(--border-soft);
}

.item:first-of-type {
  border-top: 0;
}

.line {
  line-height: 1.3;
}

.meta,
.hint {
  font-size: 0.85rem;
  opacity: 0.65;
}

.dice-label {
  margin: 10px 0 6px;
  font-size: 0.85rem;
  opacity: 0.8;
}

.dice {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px;
}

.die {
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  cursor: pointer;
}

/* faixas de crítico da habilidade em destaque */
.die.crit {
  border-color: var(--gold);
  color: var(--gold-bright);
}

.die.on {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.outcome {
  margin-top: 8px;
  font-size: 0.95rem;
}

.actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
</style>
