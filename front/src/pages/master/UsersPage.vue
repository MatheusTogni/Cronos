<script setup lang="ts">
import { onMounted, ref } from 'vue'
import UserFormDialog from '@/components/UserFormDialog.vue'
import { api, errorMessage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useNotifyStore } from '@/stores/notify'
import { ROLE_LABEL, type UserRow } from '@/types/api'

const auth = useAuthStore()
const notify = useNotifyStore()

const users = ref<UserRow[]>([])
const loading = ref(false)
const search = ref('')
const dialogOpen = ref(false)
const editing = ref<UserRow | null>(null)

const headers = [
  { title: 'Nome', key: 'displayName' },
  { title: 'Login', key: 'username' },
  { title: 'Papel', key: 'role' },
  { title: 'Situação', key: 'active' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

async function load() {
  loading.value = true
  try {
    users.value = (await api.get<UserRow[]>('/users')).data
  } catch (e) {
    notify.error(errorMessage(e))
  } finally {
    loading.value = false
  }
}

function openNew() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(user: UserRow) {
  editing.value = user
  dialogOpen.value = true
}

function onSaved(saved: UserRow) {
  const i = users.value.findIndex((u) => u.id === saved.id)
  if (i >= 0) users.value[i] = saved
  else users.value.push(saved)
}

// exclusão com confirmação em dois toques, como nas imagens
const confirmDelete = ref<string | null>(null)
const deleting = ref<string | null>(null)
let confirmTimer: ReturnType<typeof setTimeout> | undefined

async function remove(user: UserRow) {
  if (confirmDelete.value !== user.id) {
    confirmDelete.value = user.id
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirmDelete.value = null), 4000)
    return
  }
  confirmDelete.value = null
  deleting.value = user.id
  try {
    await api.delete(`/users/${user.id}`)
    users.value = users.value.filter((u) => u.id !== user.id)
    notify.success(`Login "${user.username}" excluído`)
  } catch (e) {
    notify.error(errorMessage(e))
  } finally {
    deleting.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Usuários</h1>
      <v-btn color="primary" prepend-icon="mdi-account-plus" @click="openNew">Novo login</v-btn>
    </div>

    <v-card class="card-frame" color="surface">
      <v-card-text class="pb-0">
        <v-text-field
          v-model="search"
          label="Buscar por nome ou login"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          max-width="360"
        />
      </v-card-text>

      <v-data-table
        :headers="headers"
        :items="users"
        :loading="loading"
        :search="search ?? ''"
        :filter-keys="['displayName', 'username']"
        :items-per-page="-1"
        hide-default-footer
        no-data-text="Nenhum login cadastrado"
        mobile-breakpoint="sm"
        class="bg-transparent"
      >
        <template #[`item.displayName`]="{ item }">
          {{ item.displayName }}
          <span v-if="item.id === auth.user?.id" class="you">(você)</span>
        </template>

        <template #[`item.role`]="{ item }">
          <v-chip
            size="small"
            :color="item.role === 'MASTER' ? 'secondary' : undefined"
            :prepend-icon="item.role === 'MASTER' ? 'mdi-crown' : 'mdi-sword'"
            variant="tonal"
          >
            {{ ROLE_LABEL[item.role] }}
          </v-chip>
        </template>

        <template #[`item.active`]="{ item }">
          <span :class="item.active ? 'status-on' : 'status-off'">
            {{ item.active ? 'Ativo' : 'Desativado' }}
          </span>
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn
            icon="mdi-pencil"
            variant="text"
            size="small"
            :aria-label="`Editar ${item.displayName}`"
            @click="openEdit(item)"
          />
          <v-btn
            v-if="item.id !== auth.user?.id"
            :icon="confirmDelete === item.id ? 'mdi-delete-alert' : 'mdi-delete'"
            :color="confirmDelete === item.id ? 'error' : undefined"
            :variant="confirmDelete === item.id ? 'flat' : 'text'"
            size="small"
            :loading="deleting === item.id"
            :aria-label="
              confirmDelete === item.id ? 'Toque de novo para excluir' : `Excluir ${item.displayName}`
            "
            :title="confirmDelete === item.id ? 'Toque de novo para excluir' : 'Excluir'"
            @click="remove(item)"
          />
        </template>
      </v-data-table>
    </v-card>

    <UserFormDialog v-model="dialogOpen" :user="editing" @saved="onSaved" />
  </div>
</template>

<style scoped>
.you {
  opacity: 0.55;
  font-size: 0.9em;
  margin-left: 4px;
}

.status-on {
  color: #7fd3a1;
}

.status-off {
  opacity: 0.55;
}
</style>
