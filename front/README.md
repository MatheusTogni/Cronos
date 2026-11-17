# Cronos — front

App Vue 3 + Vuetify 4 + Pinia (Vite) do Cronos. A visão geral, o setup completo e as regras estão no [README da raiz](../README.md).

```bash
npm install
npm run dev      # http://localhost:5173 (repassa /api e /socket.io para a API na 3100)
npm run build    # type-check (vue-tsc) + build de produção, com o service worker do PWA
```

- `API_URL=http://127.0.0.1:<porta> npm run dev` aponta o proxy para outra porta da API.
- `npm run pwa-assets` regera o favicon e os ícones do PWA a partir de `public/icone.png`.
- Editor: [VS Code](https://code.visualstudio.com/) com a extensão [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (desative o Vetur).
