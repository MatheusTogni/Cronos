<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import type { ActionResult } from '@/types/api'

/** Jogador: de quem é a vez no combate e o botão de encerrar o próprio turno. */
const campaign = useCampaignStore()
const combat = computed(() => campaign.combat)
const busy = ref(false)

// pulsa por uns segundos quando o foco chega ao jogador (no iPhone não há vibração)
const pulse = ref(false)
let pulseTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => campaign.isMyTurn,
  (mine, before) => {
    if (!mine || before) return
    pulse.value = true
    clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => (pulse.value = false), 6000)
  },
)

const whose = computed(() => {
  if (!combat.value) return ''
  if (campaign.isMyTurn) return 'O foco está em você'
  return combat.value.turnIndex === 0 ? 'O mundo reage' : `O foco está em ${campaign.currentTurnCharacter?.name ?? '…'}`
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
  <div v-if="combat" class="turn-bar card-frame" :class="{ mine: campaign.isMyTurn, pulse }" role="status">
    <v-icon :icon="campaign.isMyTurn ? 'mdi-sword' : 'mdi-timer-sand'" size="22" />
    <div class="text">
      <div class="whose title-font">{{ whose }}</div>
      <div class="round">Rodada {{ combat.round }}</div>
    </div>
    <v-btn
      v-if="campaign.isMyTurn"
      color="primary"
      variant="flat"
      size="small"
      :loading="busy"
      prepend-icon="mdi-skip-next"
      @click="endTurn"
    >
      Passar a vez
    </v-btn>
  </div>
</template>

<style scoped>
.turn-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
}

.turn-bar.mine {
  box-shadow:
    0 0 0 1px var(--gold),
    0 0 18px color-mix(in srgb, var(--gold) 40%, transparent);
}

.turn-bar.pulse {
  animation: turn-pulse 1.1s ease-in-out infinite;
}

@keyframes turn-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.025);
  }
}

:global(html.lite) .turn-bar.pulse {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .turn-bar.pulse {
    animation: none;
  }
}

.text {
  flex: 1 1 auto;
  min-width: 0;
}

.whose {
  font-size: 1rem;
  line-height: 1.2;
  color: var(--gold-bright);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.round {
  font-size: 0.75rem;
  line-height: 1.1;
  opacity: 0.65;
}
</style>
