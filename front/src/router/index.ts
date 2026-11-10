import { createRouter, createWebHistory } from 'vue-router'
import { homeFor, useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/api'

declare module 'vue-router' {
  interface RouteMeta {
    /** Acessível sem login. */
    public?: boolean
    /** Só esse papel entra (herdado pelas rotas filhas). */
    role?: Role
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // "/" cai no login; o guard manda quem já está logado para a tela do seu papel.
    { path: '/', redirect: '/login' },
    {
      path: '/login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { public: true, title: 'Entrar' },
    },
    {
      path: '/mestre',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { role: 'MASTER' },
      children: [
        { path: '', redirect: '/mestre/campanhas' },
        {
          path: 'campanhas',
          component: () => import('@/pages/master/CampaignsPage.vue'),
          meta: { title: 'Campanhas' },
        },
        {
          path: 'campanhas/:id',
          component: () => import('@/pages/master/MasterCampaignPage.vue'),
          meta: { title: 'Campanha' },
        },
        {
          path: 'usuarios',
          component: () => import('@/pages/master/UsersPage.vue'),
          meta: { title: 'Usuários' },
        },
        {
          path: 'classes',
          component: () => import('@/pages/ClassesPage.vue'),
          meta: { title: 'Classes' },
        },
      ],
    },
    {
      path: '/jogador',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { role: 'PLAYER' },
      children: [
        {
          path: '',
          component: () => import('@/pages/player/OpenCampaignsPage.vue'),
          meta: { title: 'Campanhas' },
        },
        {
          path: 'campanha/:id',
          component: () => import('@/pages/player/PlayerCampaignPage.vue'),
          meta: { title: 'Aventura' },
        },
        {
          path: 'classes',
          component: () => import('@/pages/ClassesPage.vue'),
          meta: { title: 'Classes' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const user = await auth.ensureUser()

  if (to.meta.public) {
    // Já logado não precisa ver o login.
    return user ? homeFor(user.role) : true
  }

  if (!user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // Jogador tentando abrir tela de mestre (ou vice-versa) volta para a sua.
  if (to.meta.role && to.meta.role !== user.role) {
    return homeFor(user.role)
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Cronos` : 'Cronos'
})

export default router
