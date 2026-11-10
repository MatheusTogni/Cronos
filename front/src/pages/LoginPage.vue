<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '@/services/api'
import { homeFor, useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

async function submit() {
  if (!username.value.trim() || !password.value) {
    error.value = 'Informe login e senha'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const user = await auth.login(username.value, password.value)
    // Volta para onde ia, se for uma tela do papel dele; senão, a tela inicial do papel.
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const home = homeFor(user.role)
    await router.replace(redirect.startsWith(home) ? redirect : home)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-main class="login-main">
    <div class="login-wrap">
      <h1 class="title-font login-title">Grimório</h1>
      <p class="login-sub">Fichas da mesa</p>

      <v-card class="card-frame pa-6" color="surface">
        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="username"
            label="Login"
            prepend-inner-icon="mdi-account"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            autofocus
            class="mb-2"
          />
          <v-text-field
            v-model="password"
            label="Senha"
            prepend-inner-icon="mdi-lock"
            :type="showPassword ? 'text' : 'password'"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            autocomplete="current-password"
            class="mb-2"
            @click:append-inner="showPassword = !showPassword"
          />

          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
            {{ error }}
          </v-alert>

          <v-btn type="submit" color="primary" size="large" block :loading="loading">
            Entrar
          </v-btn>
        </v-form>
      </v-card>
    </div>
  </v-main>
</template>

<style scoped>
.login-main {
  min-height: 100dvh;
}

.login-wrap {
  max-width: 380px;
  margin: 0 auto;
  padding: 12vh 16px 32px;
}

.login-title {
  text-align: center;
  color: var(--gold);
  font-size: 2.6rem;
  font-weight: 700;
  margin: 0;
}

.login-sub {
  text-align: center;
  opacity: 0.7;
  margin: 0 0 24px;
  font-style: italic;
}
</style>
