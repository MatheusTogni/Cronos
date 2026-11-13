<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useClassesStore } from '@/stores/classes'
import { useNotifyStore } from '@/stores/notify'
import type { Character, InventoryItem } from '@/types/api'
import type { TransferMode } from '@/types/ui'

/**
 * Quem oferece: escolhe o que dar (um item ou ouro), para quem, e na troca
 * qual item do inventário da outra pessoa quer em troca. A oferta vira um
 * popup de aceitar ou recusar na tela de quem recebe.
 */
const props = defineProps<{ character: Character; item: InventoryItem | null; mode: TransferMode }>()
const open = defineModel<boolean>({ required: true })

const campaign = useCampaignStore()
const classes = useClassesStore()
const notify = useNotifyStore()

const kind = ref<'GIFT' | 'TRADE'>('GIFT')
const qty = ref<number | string>(1)
const gold = ref<number | string>(1)
const toId = ref<string | null>(null)
const askItemId = ref<string | null>(null)
const askQty = ref<number | string>(1)
const error = ref('')
const busy = ref(false)

const isGold = computed(() => props.mode === 'gold')
const isTrade = computed(() => !isGold.value && kind.value === 'TRADE')
const others = computed(() => campaign.state?.characters.filter((c) => c.id !== props.character.id) ?? [])
const recipient = computed(() => others.value.find((c) => c.id === toId.value) ?? null)
const askItem = computed(() => recipient.value?.inventory.find((i) => i.id === askItemId.value) ?? null)

const title = computed(() => {
  if (isGold.value) return 'Dar ouro'
  return `${kind.value === 'TRADE' ? 'Trocar' : 'Dar'} ${props.item?.name ?? ''}`
})
const icon = computed(() =>
  isGold.value ? 'mdi-circle-multiple' : kind.value === 'TRADE' ? 'mdi-swap-horizontal' : 'mdi-gift-outline',
)

watch(open, (isOpen) => {
  if (!isOpen) return
  kind.value = props.mode === 'trade' ? 'TRADE' : 'GIFT'
  qty.value = 1
  gold.value = 1
  toId.value = others.value.length === 1 ? (others.value[0]?.id ?? null) : null
  askItemId.value = null
  askQty.value = 1
  error.value = ''
})
// trocar de pessoa ou de item pedido recomeça a quantidade pedida
watch(toId, () => {
  askItemId.value = null
  askQty.value = 1
})
watch(askItemId, () => {
  askQty.value = 1
})

const toInt = (v: number | string) => Math.trunc(Number(v) || 0)
const classOf = (c: Character) => classes.byId(c.classId)

async function send() {
  error.value = ''
  const to = recipient.value
  if (!to) {
    error.value = 'Escolha para quem'
    return
  }
  const body: Record<string, unknown> = { toCharacterId: to.id, kind: isGold.value ? 'GIFT' : kind.value }

  if (isGold.value) {
    const g = toInt(gold.value)
    if (g < 1 || g > props.character.gold) {
      error.value = props.character.gold ? `Informe de 1 a ${props.character.gold} moedas` : 'Você não tem ouro'
      return
    }
    body.gold = g
  } else {
    const item = props.item
    if (!item) return
    const q = toInt(qty.value)
    if (q < 1 || q > item.qty) {
      error.value = `Quantidade de 1 a ${item.qty}`
      return
    }
    body.itemId = item.id
    body.qty = q
    if (isTrade.value) {
      const ask = askItem.value
      if (!ask) {
        error.value = `Escolha o item de ${to.name} que você quer em troca`
        return
      }
      const aq = toInt(askQty.value)
      if (aq < 1 || aq > ask.qty) {
        error.value = `Quantidade pedida de 1 a ${ask.qty}`
        return
      }
      body.askItemId = ask.id
      body.askQty = aq
    }
  }

  busy.value = true
  // a oferta chega pelo evento do servidor (ou pelo recarregamento, se estiver sem conexão)
  const ok = await campaign.act(() =>
    api.post(`/characters/${props.character.id}/transfers`, body).then(() => ({ data: null })),
  )
  busy.value = false
  if (ok) {
    open.value = false
    notify.info(`Oferta enviada a ${to.name}`)
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" scrollable>
    <v-card class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6 d-flex align-center ga-2">
        <v-icon :icon="icon" color="secondary" />
        <span class="flex-grow-1">{{ title }}</span>
      </v-card-title>

      <v-card-text class="px-6">
        <v-btn-toggle
          v-if="!isGold"
          v-model="kind"
          mandatory
          divided
          variant="outlined"
          color="secondary"
          class="mb-4"
        >
          <v-btn value="GIFT" prepend-icon="mdi-gift-outline">Dar</v-btn>
          <v-btn value="TRADE" prepend-icon="mdi-swap-horizontal">Trocar</v-btn>
        </v-btn-toggle>

        <div class="section-label">Você oferece</div>
        <v-text-field
          v-if="isGold"
          v-model.number="gold"
          type="number"
          min="1"
          :max="character.gold"
          label="Moedas de ouro"
          :hint="`Você tem ${character.gold}`"
          persistent-hint
        />
        <div v-else-if="item" class="offer">
          <v-icon icon="mdi-bag-personal" />
          <div class="offer-main">
            <strong>{{ item.name }}</strong>
            <div class="muted">Você tem {{ item.qty }}</div>
          </div>
          <v-text-field
            v-if="item.qty > 1"
            v-model.number="qty"
            type="number"
            min="1"
            :max="item.qty"
            label="Quantas"
            density="compact"
            hide-details
            class="qty"
          />
        </div>

        <div class="section-label mt-4">Para quem</div>
        <v-list v-if="others.length" class="people" density="compact" bg-color="transparent">
          <v-list-item
            v-for="c in others"
            :key="c.id"
            :active="toId === c.id"
            color="secondary"
            rounded
            @click="toId = c.id"
          >
            <template #prepend>
              <v-avatar size="36" class="mr-3">
                <v-img v-if="classOf(c)" :src="classOf(c)!.artFile" cover position="top" :alt="classOf(c)!.name" />
              </v-avatar>
            </template>
            <v-list-item-title>{{ c.name }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ classOf(c)?.name ?? c.classId }}<template v-if="campaign.playerName(c.userId)"> · {{ campaign.playerName(c.userId) }}</template>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
        <div v-else class="muted">Não há outros jogadores nesta aventura.</div>

        <template v-if="isTrade && recipient">
          <div class="section-label mt-4">Em troca de</div>
          <div v-if="!recipient.inventory.length" class="muted">{{ recipient.name }} não tem itens para trocar.</div>
          <template v-else>
            <v-list class="people" density="compact" bg-color="transparent">
              <v-list-item
                v-for="it in recipient.inventory"
                :key="it.id"
                :active="askItemId === it.id"
                color="secondary"
                rounded
                @click="askItemId = it.id"
              >
                <v-list-item-title>{{ it.name }}</v-list-item-title>
                <template #append>
                  <span class="muted">×{{ it.qty }}</span>
                </template>
              </v-list-item>
            </v-list>
            <v-text-field
              v-if="askItem && askItem.qty > 1"
              v-model.number="askQty"
              type="number"
              min="1"
              :max="askItem.qty"
              label="Quantas você quer"
              density="compact"
              hide-details
              class="mt-2"
            />
          </template>
        </template>

        <div v-if="recipient" class="muted mt-3">
          {{ recipient.name }} recebe um aviso na tela para aceitar ou recusar.
        </div>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
      </v-card-text>

      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" :disabled="!recipient" @click="send">Enviar oferta</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.section-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
  margin-bottom: 6px;
}

.muted {
  font-size: 0.85rem;
  opacity: 0.65;
}

.offer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.offer-main {
  flex: 1 1 auto;
  min-width: 0;
}

.qty {
  flex: 0 0 96px;
}

.people {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
}
</style>
