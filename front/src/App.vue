<script setup lang="ts">
import { storeToRefs } from 'pinia'
import ArcaneBackdrop from '@/components/ArcaneBackdrop.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useNotifyStore } from '@/stores/notify'

const notify = useNotifyStore()
const { visible, text, kind } = storeToRefs(notify)

const ICONS = {
  success: 'mdi-check-decagram',
  error: 'mdi-skull-crossbones',
  info: 'mdi-star-four-points',
} as const
</script>

<template>
  <v-app>
    <ArcaneBackdrop />

    <router-view />

    <ConfirmDialog />

    <v-snackbar
      v-model="visible"
      location="top"
      :timeout="3500"
      :content-class="['toast', `toast--${kind}`]"
      transition="slide-y-transition"
    >
      <div class="toast-body">
        <span class="toast-seal" aria-hidden="true">
          <v-icon :icon="ICONS[kind]" size="20" />
        </span>
        <span class="toast-text pre-line">{{ text }}</span>
      </div>
      <template #actions>
        <v-btn icon="mdi-close" variant="text" size="small" class="toast-close" aria-label="Fechar aviso" @click="visible = false" />
      </template>
    </v-snackbar>
  </v-app>
</template>
