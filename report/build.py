# -*- coding: utf-8 -*-
"""Пересборка tenant-report.html из модулей.

Заменяет содержимое script-блоков standalone-файла на актуальные
categories.js / data.js / charts.js / final.js. Блок с логотипом и общий блок
(metrics/ecoCtx + бутстрап standalone-версии) остаются как есть.
Запуск: python build.py
"""
import io
import re

HTML = 'tenant-report.html'

s = io.open(HTML, encoding='utf-8', newline='').read()
blocks = [m for m in re.finditer(r'<script>\r?\n(.*?)</script>', s, re.S)]
assert len(blocks) == 5, 'ожидалось 5 script-блоков, найдено %d' % len(blocks)


def mod(name):
    return io.open(name, encoding='utf-8', newline='').read().rstrip('\r\n') + '\r\n'


# блок 0 — логотип, блок 3 — общий код standalone: не трогаем
repl = {
    1: (mod('categories.js') + '\r\n' + mod('ocr-benchmarks.js') + '\r\n' + mod('to-benchmarks.js') +
        '\r\n' + mod('rates-plan.js') + '\r\n' + mod('data.js')),
    2: mod('charts.js'),
    4: mod('final.js') + mod('compare.js'),   # лист 3 — сравнение с коллегами
}

out, prev = [], 0
for i, m in enumerate(blocks):
    if i in repl:
        out.append(s[prev:m.start(1)])
        out.append(repl[i])
        prev = m.end(1)
out.append(s[prev:])
io.open(HTML, 'w', encoding='utf-8', newline='').write(''.join(out))
print('tenant-report.html пересобран')
