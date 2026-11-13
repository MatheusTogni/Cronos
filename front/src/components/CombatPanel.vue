<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useConfirmStore } from '@/stores/confirm'
import type { ActionResult, Character } from '@/types/api'

/** Mestre: liga/desliga o combate, passa o turno e ajusta a ordem. */
const campaign = useCampaignStore()
const confirm = useConfirmStore()

const combat = computed(() => campaign.combat)
const busy = ref(false)

const order = computed(() =>
  (combat.value?.order ?? [])
    .map((id) => campaign.characterById(id))
    .filter((c): c is Character => !!c),
)

async function call(path: string, body?: object, method: 'post' | 'put' = 'post') {
  const id = campaign.campaignId
  if (!id || busy.value) return
  busy.value = true
  await campaign.act(() => api[method]<ActionResult>(`/campaigns/${id}/combat/${path}`, body ?? {}))
  busy.value = false
}

const start = () => call('start')
async function end() {
  const ok = await confirm.ask({
    title: 'Encerrar o combate?',
    text: 'Os turnos param e todos voltam a agir livremente. As condições continuam nas fichas.',
    confirmLabel: 'Encerrar combate',
    icon: 'mdi-flag-checkered',
  })
  if (ok) await call('end')
}
// manda o turno que está na tela: se alguém já passou, o servidor recusa
const next = () => call('next', { round: combat.value?.round, turnIndex: combat.value?.turnIndex })

function move(index: number, dir: -1 | 1) {
  const ids = order.value.map((c) => c.id)
  const j = index + dir
  if (j < 0 || j >= ids.length) return
  ;[ids[index], ids[j]] = [ids[j]!, ids[index]!]
  void call('order', { characterIds: ids }, 'put')
}
</script>

<template>
  <div>
    <template v-if="!combat">
      <p class="hint">Fora de combate todos agem livremente.</p>
      <v-btn block color="error" variant="flat" prepend-icon="mdi-sword-cross" :loading="busy" @click="start">
        Iniciar combate
      </v-btn>
    </template>

    <template v-else>
      <div class="round title-font">Rodada {{ combat.round }}</div>

      <ol class="order">
        <li :class="{ current: combat.turnIndex === 0 }">
          <v-icon icon="mdi-crown" size="small" />
          <span class="who">O mundo</span>
          <span class="sub">inimigos e acontecimentos</span>
        </li>
        <li v-for="(c, i) in order" :key="c.id" :class="{ current: combat.currentCharacterId === c.id, down: c.hp === 0 }">
          <span class="pos">{{ i + 1 }}</span>
          <span class="who">{{ c.name }}</span>
          <v-icon
            v-if="c.conditions.some((x) => x.skipsTurn)"
            icon="mdi-pause-circle"
            size="small"
            color="error"
            title="Vai perder a vez"
          />
          <v-btn
            icon="mdi-chevron-up"
            size="x-small"
            variant="text"
            :disabled="i === 0 || busy"
            :aria-label="`Subir ${c.name} na ordem`"
            @click="move(i, -1)"
          />
          <v-btn
            icon="mdi-chevron-down"
            size="x-small"
            variant="text"
            :disabled="i === order.length - 1 || busy"
            :aria-label="`Descer ${c.name} na ordem`"
            @click="move(i, 1)"
          />
        </li>
      </ol>

      <v-btn block color="primary" variant="flat" prepend-icon="mdi-skip-next" :loading="busy" class="mb-2" @click="next">
        {{ combat.turnIndex === 0 ? 'Passar a vez do mundo' : `Passar a vez de ${campaign.currentTurnCharacter?.name ?? '…'}` }}
      </v-btn>
      <v-btn block variant="text" size="small" prepend-icon="mdi-flag-checkered" :disabled="busy" @click="end">
        Encerrar combate
      </v-btn>
    </template>
  </div>
</template>

<style scoped>
.hint {
  opacity: 0.65;
  font-size: 0.9rem;
  margin: 0 0 10px;
}

.round {
  font-size: 1.3rem;
  color: var(--gold);
  margin-bottom: 8px;
}

.order {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  display: grid;
  gap: 2px;
}

.order li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  min-height: 36px;
}

.order li.current {
  border-color: var(--gold);
  background: color-mix(in srgb, var(--gold) 14%, transparent);
}

.order li.down {
  opacity: 0.55;
}

.pos {
  width: 20px;
  text-align: center;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.who {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.sub {
  opacity: 0.55;
  font-size: 0.8rem;
}
</style>
