<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useNotifyStore } from '@/stores/notify'
import type { ActionResult, Character } from '@/types/api'

/** Anotações pessoais do jogador: pistas, nomes e planos. Ficam salvas na ficha. */
const props = defineProps<{ character: Character }>()
const open = defineModel<boolean>({ required: true })

const campaign = useCampaignStore()
const notify = useNotifyStore()

const text = ref('')
const dirty = computed(() => text.value !== props.character.notes)
const saving = ref(false)

// a cada abertura, parte do que está salvo
watch(open, (isOpen) => {
  if (isOpen) text.value = props.character.notes
})

async function save() {
  saving.value = true
  const ok = await campaign.act(() =>
    api.patch<ActionResult>(`/characters/${props.character.id}`, { notes: text.value }),
  )
  saving.value = false
  if (ok) {
    notify.success('Anotações salvas')
    open.value = false
  }
}
</script>

<template>
  <!-- com texto por salvar, tocar fora não fecha: não perde o que foi escrito -->
  <v-dialog v-model="open" max-width="480" scrollable :persistent="dirty">
    <v-card class="card-frame" color="surface">
      <v-card-title class="title-font pt-4 px-5 d-flex align-center ga-2">
        <v-icon icon="mdi-notebook-outline" color="secondary" />
        <span class="flex-grow-1">Anotações</span>
      </v-card-title>

      <v-card-text class="px-5">
        <v-textarea
          v-model="text"
          rows="8"
          auto-grow
          max-rows="14"
          maxlength="5000"
          placeholder="Pistas, nomes, planos…"
          hide-details
        />
      </v-card-text>

      <v-card-actions class="px-5 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ dirty ? 'Descartar' : 'Fechar' }}</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" :disabled="!dirty" @click="save">Salvar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
