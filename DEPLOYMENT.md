# Развёртывание на VPS Timeweb Cloud

Инструкция для **Ubuntu 24.04**, **Node.js 20**, **PM2**, **Nginx** и **HTTPS** (Let's Encrypt).

База SQLite хранится в папке `data/gost17025.db` рядом с проектом и **сохраняется между перезапусками** PM2 и сервера.

---

## 1. Подготовка сервера

Подключитесь по SSH:

```bash
ssh root@ВАШ_IP
```

Обновите систему и установите зависимости:

```bash
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx build-essential
```

Установите Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

Установите PM2 глобально:

```bash
npm install -g pm2
```

Создайте пользователя для приложения (рекомендуется):

```bash
adduser --disabled-password --gecos "" gostapp
usermod -aG sudo gostapp
```

---

## 2. Загрузка проекта

```bash
su - gostapp
cd ~
git clone https://github.com/ВАШ_РЕПОЗИТОРИЙ/gost17025.git app
cd app
```

Или загрузите архив через SFTP в `/home/gostapp/app`.

Установите зависимости:

```bash
npm install --production
```

Создайте папку для базы (если её ещё нет):

```bash
mkdir -p data
chmod 755 data
```

---

## 3. Переменные окружения

```bash
cp .env.example .env
nano .env
```

Обязательно задайте:

| Переменная | Описание |
|------------|----------|
| `PORT` | `3000` (внутренний порт Node.js) |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | случайная строка: `openssl rand -hex 32` |
| `ADMIN_EMAIL` | email администратора |
| `ADMIN_PASSWORD` | надёжный пароль администратора |

```bash
chmod 600 .env
```

---

## 4. Запуск через PM2

```bash
cd /home/gostapp/app
pm2 start server.js --name gost17025
pm2 save
pm2 startup
# выполните команду, которую выведет pm2 startup
```

Проверка:

```bash
pm2 status
curl http://127.0.0.1:3000/api/health
```

В ответе должно быть `"storage":"sqlite"` и путь к `data`.

---

## 5. Nginx (обратный прокси)

Создайте конфиг (замените `your-domain.ru`):

```bash
sudo nano /etc/nginx/sites-available/gost17025
```

```nginx
server {
    listen 80;
    server_name your-domain.ru www.your-domain.ru;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Активируйте сайт:

```bash
sudo ln -s /etc/nginx/sites-available/gost17025 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d your-domain.ru -d www.your-domain.ru
```

Certbot настроит редирект HTTP → HTTPS. Проверьте сайт: `https://your-domain.ru`

---

## 7. Безопасность в продакшене

- Пароли хранятся **только в виде bcrypt-хешей** в SQLite.
- `/api/data` доступен **только авторизованным** пользователям; пароли не отдаются.
- `/admin.html` и `/api/admin/*` — **только для роли admin**.
- Выдача PRO — **только через админ-API** на сервере.
- Смените `ADMIN_PASSWORD` в `.env` до первого публичного запуска.
- Откройте в файрволе только порты **22**, **80**, **443**:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 8. Резервное копирование базы

База и файлы:

```bash
/home/gostapp/app/data/gost17025.db
/home/gostapp/app/data/gost17025.db-wal   # при активной работе
/home/gostapp/app/data/gost17025.db-shm
```

Резервная копия:

```bash
cd /home/gostapp/app
sqlite3 data/gost17025.db ".backup 'backup-$(date +%F).db'"
```

Или скопируйте всю папку `data/`:

```bash
tar czf gost17025-data-$(date +%F).tar.gz data/
```

---

## 9. Обновление приложения

```bash
cd /home/gostapp/app
git pull
npm install --production
pm2 restart gost17025
```

Папка `data/` не затрагивается при обновлении кода.

---

## 10. Полезные команды

```bash
pm2 logs gost17025          # логи
pm2 restart gost17025       # перезапуск
pm2 monit                   # мониторинг
sudo systemctl status nginx
sudo certbot renew --dry-run
```

---

## Timeweb Cloud — кратко

1. Создайте VPS (Ubuntu 24.04) в панели Timeweb Cloud.
2. Привяжите домен: A-запись `@` и `www` → IP сервера.
3. Выполните шаги 1–6 этой инструкции.
4. Войдите на сайт как администратор (`ADMIN_EMAIL` / `ADMIN_PASSWORD` из `.env`).
