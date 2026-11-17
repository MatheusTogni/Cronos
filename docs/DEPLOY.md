# Deploy numa VPS (Ubuntu + nginx + pm2)

O guia abaixo descreve como o Cronos roda em produção: API NestJS na porta **3008** (pm2 `cronos-api`), front estático em `/var/www/cronos`, repositório clonado em `~/Cronos` e nginx na frente com HTTPS. Troque `rpg.seudominio.com` pelo seu domínio. Os nomes de pasta e do processo vêm do [`deploy.sh`](../deploy.sh); se mudar um, mude o outro.

## Primeira vez

1. **Banco.** Crie um usuário próprio (não use o superusuário `postgres`) e o banco `cronosdb` com encoding **UTF8** (o log usa caracteres como "−" e "→"), depois aplique o schema:

   ```sql
   CREATE USER cronos WITH PASSWORD 'uma-senha-forte-aqui';
   CREATE DATABASE cronosdb OWNER cronos ENCODING 'UTF8';
   ```

   ```bash
   psql -h localhost -U cronos -d cronosdb -f ~/Cronos/back/schema.sql
   ```

2. **Variáveis.** Em `~/Cronos/back`, copie o `.env.production.example` para `.env` e preencha:
   - `DB_USERNAME` / `DB_PASSWORD`: o usuário e a senha do passo 1.
   - `JWT_SECRET`: gere um valor novo com `openssl rand -hex 32`. **Nunca deixe o valor do exemplo**: quem souber o segredo consegue assinar tokens de login.
   - `CORS_ORIGIN`: o endereço público do site (`https://rpg.seudominio.com`).
   - `TRUST_PROXY`: deixe `1` (o nginx na frente). Veja "Limite de login" abaixo.
3. **Build e dados iniciais.** Em `~/Cronos/back`:

   ```bash
   npm ci && npm run build
   npm run db:seed                                  # as 9 classes e as condições
   npm run create-master:prod -- seulogin suasenha "Seu Nome"
   ```

4. **nginx.** Além de servir `/var/www/cronos` com fallback para o `index.html`:

   ```nginx
   client_max_body_size 16m;   # imagens do mestre (até 15 MB)

   location /api/ {
       proxy_pass http://127.0.0.1:3008;
       proxy_set_header Host $host;
       # O limite de login por IP lê este header. Sem ele a API vê todo mundo como 127.0.0.1.
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   }

   # tempo real: sem os headers de upgrade o Socket.IO não conecta
   location /socket.io/ {
       proxy_pass http://127.0.0.1:3008;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_read_timeout 3600s;
   }

   # PWA: sem cache, senão a atualização não chega nos celulares
   location ~ ^/(sw\.js|registerSW\.js|manifest\.webmanifest|index\.html)$ {
       add_header Cache-Control "no-cache";
   }
   ```

5. **HTTPS.** Use o certbot (`sudo certbot --nginx -d rpg.seudominio.com`). O PWA só instala em HTTPS.

## Atualizar

```bash
./deploy.sh
```

O script faz backup do build anterior, puxa o `main`, builda o front e o back, recarrega o pm2 e o nginx, e volta tudo se algo falhar.

- Se o `schema.prisma` mudar, aplique o `ALTER` no banco à mão e atualize o [`back/schema.sql`](../back/schema.sql).
- Se o `classes.json` ou o `conditions.json` mudar, rode `npm run db:seed` em `~/Cronos/back`.

## Segurança

- **Limite de login.** `POST /api/auth/login` aceita até 10 tentativas por minuto e 30 a cada 15 minutos por IP; passou disso, responde 429. Só o login é limitado: o resto da API (e o tempo real) não. O IP vem do `X-Forwarded-For` que o nginx envia, e o `TRUST_PROXY` diz em quantos proxies confiar (`1` = o nginx). Se expuser a API direto, sem proxy, use `TRUST_PROXY=0`, senão qualquer um poderia forjar o header e escapar do limite.
- **Cabeçalhos.** A API usa o [helmet](https://helmet.github.io/) (nosniff, sem `X-Powered-By` etc.).
- **Senhas.** O mínimo é de 4 caracteres (jogo entre amigos). Se o site ficar aberto na internet, vale combinar senhas maiores com a turma.
- **Segredos.** O `.env` fica só no servidor e nunca é versionado (o `.gitignore` ignora qualquer `.env*`, exceto os `*.example`).

## Backup

O banco (`pg_dump cronosdb`) e a pasta `back/uploads` (as imagens do mestre).

## App no celular (PWA)

O front é um PWA: no celular, abra o site e use **Adicionar à tela inicial** (Android/Chrome instala como app; no iPhone, pelo Safari em *Compartilhar*). Ele abre em tela cheia, com o ícone da ampulheta.

- **Precisa de HTTPS.** Em `http://<ip-do-pc>:5173` o app abre normal, mas não instala.
- O service worker só existe no build (`npm run build`), não no `npm run dev`.
- A tela abre mesmo sem rede, mas a mesa (API e tempo real) precisa de conexão. A arte das classes e as imagens do mestre ficam em cache depois da primeira vez.
- **Atualização:** depois de um novo build, o app baixa a versão nova em segundo plano e passa a usá-la na próxima vez que for aberto.
- **Trocar o ícone:** substitua `front/public/icone.png` (quadrado, de preferência 1024px ou mais) e rode `npm run pwa-assets` em `front/`. Isso regera o favicon e os ícones `pwa-*`, `maskable-*` e `apple-touch-*` em `front/public/`.
