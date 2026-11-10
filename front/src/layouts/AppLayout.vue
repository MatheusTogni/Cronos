<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRealtimeStore } from '@/stores/realtime'
import { ROLE_LABEL } from '@/types/api'

const auth = useAuthStore()
const realtime = useRealtimeStore()
const router = useRouter()

/** Cada papel vê só os próprios menus. */
const links = computed(() =>
  auth.isMaster
    ? [
        { to: '/mestre/campanhas', label: 'Campanhas', icon: 'mdi-castle', exact: false },
        { to: '/mestre/usuarios', label: 'Usuários', icon: 'mdi-account-group', exact: false },
        { to: '/mestre/classes', label: 'Classes', icon: 'mdi-book-open-variant', exact: false },
      ]
    : [
        // não-exato também acende o menu dentro de /jogador/campanha/:id
        { to: '/jogador', label: 'Campanhas', icon: 'mdi-castle', exact: false },
        { to: '/jogador/classes', label: 'Classes', icon: 'mdi-book-open-variant', exact: false },
      ],
)

// tempo real ligado enquanto estiver logado
onMounted(() => realtime.connect())

function logout() {
  realtime.disconnect()
  auth.logout()
  void router.push('/login')
}
</script>

<template>
  <v-app-bar flat color="surface" class="app-bar" density="comfortable">
    <v-app-bar-title>
      <span class="title-font brand">Cronos</span>
    </v-app-bar-title>

    <template #append>
      <v-menu location="bottom end">
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="text" class="user-btn">
            <v-icon :icon="auth.isMaster ? 'mdi-crown' : 'mdi-sword'" start />
            <span class="user-name">{{ auth.user?.displayName }}</span>
            <v-icon icon="mdi-chevron-down" end />
          </v-btn>
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item
            :title="auth.user?.displayName"
            :subtitle="`${auth.user?.username} · ${auth.user ? ROLE_LABEL[auth.user.role] : ''}`"
          />
          <v-divider />
          <v-list-item prepend-icon="mdi-logout" title="Sair" @click="logout" />
        </v-list>
      </v-menu>
    </template>

    <template #extension>
      <v-tabs color="secondary" show-arrows>
        <v-tab
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :prepend-icon="link.icon"
          :exact="link.exact"
        >
          {{ link.label }}
        </v-tab>
      </v-tabs>
    </template>
  </v-app-bar>

  <v-main>
    <router-view />
  </v-main>
</template>

<style scoped>
.app-bar {
  border-bottom: 1px solid var(--border-soft);
}

.brand {
  color: var(--gold);
  font-size: 1.3rem;
  font-weight: 700;
}

.user-btn {
  text-transform: none;
}

@media (max-width: 480px) {
  .user-name {
    display: none;
  }
}
</style>
