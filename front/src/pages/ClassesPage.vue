<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ClassSheet from '@/components/ClassSheet.vue'
import FrameGallery from '@/components/FrameGallery.vue'
import { errorMessage } from '@/services/api'
import { useClassesStore } from '@/stores/classes'

/** Galeria das classes: quadros com a ficha original; ao abrir, a ficha em texto. */
const classes = useClassesStore()
const { list } = storeToRefs(classes)

const loading = ref(false)
const error = ref('')

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

const items = computed(() =>
  list.value.map((cls) => ({
    id: cls.id,
    name: cls.name,
    subtitle: cls.categories.join(' · '),
    accent: cls.color,
    cls,
  })),
)

onMounted(() => void load())
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

    <FrameGallery :items="items" item-label="a classe">
      <template #art="{ item, hero }">
        <img :src="item.cls.artFile" :alt="hero ? `Ficha original: ${item.name}` : ''" :loading="hero ? 'eager' : 'lazy'" />
      </template>
      <template #panel="{ item }">
        <ClassSheet :cls="item.cls" />
      </template>
    </FrameGallery>
  </div>
</template>
