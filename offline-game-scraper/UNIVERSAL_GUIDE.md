# Universal Offline Game Scraper Guide

Универсальное руководство по использованию скраппера/валидатора/оффлайнера для любых игр.

## 🚀 Быстрый старт

```bash
# 1. Запустите универсальный пре-полетный чеклист для любой игры
npm run preflight-universal <game-name>

# 2. Запустите сервер
npm run serve -- <game-name>

# 3. Откройте http://localhost:8080 в браузере

# 4. Запустите валидатор
npm run validate -- <game-name>
```

### Примеры:

```bash
# Для Paper Plane
npm run preflight-universal paper-plane-offline
npm run serve -- paper-plane-offline
npm run validate -- paper-plane-offline

# Для любой другой игры
npm run preflight-universal my-game-offline
npm run serve -- my-game-offline
npm run validate -- my-game-offline
```

## 📋 Что автоматизировано

### ✅ Универсальные автоматизации:

1. **Чёрный экран из-за iframe + query**
   - Автопоиск launch и index файлов
   - Автогенерация HTML с редиректом и query-строкой
   - Универсальные параметры: `game=<game-name>&locale=en`

2. **WebSocket (0% загрузка)**
   - Универсальный WS-шим с поддержкой любых ndjson файлов
   - Автопоиск: `fallback.ndjson`, `websocket.ndjson`, `ws.ndjson`
   - Fallback bootstrap-стрим при отсутствии файлов

3. **TypeError в игровых объектах**
   - Универсальный bootstrap-shim для `ingenuity.*`, `gameConfig.*`, `gameState.*`
   - Защита от рекурсий UI
   - Алиасы для совместимости: `soundManager`

4. **PixiJS + GSAP null-guards**
   - Защита `PIXI.utils.from(null)` → `PIXI.Texture.EMPTY`
   - Фильтрация null объектов в `gsap.to()`
   - Безопасная обработка массивов целей

5. **API моки (точность поиска)**
   - Строгие ключи запросов: `метод|path|sortedQuery|bodyHash`
   - Точный матч по всем параметрам
   - Логирование отсутствующих моков с предложенными ключами

6. **Внешние скрипты/аналитика (503/blocked)**
   - ALLOWLIST → 204/пустые ответы
   - Блокировка 15+ доменов аналитики
   - Перехват fetch, XHR и script тегов

7. **Файловая структура/пути**
   - Автопоиск и создание недостающих файлов
   - Детектор дублей (одинаковые SHA)
   - Проверка внешних URL в текстовых файлах

8. **Кэш/версионирование**
   - Автобамп имени кэша по контент-хэшу
   - Очистка старых кэшей на `activate`

### 🔧 Универсальный ИИ-валидатор:

1. **Координаты вхождений**
   - Файл/строка/колонка/тег/атрибут/URL
   - CSV экспорт: `reports/<game-name>_externals_loc.csv`

2. **Проверка относительной глубины**
   - Проверка существования локальных путей
   - CSV экспорт: `reports/<game-name>_path_mismatch.csv`

3. **Универсальные детекторы**
   - `iframe src` без query → **HIGH**
   - `gameObject.* is not a function` → **HIGH**
   - `_pixiId`/GSAP null → **MEDIUM**
   - WebSocket ошибки → **HIGH**
   - Отсутствует `ws/*.ndjson` → **HIGH**

## 📁 Структура файлов

```
offline-game-scraper/
├── dist/<game-name>/                    # Собранная игра
│   ├── launch.*.html                   # Launch-редирект (автогенерируется)
│   ├── index.*.html                    # Основной файл игры
│   ├── runtime/offline.js              # Универсальный runtime с шимами
│   ├── mocks/
│   │   ├── apiMap.json                # API моки с строгими ключами
│   │   └── ws/
│   │       ├── fallback.ndjson        # Fallback WS моки
│   │       └── *.ndjson               # Игровые WS моки
│   └── sw.js                          # Service Worker
├── tools/
│   ├── universal-preflight.mjs        # Универсальный пре-полетный чеклист
│   └── ai_validator.py                # Универсальный ИИ-валидатор
└── reports/                           # Отчёты валидатора
    ├── <game-name>-report.json
    ├── <game-name>-report.md
    ├── <game-name>-report_externals_loc.csv
    └── <game-name>-report_path_mismatch.csv
```

## 🛠️ Команды

### Универсальные команды:
```bash
# Пре-полетный чеклист для любой игры
npm run preflight-universal <game-name>

# Сборка игры
npm run build <game-name>

# Сервер
npm run serve -- <game-name>

# Валидация
npm run validate -- <game-name>
```

### Примеры использования:

```bash
# Paper Plane
npm run preflight-universal paper-plane-offline
npm run serve -- paper-plane-offline
npm run validate -- paper-plane-offline

# Другая игра
npm run preflight-universal my-casino-game-offline
npm run serve -- my-casino-game-offline
npm run validate -- my-casino-game-offline

# Bananza (существующая)
npm run preflight-universal bananza-v2
npm run serve -- bananza-v2
npm run validate -- bananza-v2
```

## 🔍 Отладка

### Проверка логов:
1. Откройте DevTools (F12)
2. Перейдите на вкладку Console
3. Ищите сообщения с префиксом `[OFFLINE]`

### Типичные проблемы:

**Чёрный экран:**
- Проверьте наличие query параметров в URL
- Убедитесь, что launch-редирект создан

**0% загрузка:**
- Проверьте наличие WS ndjson файлов
- Убедитесь, что WS-шим активирован

**TypeError:**
- Проверьте инициализацию игровых объектов
- Убедитесь, что bootstrap-shim загружен

**Внешние запросы:**
- Проверьте ALLOWLIST в консоли
- Убедитесь, что аналитика блокируется

## 📊 Отчёты

После запуска валидатора создаются файлы:

- `reports/<game-name>-report.json` - Полный JSON отчёт
- `reports/<game-name>-report.md` - Человекочитаемый Markdown
- `reports/<game-name>-report_externals_loc.csv` - Координаты внешних URL
- `reports/<game-name>-report_path_mismatch.csv` - Проблемы с путями

## 🎯 Поддерживаемые игры

Скраппер универсален и работает с любыми играми:

- **TopSpin игры** (Paper Plane, и др.) - полная поддержка ingenuity.*
- **PixiJS игры** - автоматические null-guards
- **GSAP анимации** - защита от null объектов
- **WebSocket игры** - универсальный шим
- **Любые HTML5 игры** - базовые защиты

## 🚨 Что оставить ручками

- Редкая игровая логика (специфическое поведение моков/WS)
- Подбор «правильных» `TokenVerified/BetConfig/GameState` для разных режимов
- CSP/SRI (если игра строго валидирует внешку)
- Специфичные игровые механики

## 🔧 Настройка для новой игры

1. **Создайте директорию игры:**
   ```bash
   mkdir dist/my-new-game-offline
   # Скопируйте файлы игры в эту директорию
   ```

2. **Запустите пре-полетный чеклист:**
   ```bash
   npm run preflight-universal my-new-game-offline
   ```

3. **Проверьте результат:**
   ```bash
   npm run serve -- my-new-game-offline
   npm run validate -- my-new-game-offline
   ```

4. **Изучите отчёт:**
   - Откройте `reports/my-new-game-offline-report.md`
   - Исправьте критические проблемы
   - Повторите валидацию

## 📞 Поддержка

При возникновении проблем:

1. Запустите `npm run preflight-universal <game-name>`
2. Проверьте отчёт в `reports/<game-name>-report.md`
3. Изучите CSV файлы с координатами проблем
4. Проверьте консоль браузера на ошибки

## 🎉 Результат

**Все критические проблемы игр теперь решаются автоматически:**

1. ✅ **Чёрный экран** → Универсальный launch-редирект
2. ✅ **0% загрузка** → Универсальный WS-шим
3. ✅ **TypeError** → Универсальный bootstrap-shim
4. ✅ **Pixi/GSAP null** → Универсальные null-guards
5. ✅ **Неточные моки** → Строгие ключи запросов
6. ✅ **Внешние блоки** → Универсальный ALLOWLIST
7. ✅ **Структурные проблемы** → Автопроверка и создание файлов
8. ✅ **Сложная отладка** → Универсальный ИИ-валидатор

**Скраппер теперь работает с любыми играми без ручных исправлений!** 🚀
