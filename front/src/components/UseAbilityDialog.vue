<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import type { Ability, ActionResult, Character } from '@/types/api'
import { critLabel } from '@/utils/abilities'

/**
 * O jogador diz na mesa o que vai fazer e confirma a skill aqui: o app só gasta
 * a mana e registra no log. Dano, efeitos e condições são do mestre.
 */
const props = defineProps<{ character: Character; ability: Ability | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ used: [log: ActionResult['log']] }>()

const campaign = useCampaignStore()
const busy = ref(false)

const enoughMana = computed(() => (props.ability?.manaCost ?? 0) <= props.character.mana)

async function submit() {
  const a = props.ability
  if (!a) return
  busy.value = true
  let log: ActionResult['log'] = null
  const ok = await campaign.act(async () => {
    const res = await api.post<ActionResult>(`/characters/${props.character.id}/abilities/${a.id}/use`)
    log = res.data.log
    return res
  })
  busy.value = false
  if (ok) {
    emit('used', log)
    open.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" scrollable>
    <v-card v-if="ability" class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6 d-flex align-center ga-2">
        <span class="flex-grow-1">{{ ability.name }}</span>
        <v-chip v-if="ability.manaCost" color="info" size="small" variant="tonal" prepend-icon="mdi-water">
          {{ ability.manaCost }}
        </v-chip>
      </v-card-title>

      <v-card-text class="px-6">
        <p class="pre-line desc">{{ ability.description }}</p>

        <ul v-if="ability.crits?.length" class="crits">
          <li v-for="c in ability.crits" :key="c.min">
            <strong>{{ critLabel(c) }}:</strong> {{ c.text }}
          </li>
        </ul>

        <v-alert v-if="campaign.fallen" type="error" variant="tonal" density="compact" class="mb-3">
          {{ character.name }} está caído e não pode agir.
        </v-alert>
        <v-alert v-else-if="!campaign.canAct" type="warning" variant="tonal" density="compact" class="mb-3">
          Não é a sua vez: aguarde o seu turno no combate.
        </v-alert>
        <v-alert v-if="!enoughMana" type="warning" variant="tonal" density="compact" class="mb-3">
          Mana insuficiente: precisa de {{ ability.manaCost }}, você tem {{ character.mana }}.
        </v-alert>

        <div class="hint">Diga na mesa o que você faz. O mestre decide o que acontece.</div>
      </v-card-text>

      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" :disabled="!enoughMana || !campaign.canAct" @click="submit">
          Usar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.desc {
  margin: 0 0 8px;
  line-height: 1.4;
}

.crits {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  font-size: 0.95rem;
}

.crits strong {
  color: var(--gold);
}

.hint {
  font-size: 0.85rem;
  opacity: 0.65;
  margin-top: 4px;
}
</style>
