<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConfirmStore } from '@/stores/confirm'

const confirm = useConfirmStore()
const { visible, options } = storeToRefs(confirm)

const color = computed(() => options.value.color ?? 'error')
const icon = computed(() => options.value.icon ?? 'mdi-alert')

// fechar por fora/Esc conta como cancelar
const open = computed({
  get: () => visible.value,
  set: (v: boolean) => {
    if (!v) confirm.answer(false)
  },
})
</script>

<template>
  <v-dialog v-model="open" max-width="420">
    <v-card class="card-frame confirm-card" color="surface">
      <div class="seal" :style="{ '--c': `rgb(var(--v-theme-${color}))` }">
        <v-icon :icon="icon" size="30" />
      </div>

      <v-card-title class="title-font text-center pt-3 px-6 confirm-title">
        {{ options.title }}
      </v-card-title>

      <v-card-text v-if="options.text" class="px-6 text-center confirm-text pre-line">
        {{ options.text }}
      </v-card-text>

      <v-card-actions class="px-6 pb-5 pt-2 justify-center ga-2">
        <v-btn variant="text" @click="confirm.answer(false)">Cancelar</v-btn>
        <v-btn :color="color" variant="flat" :prepend-icon="icon" autofocus @click="confirm.answer(true)">
          {{ options.confirmLabel ?? 'Confirmar' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.confirm-card {
  padding-top: 26px;
}

/* selo de cera com o ícone da ação */
.seal {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 0 auto;
  border-radius: 50%;
  color: #fff4e0;
  border: 1px solid rgba(243, 211, 145, 0.6);
  background: radial-gradient(
    circle at 35% 30%,
    color-mix(in srgb, var(--c), #fff 25%),
    var(--c) 45%,
    color-mix(in srgb, var(--c), #000 55%)
  );
  box-shadow:
    0 0 0 4px rgba(0, 0, 0, 0.5),
    0 0 24px color-mix(in srgb, var(--c) 55%, transparent);
  animation: seal-in 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
}

@keyframes seal-in {
  from {
    transform: scale(0.4) rotate(-30deg);
    opacity: 0;
  }
}

.confirm-title {
  white-space: normal;
  font-size: 1.2rem;
  line-height: 1.35;
}

.confirm-text {
  opacity: 0.8;
  font-size: 1rem;
}
</style>
