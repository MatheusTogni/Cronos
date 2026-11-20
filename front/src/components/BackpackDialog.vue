<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BackpackGrid from '@/components/BackpackGrid.vue'
import ItemIcon from '@/components/ItemIcon.vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useConfirmStore } from '@/stores/confirm'
import { useNotifyStore } from '@/stores/notify'
import type { ActionResult, Character, InventoryItem } from '@/types/api'
import type { TransferMode } from '@/types/ui'
import { BACKPACK_SLOTS } from '@/utils/backpack'
import { shopItem } from '@/utils/shop'

/**
 * A mochila do jogador: quadradinhos de 3×3 com o ícone de cada item e a
 * quantidade. Tocar num quadradinho mostra o que o item faz e as ações dele
 * (usar, dar, trocar). Dar e trocar abrem a oferta na ficha.
 */
const props = defineProps<{ character: Character }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ transfer: [mode: Exclude<TransferMode, 'gold'>, item: InventoryItem] }>()

const campaign = useCampaignStore()
const confirm = useConfirmStore()
const notify = useNotifyStore()

const inventory = computed(() => props.character.inventory)
const full = computed(() => inventory.value.length >= BACKPACK_SLOTS)

/** O item aberto embaixo da grade. Some sozinho se o item acabar. */
const selectedId = ref<string | null>(null)
const selected = computed(() => inventory.value.find((i) => i.id === selectedId.value) ?? null)
/** O item do catálogo da loja (só ele pode ser usado pelo app). */
const product = computed(() => shopItem(selected.value?.code))

watch(open, (isOpen) => {
  if (isOpen) selectedId.value = null
})

const description = computed(() => selected.value?.description || product.value?.description || 'Sem descrição.')

interface Effect {
  icon: string
  color: string
  text: string
}
/** O que o item faz ao ser usado. */
const effects = computed<Effect[]>(() => {
  const p = product.value
  if (!p) return []
  const list: Effect[] = []
  if (p.hp) list.push({ icon: 'mdi-heart', color: 'error', text: `+${p.hp} de vida` })
  if (p.mana) list.push({ icon: 'mdi-water', color: 'info', text: `+${p.mana} de mana` })
  if (p.keep) list.push({ icon: 'mdi-infinity', color: 'secondary', text: 'Não se gasta ao usar' })
  return list
})

/** Por que Usar está desligado agora (vazio = liberado). */
const useBlock = computed(() =>
  campaign.canAct ? '' : campaign.fallen ? 'Caído: você não pode agir.' : 'Só dá para usar na sua vez.',
)

const using = ref(false)
async function useSelected() {
  const item = selected.value
  const p = product.value
  if (!item || !p || using.value) return
  const c = props.character
  // item de cura com tudo o que ele recupera já cheio: pede confirmação antes de gastar
  const hpFull = !p.hp || c.hp >= c.hpMax
  const manaFull = !p.mana || c.mana >= c.manaMax
  if ((p.hp || p.mana) && hpFull && manaFull) {
    const what =
      p.hp && p.mana
        ? 'Sua vida e sua mana já estão cheias'
        : p.hp
          ? `Sua vida já está cheia (${c.hp}/${c.hpMax})`
          : `Sua mana já está cheia (${c.mana}/${c.manaMax})`
    const ok = await confirm.ask({
      title: `Usar ${item.name}?`,
      text: `${what}. O item será gasto sem efeito.`,
      confirmLabel: 'Usar mesmo assim',
      icon: 'mdi-flask-round-bottom',
      color: 'warning',
    })
    if (!ok) return
  }
  using.value = true
  const result = { log: null as ActionResult['log'] }
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(`/items/${item.id}/use`)
    result.log = res.data.log
    return res
  })
  using.value = false
  if (ok && result.log) notify.success(result.log.message)
}

function transfer(mode: Exclude<TransferMode, 'gold'>) {
  const item = selected.value
  if (!item) return
  open.value = false
  emit('transfer', mode, item)
}
</script>

<template>
  <v-dialog v-model="open" max-width="420" scrollable>
    <v-card class="card-frame" color="surface">
      <v-card-title class="title-font pt-4 px-5 d-flex align-center ga-2">
        <v-icon icon="mdi-bag-personal" color="secondary" />
        <span class="flex-grow-1">Mochila</span>
        <v-chip :color="full ? 'error' : undefined" size="small" variant="tonal">
          {{ inventory.length }}/{{ BACKPACK_SLOTS }}
        </v-chip>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar a mochila" @click="open = false" />
      </v-card-title>

      <v-card-text class="px-5">
        <BackpackGrid :inventory="inventory" :selected-id="selectedId" @select="selectedId = $event" />

        <p v-if="!inventory.length" class="note">Nada na mochila por enquanto.</p>
        <p v-else-if="full && !selected" class="note">Mochila cheia: só cabem mais unidades do que você já tem.</p>

        <section v-if="selected" class="detail" aria-live="polite">
          <div class="detail-head">
            <ItemIcon :item="selected" :size="36" />
            <div class="detail-title">
              <div class="title-font detail-name">{{ selected.name }}</div>
              <div class="detail-qty">Você tem {{ selected.qty }}</div>
            </div>
          </div>

          <p class="detail-desc pre-line">{{ description }}</p>

          <div v-if="effects.length" class="effects">
            <v-chip v-for="e in effects" :key="e.text" :color="e.color" size="small" variant="tonal" :prepend-icon="e.icon">
              {{ e.text }}
            </v-chip>
          </div>

          <div class="detail-actions">
            <v-btn
              v-if="product"
              color="primary"
              variant="flat"
              prepend-icon="mdi-flask-round-bottom"
              :loading="using"
              :disabled="!campaign.canAct"
              @click="useSelected"
            >
              Usar
            </v-btn>
            <v-btn variant="tonal" prepend-icon="mdi-gift-outline" :disabled="!!campaign.offerBlock" @click="transfer('give')">
              Dar
            </v-btn>
            <v-btn variant="tonal" prepend-icon="mdi-swap-horizontal" :disabled="!!campaign.offerBlock" @click="transfer('trade')">
              Trocar
            </v-btn>
          </div>
          <p v-if="product && useBlock" class="note">{{ useBlock }}</p>
          <p v-if="campaign.offerBlock" class="note">{{ campaign.offerBlock }}</p>
        </section>
        <p v-else-if="inventory.length" class="note">Toque num item para ver o que ele faz.</p>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
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

.effects {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.detail-actions .v-btn {
  flex: 1 1 0;
  min-width: 0;
}
</style>
