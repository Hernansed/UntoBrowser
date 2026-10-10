# Как публиковать ClearBrowser на GitHub

Локальный репозиторий уже создан, SSH-ключ сгенерирован. Осталось 3 шага (по одному разу), потом обновления — одной командой.

## Разовая настройка (5 минут)

### 1. Добавь SSH-ключ на GitHub

Открой https://github.com/settings/ssh/new и вставь туда публичный ключ:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGLNKYgXydfdXQHJMdmRKVVaycvSM3iJkDhygSDh/3bW whitearched-clearbrowser
```

(он же лежит в `~/.ssh/id_ed25519.pub`; Title — любой, например "arch")

### 2. Создай пустой репозиторий

Открой https://github.com/new :
- Repository name: `clearbrowser`
- **Не** добавляй README/.gitignore/license (репозиторий должен быть пустым)
- Create repository

### 3. Скажи мне свой GitHub username

Я подключу remote и сделаю первый push. Либо сам:

```bash
cd ~/.config/AutoClaw-oversea-official/accounts/a1e73cd66be2af2f0a42fd0d0bee1d44e9e3a5f85ec6ac6a141b1273aa4dac95/projects/Default/clearbrowser
git remote add origin git@github.com:ТВОЙ_USERNAME/clearbrowser.git
git push -u origin main
```

## Дальше — как постить обновления

После любых изменений кода просто скажи мне «запушь апдейт» — я сделаю commit + push. Или сам:

```bash
git add -A
git commit -m "что изменил"
git push
```

## (Опционально) Автосборка на GitHub Actions

Могу добавить workflow-файл, чтобы GitHub сам собирал `.exe` и `.sh` при каждом
пуше и выкладывал их в Releases — тогда кнопка «Download» на странице репо
всегда ведёт на свежие установщики. Скажи, если нужно.
