# Инструменты диагностики и исправления

Набор инструментов для диагностики и исправления проблем в собранных проектах offline-game-scraper.

## 🛠️ Доступные инструменты

### 🔍 HAR Анализатор и создание моков

**6. `extract-mock-requests.mjs` - Анализатор HAR файлов**
**Назначение:** Анализирует HAR файлы и извлекает список запросов для создания моков.

```bash
node bin/extract-mock-requests.mjs --har capture.har --out ./mock-scan --save-responses
```

**Что делает:**
- Читает HAR файлы (export из Chrome/Playwright/Puppeteer)
- Создает нормализованные ключи: `METHOD|PATHNAME|sorted-query|bodyHash`
- Анализирует частоту вызовов, статусы ответов
- Сохраняет образцы ответов для создания фикстур
- Создает `mock-index.json` с приоритизированным списком

**7. `interactive-mock-selector.mjs` - Интерактивный селектор моков**
**Назначение:** Позволяет выбрать какие запросы нужно замокать и создает заготовки.

```bash
node bin/interactive-mock-selector.mjs ./mock-scan/mock-index.json
```

**Что делает:**
- Показывает список запросов с приоритетами
- Позволяет выбрать запросы для моков
- Создает заготовки фикстур и конфигурации
- Генерирует README с инструкциями

**8. `test-har-analyzer.mjs` - Тестирование HAR анализатора**
**Назначение:** Тестирует работоспособность HAR анализатора.

```bash
node bin/test-har-analyzer.mjs
```

### 🔧 Основные инструменты диагностики

### 1. `external-url-detector.mjs` - Детектор внешних URL
**Назначение:** Находит необработанные внешние ссылки в собранных проектах.

```bash
node bin/external-url-detector.mjs dist/bananza-complete
```

**Что проверяет:**
- HTTP/HTTPS ссылки
- WebSocket ссылки (ws/wss)
- Protocol-relative URLs (//)
- Исключает localhost и разрешенные домены

**Критерий успеха:** 0 внешних URL

### 2. `mirror-sync-checker.mjs` - Проверка синхронизации Mirror
**Назначение:** Проверяет соответствие между `mirrorIndex.json` и `ASSET_MAP`.

```bash
node bin/mirror-sync-checker.mjs dist/bananza-complete
```

**Что проверяет:**
- Соответствие ключей в `mirrorIndex.json` и `ASSET_MAP`
- Дубликаты в обоих источниках
- Соответствие с `manifest.assets`

**Критерий успеха:** Все ключи синхронизированы

### 3. `mock-key-normalizer.mjs` - Нормализатор ключей моков
**Назначение:** Проверяет корректность ключей API моков.

```bash
node bin/mock-key-normalizer.mjs dist/bananza-complete
```

**Что проверяет:**
- Формат ключей моков: `METHOD|pathname|sorted(query)|bodyHash`
- Нормализацию URL и тела запросов
- Специфичные проблемы (vote API, Adobe DTM, Google Analytics)

**Критерий успеха:** Все ключи моков корректны

### 4. `webpack-path-fixer.mjs` - Исправление Webpack путей
**Назначение:** Исправляет `__webpack_public_path__` для правильной загрузки чанков.

```bash
# Показать статус
node bin/webpack-path-fixer.mjs dist/bananza-complete status

# Исправить
node bin/webpack-path-fixer.mjs dist/bananza-complete fix

# Восстановить из резервной копии
node bin/webpack-path-fixer.mjs dist/bananza-complete restore
```

**Что делает:**
- Устанавливает `__webpack_public_path__ = '../'` в `runtime/offline.js`
- Создает резервную копию перед изменениями
- Позволяет восстановить исходное состояние

### 5. `validate.mjs` - Универсальный валидатор
**Назначение:** Запускает все проверки в одном инструменте.

```bash
node bin/validate.mjs dist/bananza-complete
```

**Что проверяет:**
- ✅ Внешние URL
- ✅ Синхронизация Mirror
- ✅ Ключи моков
- ✅ Глубина путей
- ✅ Конфигурация Webpack
- ✅ CORS заголовки

## 🚀 Быстрый старт

### 1. Создание моков из HAR файлов
```bash
# 1. Создайте HAR файл (Chrome DevTools → Network → Save as HAR)
# 2. Анализируйте HAR и создайте список запросов
node bin/extract-mock-requests.mjs --har capture.har --out ./mock-scan --save-responses

# 3. Интерактивно выберите запросы для моков
node bin/interactive-mock-selector.mjs ./mock-scan/mock-index.json

# 4. Используйте созданные заготовки для интеграции моков
```

### 2. Проверка готового проекта
```bash
# Полная валидация
node bin/validate.mjs dist/bananza-complete

# Если есть проблемы, исправляем по очереди
node bin/webpack-path-fixer.mjs dist/bananza-complete fix
```

### 3. Диагностика проблем
```bash
# Поиск внешних URL
node bin/external-url-detector.mjs dist/bananza-complete

# Проверка синхронизации
node bin/mirror-sync-checker.mjs dist/bananza-complete

# Проверка моков
node bin/mock-key-normalizer.mjs dist/bananza-complete
```

## 📊 Интерпретация результатов

### ✅ Успешная проверка
```
✅ ПРОВЕРКА ПРОЙДЕНА - проблем не найдено
```

### ❌ Проблемы найдены
```
❌ ПРОВЕРКА НЕ ПРОЙДЕНА
🚨 НАЙДЕННЫЕ ПРОБЛЕМЫ:
  1. Внешние URL в index.html
  2. Несоответствие ключей в mirrorIndex.json
```

## 🔧 Типичные проблемы и решения

### 1. Создание моков из HAR
**Проблема:** Не знаете какие запросы нужно замокать
**Решение:**
```bash
# 1. Создайте HAR файл с полным сценарием использования
# 2. Анализируйте HAR
node bin/extract-mock-requests.mjs --har capture.har --save-responses

# 3. Выберите важные запросы
node bin/interactive-mock-selector.mjs ./mock-scan/mock-index.json
```

**Проблема:** HAR не содержит все запросы (beacon, WebSocket)
**Решение:**
- Используйте Playwright/Puppeteer для захвата
- Добавьте задержки для ленивых запросов
- Проверьте фильтры в DevTools

### 2. Внешние URL
**Проблема:** В HTML/JS остались ссылки на внешние ресурсы
**Решение:** 
- Добавить URL в `mirrorIndex.json`
- Пересобрать проект
- Проверить настройки скраппера

### 3. ChunkLoadError
**Проблема:** Webpack не может загрузить чанки
**Решение:**
```bash
node bin/webpack-path-fixer.mjs dist/bananza-complete fix
```

### 4. Несоответствие моков
**Проблема:** API запросы не находят соответствующие моки
**Решение:**
- Проверить нормализацию URL
- Убедиться в правильности query параметров
- Проверить тело POST запросов
- Использовать HAR анализатор для создания правильных ключей

### 5. Синхронизация Mirror
**Проблема:** `mirrorIndex.json` и `ASSET_MAP` не синхронизированы
**Решение:**
- Убедиться, что `mirrorIndex.json` - единый источник истины
- Пересобрать проект
- Проверить процесс генерации

## 🎯 Критерии качества

Проект считается готовым, если:
- ✅ 0 внешних URL
- ✅ 0 404 ошибок
- ✅ 0 ChunkLoadError
- ✅ 0 CORS ошибок
- ✅ Все моки работают
- ✅ Mirror синхронизирован

## 🔄 Интеграция в CI/CD

Добавьте в pipeline:
```bash
# Проверка после сборки
node bin/validate.mjs dist/$PROJECT_NAME

# Если проверка не прошла, сборка падает
if [ $? -ne 0 ]; then
  echo "❌ Валидация не пройдена"
  exit 1
fi
```

## 📝 Логирование

Все инструменты выводят подробные отчеты:
- 📊 Статистика проверок
- 🚨 Найденные проблемы
- 💡 Рекомендации по исправлению
- ✅ Статус каждой проверки

## 🆘 Поддержка

При возникновении проблем:
1. Запустите `validate.mjs` для полной диагностики
2. Проверьте логи каждого инструмента
3. Используйте резервные копии для восстановления
4. Обратитесь к разработчикам с полным логом
