<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import type { ActionResult, Character } from '@/types/api'

import type { AdjustKind } from '@/types/ui'
import { HP_PER_LEVEL, MANA_PER_LEVEL, MAX_LEVEL } from '@/utils/classHooks'

/** Ação rápida do mestre: dano, cura, mana, nível e ouro. */
const props = defineProps<{ character: Character | null; kind: AdjustKind }>()
const open = defineModel<boolean>({ required: true })

const campaign = useCampaignStore()

const amount = ref<number | null>(null)
/** Mana: gastar (-) ou recuperar (+). Ouro: tirar (-) ou dar (+). Nível: descer (-) ou subir (+). */
const manaSign = ref<'-' | '+'>('-')
const reason = ref('')
const busy = ref(false)

const CONFIG = {
  damage: { title: 'Causar dano', label: 'Dano', icon: 'mdi-sword-cross', color: 'error', quick: [1, 2, 3, 5, 10, 20] },
  heal: { title: 'Curar', label: 'Vida recuperada', icon: 'mdi-heart-plus', color: 'success', quick: [1, 2, 3, 5, 10, 20] },
  mana: { title: 'Mana', label: 'Quantidade', icon: 'mdi-water', color: 'info', quick: [1, 2, 3, 5] },
  level: { title: 'Nível', label: 'Níveis', icon: 'mdi-star-four-points', color: 'secondary', quick: [1, 2, 3] },
  gold: { title: 'Ouro', label: 'Moedas de ouro', icon: 'mdi-circle-multiple', color: 'warning', quick: [1, 3, 5, 10] },
} as const

const cfg = computed(() => CONFIG[props.kind])

/** Rótulos do seletor (-)/(+) quando não é mana. */
const SIGN_LABELS: Partial<Record<AdjustKind, [string, string]>> = {
  gold: ['Tirar', 'Dar'],
  level: ['Descer', 'Subir'],
}

watch(open, (isOpen) => {
  if (!isOpen) return
  amount.value = null
  reason.value = ''
  // ouro começa em "dar" e nível em "subir"
  manaSign.value = props.kind === 'gold' || props.kind === 'level' ? '+' : '-'
})

const preview = computed(() => {
  const c = props.character
  const n = Number(amount.value) || 0
  if (!c || !n) return ''
  switch (props.kind) {
    case 'damage':
      return `Vida: ${c.hp} → ${Math.max(0, c.hp - n)}/${c.hpMax}`
    case 'heal':
      return `Vida: ${c.hp} → ${Math.min(c.hpMax, c.hp + n)}/${c.hpMax}`
    case 'mana': {
      const next = manaSign.value === '-' ? Math.max(0, c.mana - n) : Math.min(c.manaMax, c.mana + n)
      return `Mana: ${c.mana} → ${next}/${c.manaMax}`
    }
    case 'level':
      return `Nível: ${c.level} → ${Math.min(MAX_LEVEL, Math.max(1, c.level + (manaSign.value === '-' ? -n : n)))}`
    case 'gold':
      return `Ouro: ${c.gold} → ${Math.max(0, c.gold + (manaSign.value === '-' ? -n : n))}`
  }
  return ''
})

async function submit() {
  const c = props.character
  const n = Math.trunc(Number(amount.value) || 0)
  if (!c) return
  const body: Record<string, number | string> = {}
  if (props.kind === 'damage') body.hp = -Math.abs(n)
  if (props.kind === 'heal') body.hp = Math.abs(n)
  if (props.kind === 'mana') body.mana = manaSign.value === '-' ? -Math.abs(n) : Math.abs(n)
  if (props.kind === 'gold') body.gold = manaSign.value === '-' ? -Math.abs(n) : Math.abs(n)
  if (props.kind === 'level') body.level = manaSign.value === '-' ? -Math.abs(n) : Math.abs(n)
  if (!Object.values(body).some((v) => v)) return
  if (reason.value.trim()) body.reason = reason.value.trim()

  busy.value = true
  const ok = await campaign.act(() => api.post<ActionResult>(`/characters/${c.id}/adjust`, body))
  busy.value = false
  if (ok) open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="420">
    <v-card v-if="character" class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6">
        <v-icon :icon="cfg.icon" :color="cfg.color" start />
        {{ cfg.title }} — {{ character.name }}
      </v-card-title>
      <v-card-text class="px-6">
        <v-form @submit.prevent="submit">
          <v-btn-toggle
            v-if="kind === 'mana' || kind === 'gold' || kind === 'level'"
            v-model="manaSign"
            mandatory
            divided
            variant="outlined"
            :color="cfg.color"
            class="mb-3"
          >
            <v-btn value="-">{{ SIGN_LABELS[kind]?.[0] ?? 'Gastar' }}</v-btn>
            <v-btn value="+">{{ SIGN_LABELS[kind]?.[1] ?? 'Recuperar' }}</v-btn>
          </v-btn-toggle>

          <v-text-field
            v-model.number="amount"
            :label="cfg.label"
            type="number"
            min="0"
            autofocus
            hide-details
            class="mb-2"
          />
          <div class="quick">
            <v-chip v-for="q in cfg.quick" :key="q" size="small" variant="outlined" @click="amount = q">
              {{ q }}
            </v-chip>
          </div>

          <p v-if="kind === 'level'" class="hint">
            Cada nível: +{{ HP_PER_LEVEL }} vida e +{{ MANA_PER_LEVEL }} mana. Vai do 1 ao {{ MAX_LEVEL }}; a 2ª skill abre
            no 5 e a 3ª no 10.
          </p>

          <v-text-field
            v-model="reason"
            label="Motivo (opcional)"
            placeholder="ex.: mordida do lobo"
            maxlength="120"
            hide-details
            class="mt-3"
          />

          <div v-if="preview" class="preview">{{ preview }}</div>
          <button type="submit" hidden />
        </v-form>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn :color="cfg.color" variant="flat" :loading="busy" @click="submit">Aplicar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hint {
  margin: 10px 0 0;
  font-size: 0.9rem;
  opacity: 0.65;
}

.preview {
  margin-top: 14px;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}
</style>
