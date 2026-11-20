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
</script>

<template>
  <!-- acima da imagem do mestre (que o jogador não fecha), mesmo que ela abra depois;
       embaixo e sem escurecer o fundo, para a imagem continuar à vista -->
  <v-dialog v-model="open" class="whisper-dialog" max-width="460" scrollable :scrim="false" :z-index="2600" transition="dialog-bottom-transition">
    <v-card v-if="current" :key="current.id" class="card-frame" color="surface">
      <v-card-text class="px-6 pt-5 pb-1">
        <p class="whisper-text pre-line">{{ current.message }}</p>
      </v-card-text>

      <v-card-actions class="px-6 pb-4">
        <span v-if="waiting" class="waiting">+{{ waiting }}</span>
        <v-spacer />
        <v-btn color="secondary" variant="flat" @click="dismiss">
          {{ waiting ? 'Próxima' : 'Fechar' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.whisper-text {
  margin: 0;
  font-size: 1.12rem;
  line-height: 1.5;
  color: var(--parchment);
  overflow-wrap: anywhere;
}

.waiting {
  font-size: 0.9rem;
  opacity: 0.6;
}
</style>

<style>
/* o diálogo encosta na parte de baixo da tela em vez do centro */
.v-overlay.whisper-dialog {
  align-items: flex-end;
}

.v-overlay.whisper-dialog > .v-overlay__content {
  margin-bottom: max(16px, env(safe-area-inset-bottom));
  max-height: 40dvh;
}
</style>
