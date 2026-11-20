<script setup lang="ts">
import { computed, watch } from 'vue'
import { useCampaignStore } from '@/stores/campaign'
import { buzz } from '@/utils/haptics'

/**
 * Mensagem secreta do mestre, na tela só de quem ele escolheu. Abre sozinha
 * quando chega e o jogador fecha quando quiser. Se chegarem várias, aparecem
 * uma depois da outra. Nada disso fica guardado nem vai para o log.
 */
const campaign = useCampaignStore()

const current = computed(() => campaign.whispers[0] ?? null)
const waiting = computed(() => Math.max(0, campaign.whispers.length - 1))

const open = computed({
  get: () => !!current.value,
  set: (v) => {
    if (!v) dismiss()
  },
})

function dismiss() {
  campaign.whispers.shift()
}

watch(
  () => current.value?.id,
  (id) => {
    if (id) buzz([60, 40, 60])
  },
)

const time = computed(() =>
  current.value ? new Date(current.value.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
)
</script>

<template>
  <!-- acima da imagem do mestre (que o jogador não fecha), mesmo que ela abra depois -->
  <v-dialog v-model="open" max-width="460" scrollable :z-index="2600">
    <v-card v-if="current" :key="current.id" class="card-frame whisper" color="surface">
      <div class="seal" aria-hidden="true">
        <v-icon icon="mdi-email-seal" size="30" />
      </div>

      <v-card-title class="title-font whisper-title">Mensagem secreta</v-card-title>
      <div class="whisper-sub">do mestre · {{ time }}</div>

      <v-card-text class="px-6 pt-4">
        <p class="whisper-text pre-line">{{ current.message }}</p>
      </v-card-text>

      <div class="whisper-foot">
        <v-icon icon="mdi-eye-off" size="x-small" /> Só você pode ler isto.
      </div>

      <v-card-actions class="px-6 pb-5 pt-1">
        <span v-if="waiting" class="waiting">+{{ waiting }} {{ waiting === 1 ? 'mensagem' : 'mensagens' }}</span>
        <v-spacer />
        <v-btn color="secondary" variant="flat" @click="dismiss">
          {{ waiting ? 'Próxima' : 'Fechar' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.whisper {
  text-align: center;
  overflow: visible;
}

.seal {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin: 22px auto 6px;
  border-radius: 50%;
  color: var(--gold-bright);
  border: 1px solid var(--border-strong);
  background: radial-gradient(circle at 35% 30%, #c0453b, #6e1a17 70%);
  box-shadow:
    0 0 0 3px #0b0810,
    0 0 0 4px rgba(212, 160, 76, 0.45),
    0 0 22px rgba(168, 50, 43, 0.45);
  animation: seal-in 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
}

@keyframes seal-in {
  from {
    opacity: 0;
    transform: scale(0.4) rotate(-25deg);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.whisper-title {
  justify-content: center;
  padding: 4px 24px 0;
  font-size: 1.2rem;
  white-space: normal;
}

.whisper-sub {
  font-size: 0.85rem;
  opacity: 0.6;
  font-style: italic;
}

.whisper-text {
  margin: 0;
  padding: 14px 16px;
  text-align: left;
  font-size: 1.12rem;
  line-height: 1.5;
  color: var(--parchment);
  border-top: 1px solid var(--border-soft);
  border-bottom: 1px solid var(--border-soft);
  background: linear-gradient(180deg, rgba(234, 223, 202, 0.04), rgba(234, 223, 202, 0.01));
  overflow-wrap: anywhere;
}

.whisper-foot {
  margin-top: 4px;
  font-size: 0.82rem;
  opacity: 0.55;
}

.waiting {
  font-size: 0.9rem;
  opacity: 0.7;
}

html.lite .seal {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .seal {
    animation: none;
  }
}
</style>
