<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import type { ActionResult } from '@/types/api'

/** Jogador: de quem é a vez no combate e o botão de encerrar o próprio turno. */
const campaign = useCampaignStore()
const combat = computed(() => campaign.combat)
const busy = ref(false)

const whose = computed(() => {
  if (!combat.value) return ''
  if (campaign.isMyTurn) return 'Sua vez!'
  return combat.value.turnIndex === 0 ? 'Vez do Mestre' : `Vez de ${campaign.currentTurnCharacter?.name ?? '…'}`
})

async function endTurn() {
  const c = combat.value
  if (!c || !campaign.campaignId) return
  busy.value = true
  await campaign.act(() =>
    api.post<ActionResult>(`/campaigns/${campaign.campaignId}/combat/next`, {
      round: c.round,
      turnIndex: c.turnIndex,
    }),
  )
  busy.value = false
}
</script>

<template>
  <div v-if="combat" class="turn-bar card-frame" :class="{ mine: campaign.isMyTurn }" role="status">
    <v-icon :icon="campaign.isMyTurn ? 'mdi-sword' : 'mdi-timer-sand'" />
    <div class="text">
      <div class="whose title-font">{{ whose }}</div>
      <div class="round">Combate · rodada {{ combat.round }}</div>
    </div>
    <v-btn v-if="campaign.isMyTurn" color="primary" variant="flat" :loading="busy" prepend-icon="mdi-skip-next" @click="endTurn">
      Encerrar turno
    </v-btn>
  </div>
</template>

<style scoped>
.turn-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
}

.turn-bar.mine {
  box-shadow:
    0 0 0 1px var(--gold),
    0 0 18px color-mix(in srgb, var(--gold) 40%, transparent);
}

.text {
  flex: 1 1 auto;
  min-width: 0;
}

.whose {
  font-size: 1.1rem;
  color: var(--gold-bright);
}

.round {
  font-size: 0.85rem;
  opacity: 0.65;
}
</style>
