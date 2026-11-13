<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useConditionsStore } from '@/stores/conditions'
import { useNotifyStore } from '@/stores/notify'
import {
  POLARITY_COLOR,
  POLARITY_LABEL,
  type ActionResult,
  type ConditionDef,
  type ConditionPolarity,
  type ConditionTarget,
  type TargetKind,
} from '@/types/api'

/**
 * Mestre coloca uma condição (do catálogo ou livre) num personagem, numa
 * invocação ou num inimigo. É só um status à mostra: não tem prazo nem efeito
 * automático, e quem tira é o mestre.
 */
const props = defineProps<{ target: ConditionTarget | null }>()

const URL: Record<TargetKind, (id: string) => string> = {
  character: (id) => `/characters/${id}/conditions`,
  summon: (id) => `/summons/${id}/conditions`,
  npc: (id) => `/npcs/${id}/conditions`,
}
const open = defineModel<boolean>({ required: true })

const campaign = useCampaignStore()
const catalog = useConditionsStore()
const notify = useNotifyStore()

/** Item do catálogo escolhido ou nome digitado. */
const choice = ref<ConditionDef | string | null>(null)
const polarity = ref<ConditionPolarity>('DEBUFF')
const description = ref('')
const error = ref('')
const busy = ref(false)

const def = computed(() => (choice.value && typeof choice.value === 'object' ? choice.value : null))
const POLARITIES: ConditionPolarity[] = ['DEBUFF', 'BUFF', 'NEUTRAL']

watch(open, (isOpen) => {
  if (!isOpen) return
  choice.value = null
  polarity.value = 'DEBUFF'
  description.value = ''
  error.value = ''
  catalog.load().catch((e: unknown) => notify.error(errorMessage(e)))
})

// escolher do catálogo preenche tipo e descrição (dá para ajustar antes de aplicar)
watch(def, (d) => {
  if (!d) return
  polarity.value = d.polarity
  description.value = d.description
})

async function submit() {
  error.value = ''
  const target = props.target
  if (!target) return
  const name = typeof choice.value === 'string' ? choice.value.trim() : ''
  if (!def.value && !name) {
    error.value = 'Escolha uma condição ou digite um nome'
    return
  }

  const body: Record<string, unknown> = { polarity: polarity.value }
  if (def.value) body.defId = def.value.id
  else body.name = name
  if (description.value.trim()) body.description = description.value.trim()

  busy.value = true
  const ok = await campaign.act(() => api.post<ActionResult>(URL[target.kind](target.id), body))
  busy.value = false
  if (ok) open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="460" scrollable>
    <v-card class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6">Condição em {{ target?.name ?? '' }}</v-card-title>
      <v-card-text class="px-6">
        <v-form @submit.prevent="submit">
          <v-combobox
            v-model="choice"
            :items="catalog.list"
            item-title="name"
            label="Condição"
            hint="Escolha do catálogo ou digite uma nova"
            persistent-hint
            autofocus
            clearable
            class="mb-3"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="item.description">
                <template #prepend>
                  <v-icon icon="mdi-circle" size="x-small" :color="POLARITY_COLOR[item.polarity]" />
                </template>
              </v-list-item>
            </template>
          </v-combobox>

          <div class="section-label">Tipo</div>
          <v-btn-toggle v-model="polarity" mandatory divided variant="outlined" density="comfortable" class="mb-3 pol-toggle">
            <v-btn v-for="p in POLARITIES" :key="p" :value="p" :color="POLARITY_COLOR[p]">{{ POLARITY_LABEL[p] }}</v-btn>
          </v-btn-toggle>

          <v-textarea v-model="description" label="Detalhes (opcional)" maxlength="300" rows="2" auto-grow hide-details />

          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
          <button type="submit" hidden />
        </v-form>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" @click="submit">Aplicar</v-btn>
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

.pol-toggle {
  flex-wrap: wrap;
  height: auto;
}
</style>
