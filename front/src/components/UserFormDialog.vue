<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'
import type { Role, UserRow } from '@/types/api'

const props = defineProps<{
  /** null = cadastro novo */
  user: UserRow | null
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [user: UserRow] }>()

const auth = useAuthStore()
const notify = useNotifyStore()

const isEdit = computed(() => !!props.user)
const isSelf = computed(() => props.user?.id === auth.user?.id)

const form = ref({
  username: '',
  displayName: '',
  password: '',
  role: 'PLAYER' as Role,
  active: true,
})
const showPassword = ref(false)
const saving = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  showPassword.value = false
  form.value = props.user
    ? {
        username: props.user.username,
        displayName: props.user.displayName,
        password: '',
        role: props.user.role,
        active: props.user.active,
      }
    : { username: '', displayName: '', password: '', role: 'PLAYER', active: true }
})

const rules = {
  username: (v: string) =>
    /^[a-z0-9._-]{3,30}$/.test(v.trim().toLowerCase()) ||
    'De 3 a 30 caracteres: letras, números, ponto, hífen ou _',
  required: (v: string) => !!v.trim() || 'Obrigatório',
  password: (v: string) =>
    (isEdit.value && !v) || v.length >= 4 || 'Pelo menos 4 caracteres',
}

async function save() {
  const f = form.value
  const invalid = [
    !isEdit.value && rules.username(f.username),
    rules.required(f.displayName),
    rules.password(f.password),
  ].find((r) => typeof r === 'string')
  if (invalid) {
    error.value = 'Confira os campos destacados'
    return
  }

  saving.value = true
  error.value = ''
  try {
    const { data } = isEdit.value
      ? await api.patch<UserRow>(`/users/${props.user!.id}`, {
          displayName: f.displayName,
          role: f.role,
          active: f.active,
          ...(f.password ? { password: f.password } : {}),
        })
      : await api.post<UserRow>('/users', {
          username: f.username,
          displayName: f.displayName,
          password: f.password,
          role: f.role,
        })
    notify.success(isEdit.value ? 'Login atualizado' : `Login "${data.username}" criado`)
    emit('saved', data)
    open.value = false
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="460">
    <v-card class="card-frame" color="surface">
      <v-card-title class="title-font pt-5 px-6">
        {{ isEdit ? 'Editar login' : 'Novo login' }}
      </v-card-title>

      <v-card-text class="px-6">
        <v-form @submit.prevent="save">
          <v-text-field
            v-model="form.username"
            label="Login"
            hint="É o que a pessoa digita para entrar. Ex.: kaua"
            persistent-hint
            :disabled="isEdit"
            :rules="isEdit ? [] : [rules.username]"
            autocapitalize="off"
            spellcheck="false"
            class="mb-3"
          />
          <v-text-field
            v-model="form.displayName"
            label="Nome"
            hint="Como aparece para a mesa"
            persistent-hint
            :rules="[rules.required]"
            class="mb-3"
          />
          <v-text-field
            v-model="form.password"
            :label="isEdit ? 'Nova senha' : 'Senha'"
            :hint="isEdit ? 'Deixe em branco para manter a atual' : ''"
            persistent-hint
            :type="showPassword ? 'text' : 'password'"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            :rules="[rules.password]"
            autocomplete="new-password"
            class="mb-3"
            @click:append-inner="showPassword = !showPassword"
          />

          <div class="role-label">Papel</div>
          <v-btn-toggle
            v-model="form.role"
            mandatory
            color="secondary"
            variant="outlined"
            divided
            class="mb-2"
            :disabled="isSelf"
          >
            <v-btn value="PLAYER" prepend-icon="mdi-sword">Jogador</v-btn>
            <v-btn value="MASTER" prepend-icon="mdi-crown">Mestre</v-btn>
          </v-btn-toggle>
          <div v-if="isSelf" class="self-hint">Você não pode mudar o próprio papel.</div>

          <v-switch
            v-if="isEdit"
            v-model="form.active"
            label="Login ativo"
            color="success"
            inset
            hide-details
            :disabled="isSelf"
          />

          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-3 pre-line"
          >
            {{ error }}
          </v-alert>

          <!-- Enter no teclado envia -->
          <button type="submit" hidden />
        </v-form>
      </v-card-text>

      <v-card-actions class="px-6 pb-5">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" @click="save">Salvar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.role-label {
  font-size: 0.85rem;
  opacity: 0.7;
  margin-bottom: 6px;
}

.self-hint {
  font-size: 0.85rem;
  opacity: 0.6;
  margin-bottom: 8px;
}
</style>
