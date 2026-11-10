<script setup lang="ts">
import { ref, watch } from 'vue'
/** Diálogo de formulário simples (condição, item, invocação, ficha…). */
import type { QuickField } from '@/types/ui'

const props = defineProps<{
  title: string
  fields: QuickField[]
  initial?: Record<string, string | number | null>
  submitLabel?: string
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ submit: [values: Record<string, string | number>] }>()

const values = ref<Record<string, string | number | null>>({})
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  values.value = Object.fromEntries(props.fields.map((f) => [f.key, props.initial?.[f.key] ?? null]))
})

function submit() {
  const out: Record<string, string | number> = {}
  for (const f of props.fields) {
    const raw = values.value[f.key]
    const empty = raw === null || raw === '' || (typeof raw === 'string' && !raw.trim())
    if (empty) {
      if (f.required) {
        error.value = `Preencha: ${f.label}`
        return
      }
      continue
    }
    if (f.type === 'number') {
      const n = Number(raw)
      if (!Number.isInteger(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
        error.value = `${f.label}: número inválido`
        return
      }
      out[f.key] = n
    } else {
      out[f.key] = String(raw).trim()
    }
  }
  emit('submit', out)
}
</script>

<template>
  <v-dialog v-model="open" max-width="420">
    <v-card class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6">{{ title }}</v-card-title>
      <v-card-text class="px-6">
        <v-form @submit.prevent="submit">
          <template v-for="(f, i) in fields" :key="f.key">
            <v-textarea
              v-if="f.type === 'textarea'"
              v-model="values[f.key]"
              :label="f.label"
              :hint="f.hint"
              :maxlength="f.maxlength"
              persistent-hint
              rows="2"
              auto-grow
              class="mb-2"
            />
            <v-text-field
              v-else
              v-model="values[f.key]"
              :label="f.label + (f.required ? '' : ' (opcional)')"
              :type="f.type === 'number' ? 'number' : 'text'"
              :min="f.min"
              :max="f.max"
              :hint="f.hint"
              :maxlength="f.maxlength"
              persistent-hint
              :autofocus="i === 0"
              class="mb-2"
            />
          </template>
          <v-alert v-if="error" type="error" variant="tonal" density="compact">{{ error }}</v-alert>
          <button type="submit" hidden />
        </v-form>
      </v-card-text>
      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" @click="submit">{{ submitLabel ?? 'Salvar' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
