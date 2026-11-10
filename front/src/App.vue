<script setup lang="ts">
import { storeToRefs } from 'pinia'
import ArcaneBackdrop from '@/components/ArcaneBackdrop.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useNotifyStore } from '@/stores/notify'

const notify = useNotifyStore()
const { visible, text, kind } = storeToRefs(notify)
</script>

<template>
  <v-app>
    <ArcaneBackdrop />

    <router-view />

    <ConfirmDialog />

    <v-snackbar
      v-model="visible"
      :color="kind === 'info' ? 'surface-bright' : kind"
      location="top"
      :timeout="3500"
    >
      <span class="pre-line">{{ text }}</span>
      <template #actions>
        <v-btn icon="mdi-close" variant="text" size="small" @click="visible = false" />
      </template>
    </v-snackbar>
  </v-app>
</template>
