# Offline Game Scraper — Шаг 1-2: Парсер + Сборщик

Этот проект реализует систему для захвата и оффлайн-запуска веб-игр с использованием Playwright и CDP.

## Структура проекта

```
./
├─ package.json
├─ bin/
│  ├─ scrape.mjs            # CLI: запускает захват игры
│  ├─ build.mjs             # CLI: собирает dist/ из capture/
│  └─ serve.mjs             # CLI: локальный сервер с нужными заголовками
└─ src/
   └─ capture/
      ├─ capture.mjs        # ядро: Playwright + CDP, сохранение ответов
      └─ util.mjs           # хелперы: sha256, типы, пути, безопасная запись
```

## Установка

```bash
# Node.js ≥ 18
npm install
npx playwright install chromium
```

## Использование

### Шаг 1: Захват игры

```bash
# Захват игры с настройками по умолчанию
node bin/scrape.mjs --url "https://example.com/game"

# С дополнительными параметрами
node bin/scrape.mjs \
  --url "https://casino.guru/gameDetailIos?gameId=25721" \
  --time 15000 \
  --out ./capture/25721 \
  --headless
```

Параметры:
- `--url` — адрес игры (обязателен)
- `--time` — время сбора сетевого трафика после загрузки (мс), по умолчанию 12000
- `--out` — папка вывода (по умолчанию `./capture/<slug из url>`)
- `--headless` — запуск Chromium без окна

### Шаг 2: Сборка оффлайн-версии

```bash
# Сборка из capture/<slug> в dist/<slug>
node bin/build.mjs --capture ./capture/test-game --out ./dist/test-game

# Запуск локального сервера
node bin/serve.mjs --root ./dist/test-game --port 4173
```

## Что происходит при захвате

1. **Открытие страницы** в Chromium через Playwright
2. **Слушание сети** через CDP (HTTP(S) + WebSocket)
3. **Сохранение всех ответов** в контент-адресное хранилище `storage/assets/` по `sha256`
4. **Запись манифеста** (`manifest.json`) с картой URL → файлы
5. **Сохранение API запросов/ответов** в `storage/api/`
6. **Запись WebSocket фреймов** в `storage/ws/`

## Что происходит при сборке

1. **Копирование ассетов** из `capture/storage/assets/` → `dist/assets/`
2. **Создание моков API/WS** в `dist/mocks/`
3. **Генерация Service Worker** (`dist/sw.js`) для кеширования и моков
4. **Создание рантайма** (`dist/runtime/offline.js`) для WebSocket моков
5. **Инъекция в HTML** скрипта рантайма
6. **Настройка локального сервера** с заголовками COOP/COEP для WASM

## Структура после захвата

```
./capture/<slug>/
├─ manifest.json            # общая карта и метаданные
└─ storage/
   ├─ assets/               # бинарные ассеты (sha256.ext)
   ├─ api/                  # JSON/текстовые ответы API
   └─ ws/                   # записи WebSocket фреймов
```

## Структура после сборки

```
./dist/<slug>/
├─ index.html               # главная страница с инъекцией рантайма
├─ sw.js                    # Service Worker для кеширования и моков
├─ build.json               # конфигурация сборки
├─ assets/                  # скопированные ассеты
├─ mocks/
│  ├─ apiMap.json          # карта API запросов
│  ├─ wsMap.json           # карта WebSocket соединений
│  ├─ api/                 # дампы API запросов/ответов
│  └─ ws/                  # дампы WebSocket фреймов
└─ runtime/
   └─ offline.js           # рантайм для оффлайн-режима
```

## Особенности

- **Контент-адресное хранение**: файлы сохраняются по SHA256 хешу, дубли исключены
- **WebSocket моки**: в оффлайне WebSocket заменяется на проигрывание записанных фреймов
- **API моки**: Service Worker перехватывает fetch запросы и возвращает записанные ответы
- **Безопасность**: сервер настроен с COOP/COEP заголовками для работы WASM и SharedArrayBuffer
- **Range запросы**: поддержка для аудио/видео контента

## Скрипты npm

```bash
npm run scrape    # запуск захвата
npm run build     # запуск сборки  
npm run serve     # запуск сервера
```

## Следующие шаги

- **Шаг 3**: Улучшение маппинга API (маскирование токенов, вариативность)
- **Валидатор**: автоматическая проверка отсутствия внешних запросов
- **Скриншоты**: автоматическое снятие скриншотов игры
