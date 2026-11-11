<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useConditionsStore } from '@/stores/conditions'
import { useNotifyStore } from '@/stores/notify'
import type { ActionResult, ConditionTarget, LogEntry } from '@/types/api'

/** Mestre escolhe em quem cai o efeito pendente de uma habilidade. */
const props = defineProps<{ entry: LogEntry | null }>()
const open = defineModel<boolean>({ required: true })

const campaign = useCampaignStore()
const catalog = useConditionsStore()
const notify = useNotifyStore()
const busy = ref(false)

watch(open, (isOpen) => {
  if (isOpen) catalog.load().catch((e: unknown) => notify.error(errorMessage(e)))
})

const effectLabel = computed(() =>
  (props.entry?.pendingEffect?.conditions ?? [])
    .map((c) => {
      const name = c.name ?? (c.defId ? (catalog.byId(c.defId)?.name ?? c.defId) : '?')
      return c.turns ? `${name} (${c.turns} ${c.turns === 1 ? 'turno' : 'turnos'})` : name
    })
    .join(', '),
)

const groups = computed(() => {
  const s = campaign.state
  if (!s) return []
  const party: ConditionTarget[] = s.characters.map((c) => ({ kind: 'character', id: c.id, name: c.name }))
  const summons: ConditionTarget[] = s.characters.flatMap((c) =>
    c.summons.map((sm) => ({ kind: 'summon' as const, id: sm.id, name: `${sm.name} (de ${c.name})` })),
  )
  const npcs: ConditionTarget[] = s.npcs.map((n) => ({ kind: 'npc', id: n.id, name: n.name }))
  return [
    { title: 'Inimigos', icon: 'mdi-account-alert', items: npcs },
    { title: 'Party', icon: 'mdi-account-group', items: party },
    { title: 'Invocações', icon: 'mdi-skull', items: summons },
  ].filter((g) => g.items.length)
})

async function apply(target: ConditionTarget) {
  const e = props.entry
  if (!e || busy.value) return
  busy.value = true
  const ok = await campaign.act(() =>
    api.post<ActionResult>(`/logs/${e.id}/apply`, { kind: target.kind, id: target.id }),
  )
  busy.value = false
  if (ok) open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="440" scrollable>
    <v-card v-if="entry?.pendingEffect" class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6">Aplicar em…</v-card-title>
      <v-card-text class="px-6">
        <p class="what">
          <strong>{{ effectLabel }}</strong>, de {{ entry.pendingEffect.source }}
        </p>
        <div v-if="!groups.length" class="empty">Ninguém na mesa para receber o efeito.</div>
        <template v-for="g in groups" :key="g.title">
          <div class="section-label"><v-icon :icon="g.icon" size="x-small" /> {{ g.title }}</div>
          <v-list density="compact" class="mb-2 py-0" bg-color="transparent">
            <v-list-item
              v-for="t in g.items"
              :key="t.id"
              :title="t.name"
              :disabled="busy"
              append-icon="mdi-target"
              @click="apply(t)"
            />
          </v-list>
        </template>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.what {
  margin: 0 0 12px;
}

.empty {
  opacity: 0.6;
  font-style: italic;
}

.section-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
  margin: 8px 0 2px;
}
</style>
