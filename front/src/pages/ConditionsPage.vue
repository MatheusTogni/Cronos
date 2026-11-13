<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConditionArt from '@/components/ConditionArt.vue'
import ConditionSheet from '@/components/ConditionSheet.vue'
import FrameGallery from '@/components/FrameGallery.vue'
import { errorMessage } from '@/services/api'
import { useConditionsStore } from '@/stores/conditions'
import { POLARITY_LABEL, type ConditionPolarity } from '@/types/api'
import { conditionArt } from '@/utils/conditionArt'

/** Galeria do catálogo de condições, no mesmo estilo da de classes. */
const catalog = useConditionsStore()

const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    await catalog.load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

type Filter = 'ALL' | ConditionPolarity
const filter = ref<Filter>('ALL')
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'DEBUFF', label: 'Negativas' },
  { value: 'BUFF', label: 'Positivas' },
  { value: 'NEUTRAL', label: 'Neutras' },
]

const items = computed(() =>
  catalog.list
    .filter((d) => filter.value === 'ALL' || d.polarity === filter.value)
    .map((def) => ({
      id: def.id,
      name: def.name,
      subtitle: POLARITY_LABEL[def.polarity],
      accent: conditionArt(def.id, def.polarity).color,
      def,
    })),
)

onMounted(() => void load())
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Condições</h1>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="load">Tentar de novo</v-btn>
      </template>
    </v-alert>

    <v-progress-linear v-if="loading && !catalog.list.length" indeterminate color="secondary" />

    <v-chip-group v-model="filter" mandatory selected-class="text-secondary" class="mb-4">
      <v-chip v-for="f in FILTERS" :key="f.value" :value="f.value" variant="outlined" filter>{{ f.label }}</v-chip>
    </v-chip-group>

    <FrameGallery :items="items" item-label="a condição">
      <template #art="{ item, hero }">
        <ConditionArt :def="item.def" :live="hero" />
      </template>
      <template #panel="{ item }">
        <ConditionSheet :def="item.def" />
      </template>
    </FrameGallery>
  </div>
</template>
