#!/usr/bin/env python3
"""
AI Validator for offline game builds.

Что делает:
- Сканирует dist/ (HTML/JS/CSS/JSON) и ищет:
  * внешние URL (http/https/wss),
  * паттерны черного экрана: ChunkLoadError/__webpack_public_path__/token=undefined/gameParam/isSocial.
- Сверяет mirrorIndex.json с реальными файлами (missing/extra).
- Читает headless-логи (diag.json от твоего валидатора) и суммирует 4xx/5xx, ChunkLoadError, console/page errors.
- (Опционально) Отправляет сжатое summary в io.net (модель "deepsick") и пишет совет в report.json.

Запуск (локально, без ИИ):
  python ai_validator.py --dist dist/bananza --logs logs/diag.json --out reports/report.json --out-md reports/report.md

Запуск с ИИ (io.net):
  export IO_NET_API_KEY="sk_...твойключ..."
  # (опц) export IO_NET_ENDPOINT="https://api.io.net/v1/infer"
  python ai_validator.py --dist dist/bananza --logs logs/diag.json --out reports/report.json --out-md reports/report.md --call-ai
"""
import argparse, json, os, re, pathlib

# ---------- Паттерны ----------
TEXT_EXT = {'.html','.htm','.js','.mjs','.css','.json','.map','.svg','.txt'}
EXTERNAL_URL_RE = re.compile(r"""(?i)\b(?:https?:)?//[^\s'")>]+""")
WS_RE = re.compile(r"wss?://", re.I)
TOKEN_UNDEFINED_RE = re.compile(r"(token\s*=\s*undefined|[?&]token=undefined)", re.I)
GAMEPARAM_RE = re.compile(r"\bgameParam\b|loadPlatformConfig|isSocial", re.I)
CHUNK_ERR_RE = re.compile(r"ChunkLoadError|Loading chunk|__webpack_public_path__", re.I)

# Универсальные паттерны для игр
IFRAME_LAUNCH_RE = re.compile(r'<iframe[^>]*src\s*=\s*["\']([^"\']*launch[^"\']*)["\']', re.I)
GAME_OBJECT_ERROR_RE = re.compile(r"(ingenuity|gameConfig|gameState|soundManager)\.[a-zA-Z]+ is not a function|Cannot read properties of.*(ingenuity|gameConfig|gameState)", re.I)
PIXI_ID_RE = re.compile(r"_pixiId|PIXI\.utils\.from.*null", re.I)
GSAP_NULL_RE = re.compile(r"gsap\.to.*null|Cannot read properties of null.*gsap", re.I)
WEBSOCKET_ERROR_RE = re.compile(r"WebSocket.*failed|WebSocket.*error|ws.*not.*found", re.I)

def read_text(p: pathlib.Path):
    try:
        return p.read_text(encoding='utf-8', errors='ignore')
    except:
        return ''

def find_coordinates(text, pattern, file_path):
    """Находит координаты вхождений паттерна в тексте"""
    coordinates = []
    for match in pattern.finditer(text):
        line_num = text[:match.start()].count('\n') + 1
        col_num = match.start() - text.rfind('\n', 0, match.start()) - 1
        coordinates.append({
            'line': line_num,
            'column': col_num,
            'match': match.group(0)[:100],  # Первые 100 символов
            'file': file_path
        })
    return coordinates

# ---------- Скан dist ----------
def scan_dist(dist_root: str):
    dist = pathlib.Path(dist_root)
    files, externals, warnings = [], [], []
    externals_coords = []
    
    for p in dist.rglob("*"):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        rel_path = str(p.relative_to(dist))
        row = {"path": rel_path, "size": p.stat().st_size, "ext": ext}
        
        if ext in TEXT_EXT:
            txt = read_text(p)
            
            # Поиск внешних URL с координатами
            if EXTERNAL_URL_RE.search(txt) or WS_RE.search(txt):
                row["has_external"] = True
                externals.append(row)
                # Добавляем координаты
                externals_coords.extend(find_coordinates(txt, EXTERNAL_URL_RE, rel_path))
                externals_coords.extend(find_coordinates(txt, WS_RE, rel_path))
            
            # Универсальные детекторы для игр
            if IFRAME_LAUNCH_RE.search(txt):
                coords = find_coordinates(txt, IFRAME_LAUNCH_RE, rel_path)
                for coord in coords:
                    warnings.append({
                        "type": "iframe_launch_no_query",
                        "file": rel_path,
                        "severity": "high",
                        "coordinates": coord,
                        "advice": "Создать launch-редирект с query параметрами"
                    })
            
            if GAME_OBJECT_ERROR_RE.search(txt):
                coords = find_coordinates(txt, GAME_OBJECT_ERROR_RE, rel_path)
                for coord in coords:
                    warnings.append({
                        "type": "game_object_error",
                        "file": rel_path,
                        "severity": "high",
                        "coordinates": coord,
                        "advice": "Включить bootstrap-shim для игровых объектов"
                    })
            
            if PIXI_ID_RE.search(txt):
                coords = find_coordinates(txt, PIXI_ID_RE, rel_path)
                for coord in coords:
                    warnings.append({
                        "type": "pixi_null_error",
                        "file": rel_path,
                        "severity": "medium",
                        "coordinates": coord,
                        "advice": "Включить PixiJS null-guards"
                    })
            
            if GSAP_NULL_RE.search(txt):
                coords = find_coordinates(txt, GSAP_NULL_RE, rel_path)
                for coord in coords:
                    warnings.append({
                        "type": "gsap_null_error",
                        "file": rel_path,
                        "severity": "medium",
                        "coordinates": coord,
                        "advice": "Включить GSAP null-guards"
                    })
            
            if WEBSOCKET_ERROR_RE.search(txt):
                coords = find_coordinates(txt, WEBSOCKET_ERROR_RE, rel_path)
                for coord in coords:
                    warnings.append({
                        "type": "websocket_error",
                        "file": rel_path,
                        "severity": "high",
                        "coordinates": coord,
                        "advice": "Включить WS-шим с проигрывателем моков"
                    })
            
            # Стандартные проверки
            if TOKEN_UNDEFINED_RE.search(txt):
                warnings.append({"type":"token_undefined","file":rel_path,"severity":"high"})
            if GAMEPARAM_RE.search(txt):
                warnings.append({"type":"gameparam_hint","file":rel_path,"severity":"medium"})
            if CHUNK_ERR_RE.search(txt):
                warnings.append({"type":"chunk_hint","file":rel_path,"severity":"high"})
                
        files.append(row)
    
    return files, externals, warnings, externals_coords

# ---------- Проверка относительной глубины путей ----------
def check_path_resolution(dist_root: str):
    """Проверяет, что все локальные пути разрешаются корректно"""
    dist = pathlib.Path(dist_root)
    path_issues = []
    
    for p in dist.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in TEXT_EXT:
            continue
            
        txt = read_text(p)
        rel_path = str(p.relative_to(dist))
        
        # Ищем относительные пути в HTML/CSS/JS
        if p.suffix.lower() in ['.html', '.htm']:
            # Ищем src, href в HTML
            for match in re.finditer(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', txt, re.I):
                url = match.group(1)
                if not url.startswith(('http://', 'https://', '//', '#')):
                    resolved = (p.parent / url).resolve()
                    if not resolved.exists():
                        path_issues.append({
                            'file': rel_path,
                            'url': url,
                            'resolved': str(resolved.relative_to(dist)),
                            'line': txt[:match.start()].count('\n') + 1,
                            'issue': 'missing_file'
                        })
        
        elif p.suffix.lower() == '.css':
            # Ищем url() в CSS
            for match in re.finditer(r'url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)', txt, re.I):
                url = match.group(1)
                if not url.startswith(('http://', 'https://', '//', 'data:')):
                    resolved = (p.parent / url).resolve()
                    if not resolved.exists():
                        path_issues.append({
                            'file': rel_path,
                            'url': url,
                            'resolved': str(resolved.relative_to(dist)),
                            'line': txt[:match.start()].count('\n') + 1,
                            'issue': 'missing_file'
                        })
    
    return path_issues

# ---------- Утилиты ----------
def load_json(path):
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            return json.load(f)
    except:
        return None

# ---------- Сравнение mirrorIndex ----------
def compare_mirror(dist_root: str, mirror_index):
    if mirror_index is None:
        return {"note":"mirrorIndex.json not found"}
    dist = pathlib.Path(dist_root)
    missing, index_paths = [], set()
    if isinstance(mirror_index, dict):
        vals = mirror_index.values()
    elif isinstance(mirror_index, list):
        vals = mirror_index
    else:
        return {"error":"Unsupported mirrorIndex format"}
    for v in vals:
        rel = str(v).lstrip('./')
        index_paths.add(rel)
        if not (dist/rel).exists():
            missing.append(rel)
    present = {str(p.relative_to(dist)) for p in dist.rglob("*") if p.is_file()}
    extra = sorted(list(present - index_paths))[:500]
    return {
        "index_count": len(index_paths),
        "missing_count": len(missing),
        "missing_examples": missing[:25],
        "extra_examples": extra[:25]
    }

# ---------- Анализ логов (diag.json) ----------
def analyze_logs(log_path: str):
    if not log_path or not os.path.exists(log_path):
        return {"note":"no logs provided"}
    try:
        data = json.load(open(log_path, 'r', encoding='utf-8', errors='ignore'))
    except:
        return {"error":"cannot parse logs json"}
    responses = data.get("responses", [])
    externals = data.get("externalBlocked", [])
    errors = data.get("errors", [])
    console = data.get("console", [])
    chunks = data.get("chunks", [])
    http_errs = [r for r in responses if isinstance(r.get("status"), int) and r["status"]>=400]
    return {
        "summary": {
            "externalBlocked": len(externals),
            "http4xx5xx": len(http_errs),
            "page_errors": len(errors),
            "console_errors": len(console),
            "chunks": len(chunks)
        },
        "externals": externals[:50],
        "http_errors": http_errs[:50],
        "console": console[:50],
        "chunks_list": chunks[:50]
    }

# ---------- Проверка mock-index (опц.) ----------
def check_mocks(mocks_path: str, logs_summary: dict):
    idx = load_json(mocks_path)
    if not idx:
        return {"note":"mock-index not found"}
    keys = set()
    if isinstance(idx, list):
        for it in idx:
            k = it.get("key") or it.get("endpoint")
            if k: keys.add(k)
    elif isinstance(idx, dict):
        keys.update(idx.keys())
    else:
        return {"error":"unsupported mock-index format"}
    return {"mock_count": len(keys)}


# ---------- Анализ мок-данных ----------
def analyze_mock_data(mocks_path: str):
    """
    Анализирует мок-данные на ошибки и корректность.
    """
    if not mocks_path or not os.path.exists(mocks_path):
        return {"note": "mocks folder not found"}
    
    mocks_dir = pathlib.Path(mocks_path)
    issues = []
    mock_files = []
    total_size = 0
    
    # Анализируем API моки
    api_dir = mocks_dir / "api"
    if api_dir.exists():
        for mock_file in api_dir.glob("*.json"):
            try:
                with open(mock_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                file_size = mock_file.stat().st_size
                total_size += file_size
                mock_files.append({
                    "file": str(mock_file.relative_to(mocks_dir)),
                    "size": file_size,
                    "type": "api"
                })
                
                # Проверяем структуру API мока
                if isinstance(data, dict):
                    if "request" in data and "response" in data:
                        # Проверяем URL
                        request = data.get("request", {})
                        url = request.get("url", "")
                        if not url:
                            issues.append({
                                "type": "missing_url",
                                "file": str(mock_file.relative_to(mocks_dir)),
                                "severity": "high"
                            })
                        
                        # Проверяем статус ответа
                        response = data.get("response", {})
                        status = response.get("status")
                        if status and status >= 400:
                            issues.append({
                                "type": "error_status",
                                "file": str(mock_file.relative_to(mocks_dir)),
                                "status": status,
                                "severity": "medium"
                            })
                        
                        # Проверяем заголовки
                        headers = response.get("headers", {})
                        content_type = headers.get("content-type", "")
                        if "application/json" in content_type and not response.get("body"):
                            issues.append({
                                "type": "empty_json_response",
                                "file": str(mock_file.relative_to(mocks_dir)),
                                "severity": "medium"
                            })
                    else:
                        issues.append({
                            "type": "invalid_structure",
                            "file": str(mock_file.relative_to(mocks_dir)),
                            "severity": "high"
                        })
                else:
                    issues.append({
                        "type": "not_dict",
                        "file": str(mock_file.relative_to(mocks_dir)),
                        "severity": "high"
                    })
                    
            except json.JSONDecodeError as e:
                issues.append({
                    "type": "json_parse_error",
                    "file": str(mock_file.relative_to(mocks_dir)),
                    "error": str(e),
                    "severity": "high"
                })
            except Exception as e:
                issues.append({
                    "type": "file_error",
                    "file": str(mock_file.relative_to(mocks_dir)),
                    "error": str(e),
                    "severity": "medium"
                })
    
    # Анализируем WebSocket моки
    ws_dir = mocks_dir / "ws"
    if ws_dir.exists():
        for ws_file in ws_dir.rglob("*.ndjson"):
            try:
                file_size = ws_file.stat().st_size
                total_size += file_size
                mock_files.append({
                    "file": str(ws_file.relative_to(mocks_dir)),
                    "size": file_size,
                    "type": "websocket"
                })
                
                # Проверяем, что файл не пустой
                if file_size == 0:
                    issues.append({
                        "type": "empty_ws_file",
                        "file": str(ws_file.relative_to(mocks_dir)),
                        "severity": "medium"
                    })
                    
            except Exception as e:
                issues.append({
                    "type": "ws_file_error",
                    "file": str(ws_file.relative_to(mocks_dir)),
                    "error": str(e),
                    "severity": "medium"
                })
    
    # Анализируем карты моков
    api_map = mocks_dir / "apiMap.json"
    ws_map = mocks_dir / "wsMap.json"
    
    map_issues = []
    if api_map.exists():
        try:
            with open(api_map, 'r', encoding='utf-8') as f:
                api_map_data = json.load(f)
            if not isinstance(api_map_data, dict) or len(api_map_data) == 0:
                map_issues.append("apiMap.json is empty or invalid")
        except Exception as e:
            map_issues.append(f"apiMap.json error: {e}")
    
    if ws_map.exists():
        try:
            with open(ws_map, 'r', encoding='utf-8') as f:
                ws_map_data = json.load(f)
            if not isinstance(ws_map_data, dict) or len(ws_map_data) == 0:
                map_issues.append("wsMap.json is empty or invalid")
        except Exception as e:
            map_issues.append(f"wsMap.json error: {e}")
    
    return {
        "total_mock_files": len(mock_files),
        "total_size_mb": round(total_size / 1024 / 1024, 2),
        "api_mocks_count": len([f for f in mock_files if f["type"] == "api"]),
        "ws_mocks_count": len([f for f in mock_files if f["type"] == "websocket"]),
        "issues_count": len(issues),
        "issues_by_severity": {
            "high": len([i for i in issues if i["severity"] == "high"]),
            "medium": len([i for i in issues if i["severity"] == "medium"]),
            "low": len([i for i in issues if i["severity"] == "low"])
        },
        "top_issues": issues[:20],
        "map_issues": map_issues,
        "sample_mock_files": mock_files[:10]
    }

# ---------- Вызов io.net (модель deepsick) ----------
def call_io_net_deepsick(summary: dict, endpoint: str=None, api_key: str=None):
    """
    Отправляет КОРОТКОЕ summary в io.net, модель "deepsick".
    Нужен только при запуске с флагом --call-ai.
    """
    import requests
    endpoint = endpoint or "https://api.intelligence.io.solutions/api/v1/chat/completions"
    api_key = "io-v2-eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJvd25lciI6ImYyNDhjNjJiLTdiZTEtNDM0ZS1iMTc3LTY1N2M4ZDIxZWNkZiIsImV4cCI6NDkxMjY1NzQ4N30.P3WTqLBlcuKCjzWkg12nCzRqLTJByBWWiN33W-8rTe7urWoEeJS5bkpNHi2ALfkcxyxF_235GNogCyRilvHKBQ"
    if not api_key:
        raise RuntimeError("IOINTELLIGENCE_API_KEY not set (export IOINTELLIGENCE_API_KEY=...)")

    # Формируем краткое описание проблем
    issues = []
    if summary.get("externals_count", 0) > 0:
        issues.append(f"Найдено {summary['externals_count']} файлов с внешними URL")
    if summary.get("warnings_count", 0) > 0:
        issues.append(f"Найдено {summary['warnings_count']} предупреждений о проблемах")
    if summary.get("mirror", {}).get("missing_count", 0) > 0:
        issues.append(f"Отсутствует {summary['mirror']['missing_count']} файлов в mirrorIndex")
    
    
    mock_analysis = summary.get("mock_analysis", {})
    if mock_analysis.get("issues_count", 0) > 0:
        issues.append(f"Найдено {mock_analysis['issues_count']} проблем в мок-данных")
    
    issues_text = "; ".join(issues) if issues else "Критических проблем не найдено"
    
    payload = {
        "model": "deepseek-ai/DeepSeek-R1-0528",
        "messages": [
            {
                "role": "system",
                "content": "Ты - старший валидатор офлайн-игр. Проанализируй предоставленную сводку и верни РОВНО 5 приоритетных, выполнимых исправлений для офлайн-сборок игр. Сосредоточься на проблемах черного экрана, внешних URL и отсутствующих файлах. Отвечай ТОЛЬКО на русском языке."
            },
            {
                "role": "user", 
                "content": f"""Проанализируй проблемы с офлайн-сборкой игры:

Проблемы: {issues_text}

Детали:
- Файлов просканировано: {summary.get('file_count', 0)}
- Внешние URL: {summary.get('externals_count', 0)}
- Предупреждения: {summary.get('warnings_count', 0)}
- Mirror проблемы: {summary.get('mirror', {})}
- Мок-данные: {summary.get('mock_analysis', {})}

Верни 5 приоритетных исправлений в формате:
1. [КРИТИЧНО/ВЫСОКО/СРЕДНЕ] - Описание проблемы - Конкретное действие
2. [КРИТИЧНО/ВЫСОКО/СРЕДНЕ] - Описание проблемы - Конкретное действие
..."""
            }
        ],
        "max_tokens": 800,
        "temperature": 0.1
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    resp = requests.post(endpoint, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    try:
        result = resp.json()
        # Извлекаем только чистый контент из ответа
        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            # Убираем теги <think> если есть
            if "<think>" in content:
                # Находим конец тега <think>
                end_think = content.find("</think>")
                if end_think != -1:
                    content = content[end_think + 8:].strip()
                else:
                    # Если нет закрывающего тега, убираем все до первого переноса строки после <think>
                    start_think = content.find("<think>")
                    if start_think != -1:
                        after_think = content[start_think + 7:]
                        # Ищем первый перенос строки и берем все после него
                        first_newline = after_think.find("\n")
                        if first_newline != -1:
                            content = after_think[first_newline + 1:].strip()
                        else:
                            content = after_think.strip()
            # Если ответ слишком длинный, обрезаем до разумного размера
            if len(content) > 4000:
                content = content[:4000] + "\n\n[Ответ обрезан для читаемости]"
            
            return {"content": content}
        else:
            return {"error": "No choices in response", "raw": result}
    except Exception as e:
        return {"error": str(e), "text": resp.text}

# ---------- Формирование отчёта ----------
def generate_report(dist_root, mirror_path, mocks_path, logs_path, out_json, out_md, call_ai=False):
    files, externals, warnings, externals_coords = scan_dist(dist_root)
    mirror = load_json(mirror_path) if mirror_path else None
    mirror_check = compare_mirror(dist_root, mirror) if mirror is not None else {"note":"mirrorIndex missing"}
    logs = analyze_logs(logs_path)
    mocks = check_mocks(mocks_path, logs.get("summary", {}))
    
    # Анализ мок-данных
    mock_analysis = analyze_mock_data(mocks_path) if mocks_path else {"note": "mocks path not provided"}
    
    # Проверка разрешения путей
    path_issues = check_path_resolution(dist_root)

    severity = []
    if externals:
        severity.append({"level":"high","reason":"external_urls_in_dist","count":len(externals)})
    s = logs.get("summary", {})
    if any([s.get("http4xx5xx"), s.get("chunks"), s.get("page_errors"), s.get("console_errors")]):
        severity.append({"level":"high","reason":"runtime_errors","summary":s})
    if isinstance(mirror_check, dict) and mirror_check.get("missing_count", 0) > 0:
        severity.append({"level":"high","reason":"missing_files_in_mirror","count":mirror_check.get("missing_count")})
    
    
    if isinstance(mock_analysis, dict) and mock_analysis.get("issues_count", 0) > 0:
        high_issues = mock_analysis.get("issues_by_severity", {}).get("high", 0)
        if high_issues > 0:
            severity.append({"level":"high","reason":"mock_data_issues","count":high_issues})
        elif mock_analysis.get("issues_count", 0) > 0:
            severity.append({"level":"medium","reason":"mock_data_issues","count":mock_analysis.get("issues_count")})

    report = {
        "dist_root": dist_root,
        "file_count": len(files),
        "externals_count": len(externals),
        "warnings_count": len(warnings),
        "mirror": mirror_check,
        "logs": logs,
        "mocks": mocks,
        "mock_analysis": mock_analysis,
        "path_issues": path_issues,
        "externals_coordinates": externals_coords[:100],  # Ограничиваем для размера
        "severity": severity,
        "top_externals": externals[:50],
        "top_warnings": warnings[:50]
    }

    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    md = []
    md += [
        f"# AI Validator Report",
        f"- dist: `{dist_root}`",
        f"- files scanned: **{len(files)}**",
        f"- externals in dist: **{len(externals)}**",
        f"- runtime warnings: **{len(warnings)}**",
        f"- path resolution issues: **{len(path_issues)}**",
        f"- external coordinates found: **{len(externals_coords)}**",
        "## Priorities"
    ]
    if severity:
        for it in severity:
            md.append(f"- **{it['level'].upper()}** — {it['reason']} — {it.get('count', it.get('summary',''))}")
    else:
        md.append("- No critical issues detected.")
    md += [
        "", "## Mirror index", "```json",
        json.dumps(mirror_check, ensure_ascii=False, indent=2), "```",
        "", "## Logs summary", "```json",
        json.dumps(logs.get('summary',{}), ensure_ascii=False, indent=2), "```",
        "", "## Mock data analysis", "```json",
        json.dumps(mock_analysis, ensure_ascii=False, indent=2), "```",
        "", "## Path resolution issues", "```json",
        json.dumps(path_issues[:20], ensure_ascii=False, indent=2), "```",
        "", "## Game-specific warnings"
    ]
    
    # Добавляем универсальные предупреждения для игр
    game_warnings = [w for w in warnings if w.get('type') in ['iframe_launch_no_query', 'game_object_error', 'pixi_null_error', 'gsap_null_error', 'websocket_error']]
    if game_warnings:
        for warning in game_warnings[:10]:
            md.append(f"- **{warning['severity'].upper()}** {warning['type']} in {warning['file']}")
            if 'coordinates' in warning:
                coord = warning['coordinates']
                md.append(f"  - Line {coord['line']}, Column {coord['column']}: `{coord['match']}`")
            if 'advice' in warning:
                md.append(f"  - 💡 {warning['advice']}")
    else:
        md.append("- No game-specific issues detected")
    
    md += ["", "## Sample externals"]
    for e in report["top_externals"]:
        md.append(f"- {e['path']} (size={e['size']})")
    
    os.makedirs(os.path.dirname(out_md), exist_ok=True)
    with open(out_md, 'w', encoding='utf-8') as f:
        f.write("\n".join(md))
    
    # Экспортируем CSV файлы с координатами
    import csv
    
    # CSV с координатами внешних URL
    externals_csv = out_json.replace('.json', '_externals_loc.csv')
    with open(externals_csv, 'w', newline='', encoding='utf-8') as f:
        if externals_coords:
            writer = csv.DictWriter(f, fieldnames=['file', 'line', 'column', 'match'])
            writer.writeheader()
            writer.writerows(externals_coords[:1000])  # Ограничиваем для размера
    
    # CSV с проблемами путей
    paths_csv = out_json.replace('.json', '_path_mismatch.csv')
    with open(paths_csv, 'w', newline='', encoding='utf-8') as f:
        if path_issues:
            writer = csv.DictWriter(f, fieldnames=['file', 'url', 'resolved', 'line', 'issue'])
            writer.writeheader()
            writer.writerows(path_issues)
    
    print(f"CSV files exported: {externals_csv}, {paths_csv}")

    if call_ai:
        compact = {
            "dist_root": dist_root,
            "externals_count": len(externals),
            "warnings_count": len(warnings),
            "mirror": mirror_check,
            "logs": logs.get("summary", {}),
            "mock_analysis": mock_analysis,
            "top_externals": [e["path"] for e in report["top_externals"]],
            "top_warnings": report["top_warnings"]
        }
        try:
            advice = call_io_net_deepsick(compact)
            report["ai_advice"] = advice
            
            # Добавляем ИИ-рекомендации в Markdown
            if "content" in advice:
                with open(out_md, 'a', encoding='utf-8') as f:
                    f.write(f"\n\n## ИИ-рекомендации\n\n```\n{advice['content']}\n```\n")
            elif "error" in advice:
                with open(out_md, 'a', encoding='utf-8') as f:
                    f.write(f"\n\n## ИИ-анализ\n\nОшибка: {advice['error']}\n")
            
            with open(out_json, 'w', encoding='utf-8') as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
        except Exception as e:
            report["ai_error"] = str(e)
            with open(out_md, 'a', encoding='utf-8') as f:
                f.write(f"\n\n## ИИ-анализ\n\nОшибка: {str(e)}\n")
            with open(out_json, 'w', encoding='utf-8') as f:
                json.dump(report, f, ensure_ascii=False, indent=2)

    return report

# ---------- CLI ----------
if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True, help="Path to dist/<game> folder")
    ap.add_argument("--mirror", default=None, help="Path to mirrorIndex.json (defaults to <dist>/mirrorIndex.json)")
    ap.add_argument("--mocks", default=None, help="Path to mocks folder (optional)")
    ap.add_argument("--logs", default=None, help="Path to Playwright diag logs (optional)")
    ap.add_argument("--out", default="reports/report.json", help="Where to write JSON report")
    ap.add_argument("--out-md", default="reports/report.md", help="Where to write Markdown report")
    ap.add_argument("--call-ai", action="store_true", help="Call io.net deepsick model")
    args = ap.parse_args()

    mirror = args.mirror or os.path.join(args.dist, "mirrorIndex.json")
    mocks = args.mocks or os.path.join(args.dist, "mocks")
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    os.makedirs(os.path.dirname(args.out_md), exist_ok=True)

    generate_report(
        dist_root=args.dist,
        mirror_path=mirror,
        mocks_path=mocks,
        logs_path=args.logs,
        out_json=args.out,
        out_md=args.out_md,
        call_ai=args.call_ai,
    )
    print("Report written:", args.out, args.out_md)
