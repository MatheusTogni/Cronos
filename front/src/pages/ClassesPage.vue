<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ClassSheet from '@/components/ClassSheet.vue'
import { errorMessage } from '@/services/api'
import { useClassesStore } from '@/stores/classes'
import type { CharacterClass } from '@/types/api'

const classes = useClassesStore()
const { list } = storeToRefs(classes)

const loading = ref(false)
const error = ref('')
const selected = ref<CharacterClass | null>(null)
const showArt = ref(false)
const dialogOpen = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    await classes.load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

function open(cls: CharacterClass) {
  selected.value = cls
  showArt.value = false
  dialogOpen.value = true
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Classes</h1>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="load">Tentar de novo</v-btn>
      </template>
    </v-alert>

    <v-progress-linear v-if="loading && !list.length" indeterminate color="secondary" />

    <div class="grid">
      <button
        v-for="cls in list"
        :key="cls.id"
        class="class-card"
        type="button"
        :style="{ '--accent': cls.color }"
        @click="open(cls)"
      >
        <v-img :src="cls.artFile" :alt="cls.name" aspect-ratio="1" cover position="top" />
        <div class="class-info">
          <div class="title-font class-name">{{ cls.name }}</div>
          <div class="class-cats">{{ cls.categories.join(' · ') }}</div>
        </div>
      </button>
    </div>

    <v-dialog v-model="dialogOpen" max-width="720" scrollable>
      <v-card v-if="selected" class="card-frame" color="surface">
        <v-card-text class="pa-5">
          <img v-if="showArt" :src="selected.artFile" :alt="`Ficha original: ${selected.name}`" class="art-full" />
          <ClassSheet v-else :cls="selected" />
        </v-card-text>
        <v-card-actions class="px-5 pb-4">
          <v-btn
            variant="text"
            :prepend-icon="showArt ? 'mdi-text-box' : 'mdi-image'"
            @click="showArt = !showArt"
          >
            {{ showArt ? 'Ver em texto' : 'Ver ficha original' }}
          </v-btn>
          <v-spacer />
          <v-btn variant="text" @click="dialogOpen = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
}

.class-card {
  --accent: var(--crimson);
  text-align: left;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  overflow: hidden;
  background: #18131a;
  color: inherit;
  cursor: pointer;
  transition:
    transform 150ms ease-out,
    border-color 150ms ease-out;
}

.class-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .class-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .class-card {
    transition: none;
  }
}

.class-info {
  padding: 10px 12px 12px;
  border-top: 2px solid var(--accent);
}

.class-name {
  font-weight: 700;
  font-size: 1.05rem;
}

.class-cats {
  font-size: 0.85rem;
  opacity: 0.65;
}

.art-full {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}
</style>
