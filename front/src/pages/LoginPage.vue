<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RuneCircle from '@/components/RuneCircle.vue'
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
      <RuneCircle :size="250" class="emblem">
        <img src="/icone.png" alt="" class="emblem-img" />
      </RuneCircle>

      <h1 class="brand-font gold-text login-title">Cronos</h1>
      <p class="login-sub">
        <span class="sub-line" />
        Crônicas da Mesa
        <span class="sub-line" />
      </p>

      <v-card class="card-frame login-card" color="surface">
        <div class="card-head title-font">Identifique-se, viajante</div>

        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="username"
            label="Login"
            prepend-inner-icon="mdi-account-outline"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            autofocus
            class="mb-2"
          />
          <v-text-field
            v-model="password"
            label="Senha"
            prepend-inner-icon="mdi-key-variant"
            :type="showPassword ? 'text' : 'password'"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            autocomplete="current-password"
            class="mb-2"
            @click:append-inner="showPassword = !showPassword"
          />

          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
            {{ error }}
          </v-alert>

          <v-btn
            type="submit"
            color="primary"
            size="large"
            block
            :loading="loading"
            prepend-icon="mdi-sword-cross"
            class="enter-btn"
          >
            Entrar na mesa
          </v-btn>
        </v-form>
      </v-card>

      <p class="motto">“O tempo devora todas as coisas — menos as histórias.”</p>
    </div>
  </v-main>
</template>

<style scoped>
.login-main {
  min-height: 100dvh;
}

.login-wrap {
  max-width: 400px;
  margin: 0 auto;
  padding: 6vh 16px 32px;
  animation: appear 0.9s ease-out both;
}

@keyframes appear {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

.emblem {
  margin-bottom: 4px;
}

.emblem-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  /* some com a borda quadrada da arte, deixando só a ampulheta */
  -webkit-mask-image: radial-gradient(circle, #000 52%, transparent 70%);
  mask-image: radial-gradient(circle, #000 52%, transparent 70%);
  animation: float 6s ease-in-out infinite alternate;
}

@keyframes float {
  to {
    transform: translateY(-6px);
  }
}

.login-title {
  text-align: center;
  font-size: clamp(2.6rem, 11vw, 3.4rem);
  font-weight: 900;
  margin: 0;
  line-height: 1.1;
  filter: drop-shadow(0 0 18px rgba(212, 160, 76, 0.35)) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.8));
}

.login-sub {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 4px 0 26px;
  font-family: var(--font-title);
  letter-spacing: 0.3em;
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--gold);
  opacity: 0.85;
}

.sub-line {
  flex: 0 1 48px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold));
}

.sub-line:last-child {
  background: linear-gradient(90deg, var(--gold), transparent);
}

.login-card {
  padding: 26px 24px 24px;
}

.card-head {
  text-align: center;
  font-size: 0.95rem;
  letter-spacing: 0.12em;
  color: var(--parchment);
  opacity: 0.8;
  margin-bottom: 18px;
}

.enter-btn {
  margin-top: 4px;
}

.motto {
  margin: 22px 0 0;
  text-align: center;
  font-style: italic;
  opacity: 0.5;
  font-size: 0.95rem;
}
</style>
