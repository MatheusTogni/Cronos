<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useNotifyStore } from '@/stores/notify'
import type { ActionResult } from '@/types/api'

/**
 * O popup de quem recebe uma doação ou troca: aceitar ou recusar. Aparece
 * sozinho assim que a oferta chega e só fecha com a resposta (ou se quem
 * ofereceu cancelar). Quem recebe responde em qualquer momento, mesmo fora da vez.
 */
const campaign = useCampaignStore()
const notify = useNotifyStore()

const t = computed(() => campaign.incomingTransfer)
/** Outras ofertas na fila, depois desta. */
const waiting = computed(() => Math.max(0, campaign.incomingTransfers.length - 1))
const busy = ref<'accept' | 'decline' | null>(null)

const stack = (x: { name: string; qty: number }) => `${x.qty > 1 ? `${x.qty}× ` : ''}${x.name}`

async function accept() {
  const offer = t.value
  if (!offer || busy.value) return
  busy.value = 'accept'
  const result = { log: null as ActionResult['log'] }
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(`/transfers/${offer.id}/accept`)
    result.log = res.data.log
    return res
  })
  busy.value = null
  if (ok) {
    campaign.dropTransfer(offer.id)
    if (result.log) notify.success(result.log.message)
  }
}

async function decline() {
  const offer = t.value
  if (!offer || busy.value) return
  busy.value = 'decline'
  const ok = await campaign.act(() => api.post(`/transfers/${offer.id}/decline`).then(() => ({ data: null })))
  busy.value = null
  if (ok) campaign.dropTransfer(offer.id)
}
</script>

<template>
  <v-dialog :model-value="!!t" persistent max-width="420">
    <v-card v-if="t" class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6 d-flex align-center ga-2">
        <v-icon :icon="t.kind === 'TRADE' ? 'mdi-swap-horizontal' : 'mdi-gift-outline'" color="secondary" />
        <span class="flex-grow-1">{{ t.kind === 'TRADE' ? 'Proposta de troca' : 'Você recebeu uma oferta' }}</span>
      </v-card-title>

      <v-card-text class="px-6">
        <p class="from">
          <strong>{{ t.from.name }}</strong>
          <template v-if="t.kind === 'TRADE'"> quer trocar com você:</template>
          <template v-else> quer te dar:</template>
        </p>

        <!-- doação -->
        <div v-if="t.kind === 'GIFT'" class="box">
          <v-icon :icon="t.gold > 0 ? 'mdi-circle-multiple' : 'mdi-bag-personal'" size="large" color="secondary" />
          <div class="what">
            <template v-if="t.gold > 0">{{ t.gold }} {{ t.gold === 1 ? 'moeda' : 'moedas' }} de ouro</template>
            <template v-else-if="t.give">{{ stack(t.give) }}</template>
          </div>
        </div>

        <!-- troca: o que ele dá e o que pede de você -->
        <div v-else class="trade">
          <div class="box">
            <div class="who">{{ t.from.name }} dá</div>
            <div class="what">{{ t.give ? stack(t.give) : '' }}</div>
          </div>
          <v-icon icon="mdi-swap-vertical" class="swap" />
          <div class="box">
            <div class="who">e pede o seu</div>
            <div class="what">{{ t.ask ? stack(t.ask) : '' }}</div>
          </div>
        </div>

        <p v-if="waiting" class="more">+{{ waiting }} {{ waiting === 1 ? 'oferta aguardando' : 'ofertas aguardando' }} depois desta</p>
      </v-card-text>

      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" :disabled="busy === 'accept'" :loading="busy === 'decline'" @click="decline">Recusar</v-btn>
        <v-btn color="primary" variant="flat" :disabled="busy === 'decline'" :loading="busy === 'accept'" @click="accept">
          Aceitar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.from {
  margin: 0 0 10px;
}

.box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.what {
  font-family: var(--font-title);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--gold-bright);
}

.trade {
  display: grid;
  gap: 6px;
  justify-items: stretch;
}

.trade .box {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.who {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
}

.swap {
  justify-self: center;
  color: var(--gold);
}

.more {
  margin: 12px 0 0;
  font-size: 0.85rem;
  opacity: 0.65;
}
</style>
