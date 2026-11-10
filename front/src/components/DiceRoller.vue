<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import type { ActionResult } from '@/types/api'

/** Rolagem avulsa que aparece no log para todos. */
const props = defineProps<{ campaignId: string }>()

const campaign = useCampaignStore()

const DICE = [4, 6, 8, 10, 12, 20, 100]
const sides = ref(20)
const physical = ref<number | null>(null)
const label = ref('')
const busy = ref(false)
const last = ref<number | null>(null)

async function roll() {
  busy.value = true
  let result: number | null = null
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(`/campaigns/${props.campaignId}/roll`, {
      sides: sides.value,
      ...(physical.value ? { value: physical.value } : {}),
      ...(label.value.trim() ? { label: label.value.trim() } : {}),
    })
    result = res.data.log?.roll ?? null
    return res
  })
  busy.value = false
  if (ok) {
    last.value = result
    physical.value = null
    label.value = ''
  }
}
</script>

<template>
  <div class="roller">
    <v-chip-group v-model="sides" mandatory selected-class="text-secondary" class="dice">
      <v-chip v-for="d in DICE" :key="d" :value="d" size="small" variant="outlined">d{{ d }}</v-chip>
    </v-chip-group>
    <div class="row">
      <v-text-field
        v-model.number="physical"
        type="number"
        label="Dado físico (opcional)"
        density="compact"
        hide-details
        :min="1"
        :max="sides"
        class="field"
      />
      <v-text-field
        v-model="label"
        label="Para quê? (opcional)"
        density="compact"
        hide-details
        maxlength="60"
        class="field"
      />
      <v-btn color="secondary" variant="flat" :loading="busy" prepend-icon="mdi-dice-d20" @click="roll">
        {{ physical ? 'Registrar' : 'Rolar' }}
      </v-btn>
    </div>
    <div v-if="last !== null" class="last" aria-live="polite">
      Saiu <strong :class="{ crit: last === sides }">{{ last }}</strong> no d{{ sides }}
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.field {
  flex: 1 1 160px;
}

.last {
  margin-top: 8px;
  opacity: 0.85;
}

.last strong {
  font-family: var(--font-title);
  font-size: 1.4rem;
}

.crit {
  color: var(--gold);
}
</style>
