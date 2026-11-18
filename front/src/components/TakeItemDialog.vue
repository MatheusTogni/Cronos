<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BackpackGrid from '@/components/BackpackGrid.vue'
import ItemIcon from '@/components/ItemIcon.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useNotifyStore } from '@/stores/notify'
import type { ActionResult, Character } from '@/types/api'
import { BACKPACK_SLOTS } from '@/utils/backpack'

/**
 * O mestre tira um item da mochila de um jogador, como pode dar um item: vê os
 * quadradinhos, escolhe o item e, se houver mais de uma unidade, quantas tirar.
 * Tudo vai para o log e dá para desfazer por lá.
 */
const props = defineProps<{ character: Character | null }>()
const open = defineModel<boolean>({ required: true })

const campaign = useCampaignStore()
const notify = useNotifyStore()

const inventory = computed(() => props.character?.inventory ?? [])

/** O item escolhido, lido da mochila de agora. Some sozinho se o item acabar. */
const selectedId = ref<string | null>(null)
const selected = computed(() => inventory.value.find((i) => i.id === selectedId.value) ?? null)

const amount = ref<number | string>(1)
/** Quantas tirar: de 1 até o que o jogador tem. */
const toTake = computed(() => {
  const item = selected.value
  if (!item) return 0
  return Math.min(item.qty, Math.max(1, Math.trunc(Number(amount.value) || 1)))
})
const takeLabel = computed(() => {
  const item = selected.value
  if (!item || item.qty === 1) return 'Tirar'
  return toTake.value >= item.qty ? 'Tirar todas' : `Tirar ${toTake.value}`
})

watch(open, (isOpen) => {
  if (!isOpen) return
  selectedId.value = null
  amount.value = 1
})
// escolher outro item recomeça a quantidade
watch(selectedId, () => {
  amount.value = 1
})

const busy = ref(false)
async function take() {
  const item = selected.value
  const c = props.character
  if (!item || !c || busy.value) return
  const n = toTake.value
  busy.value = true
  // tudo: apaga o item; só parte: baixa a quantidade
  const ok = await campaign.act(() =>
    n >= item.qty
      ? api.delete<ActionResult>(`/items/${item.id}`)
      : api.patch<ActionResult>(`/items/${item.id}`, { qty: item.qty - n }),
  )
  busy.value = false
  if (ok) {
    notify.success(`Tirou ${n > 1 ? `${n}× ` : ''}${item.name} de ${c.name}`)
    amount.value = 1
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="420" scrollable>
    <v-card v-if="character" class="card-frame" color="surface">
      <v-card-title class="title-font pt-4 px-5 d-flex align-center ga-2">
        <v-icon icon="mdi-bag-personal-off-outline" color="secondary" />
        <span class="flex-grow-1 name">Tirar item de {{ character.name }}</span>
        <v-chip size="small" variant="tonal">{{ inventory.length }}/{{ BACKPACK_SLOTS }}</v-chip>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="open = false" />
      </v-card-title>

      <v-card-text class="px-5">
        <BackpackGrid :inventory="inventory" :selected-id="selectedId" @select="selectedId = $event" />

        <p v-if="!inventory.length" class="note">A mochila está vazia.</p>
        <p v-else-if="!selected" class="note">Toque num item para escolher o que tirar.</p>

        <section v-if="selected" class="detail" aria-live="polite">
          <div class="detail-head">
            <ItemIcon :item="selected" :size="36" />
            <div class="detail-title">
              <div class="title-font detail-name">{{ selected.name }}</div>
              <div class="detail-qty">Tem {{ selected.qty }}</div>
            </div>
          </div>

          <p v-if="selected.description" class="detail-desc pre-line">{{ selected.description }}</p>

          <div v-if="selected.qty > 1" class="amount">
            <v-text-field
              v-model.number="amount"
              type="number"
              min="1"
              :max="selected.qty"
              label="Quantas tirar"
              density="compact"
              hide-details
            />
            <v-btn variant="text" size="small" @click="amount = selected.qty">Todas</v-btn>
          </div>

          <v-btn
            block
            color="error"
            variant="flat"
            prepend-icon="mdi-delete-outline"
            class="mt-3"
            :loading="busy"
            @click="take"
          >
            {{ takeLabel }}
          </v-btn>
          <p class="note">Dá para desfazer pelo log.</p>
        </section>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note {
  margin: 12px 0 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

.detail {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-title {
  min-width: 0;
}

.detail-name {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--gold-bright);
}

.detail-qty {
  font-size: 0.85rem;
  opacity: 0.7;
}

.detail-desc {
  margin: 10px 0 0;
  line-height: 1.4;
}

.amount {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
</style>
