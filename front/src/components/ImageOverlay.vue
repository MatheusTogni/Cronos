<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * Imagem que o mestre está mostrando. Abre sozinha quando o mestre mostra uma
 * imagem nova; o jogador pode fechar e reabrir pelo botão flutuante.
 */
const props = defineProps<{ image: { id: string; title: string; url: string } | null }>()

const open = ref(false)

watch(
  () => props.image?.id,
  (id, prev) => {
    open.value = !!id && id !== prev
    if (!id) open.value = false
  },
  { immediate: true },
)
</script>

<template>
  <v-dialog v-model="open" fullscreen transition="fade-transition">
    <div v-if="image" class="overlay" @click="open = false">
      <img :src="image.url" :alt="image.title" class="overlay-img" />
      <div class="overlay-title title-font">{{ image.title }}</div>
      <v-btn icon="mdi-close" class="overlay-close" variant="tonal" aria-label="Fechar imagem" @click.stop="open = false" />
    </div>
  </v-dialog>

  <v-btn
    v-if="image && !open"
    class="reopen"
    color="secondary"
    prepend-icon="mdi-image"
    rounded="pill"
    @click="open = true"
  >
    Ver imagem do mestre
  </v-btn>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 3, 5, 0.94);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
}

.overlay-img {
  max-width: 100%;
  max-height: calc(100dvh - 90px);
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
}

.overlay-title {
  margin-top: 12px;
  color: var(--gold);
  font-size: 1.1rem;
  text-align: center;
}

.overlay-close {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  right: 12px;
}

.reopen {
  position: fixed;
  right: 16px;
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 5;
}
</style>
