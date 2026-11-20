<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import { useCampaignStore } from '@/stores/campaign'
import { useNotifyStore } from '@/stores/notify'

/**
 * Mestre: manda uma mensagem secreta para os jogadores escolhidos. Ela aparece
 * só na tela deles e não fica guardada (não vai para o log).
 */
const props = defineProps<{ campaignId: string; userId?: string | null }>()
const open = defineModel<boolean>({ required: true })

const campaign = useCampaignStore()
const notify = useNotifyStore()

const players = computed(() => campaign.state?.players ?? [])
const chosen = ref<string[]>([])
const message = ref('')
const busy = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  message.value = ''
  chosen.value = props.userId ? [props.userId] : []
})

/** Nome mostrado ao lado do jogador: "Fulano (Personagem)". */
const label = (userId: string, displayName: string) => {
  const c = campaign.state?.characters.find((x) => x.userId === userId)
  return c ? `${displayName} (${c.name})` : displayName
}

const canSend = computed(() => chosen.value.length > 0 && !!message.value.trim())

async function send() {
  if (!canSend.value || busy.value) return
  busy.value = true
  const ok = await campaign.act(() =>
    api
      .post(`/campaigns/${props.campaignId}/whisper`, { userIds: chosen.value, message: message.value.trim() })
      .then(() => ({ data: null })),
  )
  busy.value = false
  if (ok) {
    const names = chosen.value.map(campaign.playerName).join(', ')
    notify.success(`Mensagem secreta enviada para ${names}`)
    open.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="460">
    <v-card class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6">
        <v-icon icon="mdi-email-seal" color="secondary" start />
        Mensagem secreta
      </v-card-title>
      <v-card-text class="px-6">
        <div class="label">Para quem?</div>
        <div class="pick-list">
          <v-checkbox
            v-for="p in players"
            :key="p.userId"
            v-model="chosen"
            :value="p.userId"
            :label="label(p.userId, p.displayName)"
            density="compact"
            hide-details
          />
          <div v-if="!players.length" class="empty">Ainda não há jogadores nesta campanha.</div>
        </div>

        <v-textarea
          v-model="message"
          label="Mensagem"
          placeholder="Só quem você escolher vai ler…"
          maxlength="1000"
          counter
          rows="4"
          auto-grow
          class="mt-4"
          :disabled="!players.length"
        />
        <div class="hint">
          <v-icon icon="mdi-eye-off" size="x-small" /> Aparece só na tela dos escolhidos e não fica no log.
        </div>
      </v-card-text>
      <v-card-actions class="px-6 pb-5 pt-2">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn color="secondary" variant="flat" prepend-icon="mdi-send" :disabled="!canSend" :loading="busy" @click="send">
          Enviar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.label {
  font-family: var(--font-title);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 4px;
}

.pick-list {
  max-height: 220px;
  overflow-y: auto;
}

.empty {
  opacity: 0.6;
  font-style: italic;
}

.hint {
  font-size: 0.85rem;
  opacity: 0.6;
}
</style>
