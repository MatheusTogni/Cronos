<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { homeFor, useAuthStore } from '@/stores/auth'
import { useLiteStore } from '@/stores/lite'
import { useRealtimeStore } from '@/stores/realtime'
import { ROLE_LABEL } from '@/types/api'

const auth = useAuthStore()
const realtime = useRealtimeStore()
const liteMode = useLiteStore()
const router = useRouter()

/** Cada papel vê só os próprios menus. */
const links = computed(() =>
  auth.isMaster
    ? [
        { to: '/mestre/campanhas', label: 'Campanhas', icon: 'mdi-castle', exact: false },
        { to: '/mestre/usuarios', label: 'Usuários', icon: 'mdi-account-group', exact: false },
        { to: '/mestre/classes', label: 'Classes', icon: 'mdi-book-open-variant', exact: false },
        { to: '/mestre/condicoes', label: 'Condições', icon: 'mdi-alert-decagram', exact: false },
      ]
    : [
        // não-exato também acende o menu dentro de /jogador/campanha/:id
        { to: '/jogador', label: 'Campanhas', icon: 'mdi-castle', exact: false },
        { to: '/jogador/classes', label: 'Classes', icon: 'mdi-book-open-variant', exact: false },
        { to: '/jogador/condicoes', label: 'Condições', icon: 'mdi-alert-decagram', exact: false },
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
  <v-app-bar flat class="app-bar" density="comfortable">
    <v-app-bar-title>
      <router-link :to="auth.user ? homeFor(auth.user.role) : '/'" class="brand">
        <img src="/pwa-64x64.png" alt="" class="brand-icon" />
        <span class="brand-font gold-text brand-name">Cronos</span>
      </router-link>
    </v-app-bar-title>

    <template #append>
      <v-menu location="bottom end">
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="text" class="user-btn">
            <span class="sigil" :class="{ master: auth.isMaster }">
              <v-icon :icon="auth.isMaster ? 'mdi-crown' : 'mdi-sword'" size="16" />
            </span>
            <span class="user-name">{{ auth.user?.displayName }}</span>
            <v-icon icon="mdi-chevron-down" end />
          </v-btn>
        </template>
        <v-list density="compact" min-width="220">
          <v-list-item
            :title="auth.user?.displayName"
            :subtitle="`${auth.user?.username} · ${auth.user ? ROLE_LABEL[auth.user.role] : ''}`"
          />
          <v-divider />
          <v-list-item
            prepend-icon="mdi-feather"
            title="Modo leve"
            subtitle="Menos animações, mais rápido"
            @click="liteMode.toggle()"
          >
            <template #append>
              <v-switch
                :model-value="liteMode.lite"
                color="secondary"
                density="compact"
                hide-details
                inset
                aria-label="Modo leve"
                @click.stop="liteMode.toggle()"
              />
            </template>
          </v-list-item>
          <v-divider />
          <v-list-item prepend-icon="mdi-door-open" title="Sair da mesa" @click="logout" />
        </v-list>
      </v-menu>
    </template>

    <template #extension>
      <v-tabs color="secondary" slider-color="secondary" show-arrows class="nav-tabs">
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
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </v-main>
</template>

<style scoped>
.app-bar {
  background:
    linear-gradient(180deg, #24182e 0%, #0e0912 100%) !important;
  border-bottom: 1px solid rgba(212, 160, 76, 0.45);
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.8),
    0 8px 24px rgba(0, 0, 0, 0.55) !important;
}

/* ornamento central na borda de baixo da barra */
.app-bar::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -7px;
  width: 80px;
  height: 14px;
  transform: translateX(-50%);
  background: var(--flourish) center / contain no-repeat;
  pointer-events: none;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(212, 160, 76, 0.6);
  box-shadow: 0 0 12px rgba(212, 160, 76, 0.3);
}

.brand-name {
  font-size: 1.45rem;
  font-weight: 900;
}

.user-btn {
  text-transform: none;
}

.sigil {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-right: 8px;
  border-radius: 50%;
  border: 1px solid rgba(212, 160, 76, 0.55);
  background: radial-gradient(circle, #2a1f33, #120c17);
  color: #cfc3b0;
}

.sigil.master {
  color: var(--gold-bright);
  box-shadow: 0 0 10px rgba(212, 160, 76, 0.4);
}

/* faixa das abas ocupa a largura toda (antes só o trecho das abas escurecia) */
.app-bar :deep(.v-toolbar__extension) {
  background: rgba(0, 0, 0, 0.28);
  border-top: 1px solid rgba(212, 160, 76, 0.12);
}

/* sem o realce cinza que o Vuetify deixa na aba depois do clique */
.nav-tabs :deep(.v-tab .v-btn__overlay) {
  background: var(--gold);
}

.nav-tabs :deep(.v-tab:focus:not(:focus-visible) .v-btn__overlay) {
  opacity: 0;
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .user-name {
    display: none;
  }

  .sigil {
    margin-right: 0;
  }
}
</style>
