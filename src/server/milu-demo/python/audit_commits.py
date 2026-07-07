#!/usr/bin/env python3
"""
Análisis exhaustivo de commits: imágenes, esquemas, QA, rutas, export, wordpress.
Genera un reporte detallado de cambios en los últimos 30-40 commits.
"""

import subprocess
import json
import re
from datetime import datetime
from collections import defaultdict

def run_git(cmd):

    """Ejecutar comando git y retornar output."""
    try:
        result = subprocess.run(f"git {cmd}", shell=True, capture_output=True, text=True, cwd="C:\\Users\\jordi\\source\\repos\\milu")
        return result.stdout.strip() if result.returncode == 0 else ""
    except Exception as e:
        print(f"Error en git {cmd}: {e}")
        return ""
def get_all_commits(limit=40):
    """Obtener últimos N commits con formato estructurado."""
    output = run_git(f"log --all --format='%H|%s|%aI|%an' -{limit}")
    commits = []
    for line in output.split('\n'):
        if not line.strip():
            continue
        parts = line.split('|')
        if len(parts) >= 4:
            commits.append({
                'hash': parts[0],
                'message': parts[1],
                'date': parts[2],
                'author': parts[3]
            })
    return commits

def filter_relevant_commits(commits):
    """Filtrar commits relevantes por keywords."""
    keywords = ['imagen', 'esquema', 'pos', 'qa', 'ruta', 'foto', 'schema', 'export', 'wordpress', 'synthetic', 'esq_']
    relevant = []
    for c in commits:
        msg_lower = c['message'].lower()
        if any(kw in msg_lower for kw in keywords):
            relevant.append(c)
    return relevant

def get_commit_files(hash_):
    """Obtener archivos modificados en un commit."""
    output = run_git(f"show --name-status {hash_}")
    files_modified = {}
    lines = output.split('\n')
    
    for line in lines:
        parts = line.split('\t')
        if len(parts) >= 2:
            status = parts[0]  # M, A, D, etc.
            filename = parts[1] if len(parts) > 1 else ''
            if filename:
                files_modified[filename] = status
    
    return files_modified

def get_commit_stats(hash_):
    """Obtener estadísticas de cambios (insertions, deletions)."""
    output = run_git(f"show --stat {hash_}")
    lines = output.split('\n')
    
    total_insertions = 0
    total_deletions = 0
    
    for line in lines:
        # Busca líneas con patrón: "123 insertions(+), 45 deletions(-)"
        match = re.search(r'(\d+) insertions?\(\+\)', line)
        if match:
            total_insertions = int(match.group(1))
        
        match = re.search(r'(\d+) deletions?\(-\)', line)
        if match:
            total_deletions = int(match.group(1))
    
    return total_insertions, total_deletions

def get_commit_diff_summary(hash_):
    """Obtener resumen del diff para identificar tipo de cambio."""
    output = run_git(f"show {hash_}")
    
    # Buscar patrones comunes
    is_bugfix = 'fix:' in output or 'fix(' in output or 'fixed' in output.lower()
    is_feature = 'feat:' in output or 'feat(' in output or 'feature' in output.lower()
    is_refactor = 'refactor:' in output or 'refactor(' in output
    is_chore = 'chore:' in output
    is_doc = 'docs:' in output or 'doc:' in output
    
    change_type = 'other'
    if is_bugfix:
        change_type = 'bugfix'
    elif is_feature:
        change_type = 'feature'
    elif is_refactor:
        change_type = 'refactor'
    elif is_chore:
        change_type = 'chore'
    elif is_doc:
        change_type = 'doc'
    
    return change_type

def categorize_files(files_dict):
    """Categorizar archivos por tipo."""
    categories = {
        'backend': [],
        'frontend': [],
        'data': [],
        'documentation': [],
        'config': [],
        'other': []
    }
    
    for filepath, status in files_dict.items():
        if filepath.endswith('.py'):
            categories['backend'].append(filepath)
        elif filepath.endswith(('.js', '.css', '.html')):
            categories['frontend'].append(filepath)
        elif filepath.endswith(('.json', '.csv')):
            categories['data'].append(filepath)
        elif filepath.startswith('docs/'):
            categories['documentation'].append(filepath)
        elif filepath in ['package.json', '.gitignore', 'README.md']:
            categories['config'].append(filepath)
        else:
            categories['other'].append(filepath)
    
    return categories

def analyze_commit(hash_):
    """Análisis completo de un commit."""
    output = run_git(f"show --format='%B' -s {hash_}")
    files = get_commit_files(hash_)
    insertions, deletions = get_commit_stats(hash_)
    change_type = get_commit_diff_summary(hash_)
    categories = categorize_files(files)
    
    # Extraer problemas y riesgos del mensaje
    msg_lower = output.lower()
    
    problems = []
    if 'fix' in msg_lower:
        problems.append('bugfix')
    if 'error' in msg_lower or 'error' in msg_lower or 'fail' in msg_lower:
        problems.append('error_handling')
    if 'integration' in msg_lower or 'integrate' in msg_lower:
        problems.append('integration')
    if 'deprecated' in msg_lower or 'remove' in msg_lower:
        problems.append('removal/deprecation')
    
    return {
        'files': files,
        'categories': categories,
        'insertions': insertions,
        'deletions': deletions,
        'change_type': change_type,
        'problem_indicators': problems,
        'commit_body': output
    }

def main():
    print("="*80)
    print("AUDITORÍA EXHAUSTIVA DE COMMITS: MILU")
    print("Imágenes, Esquemas, QA, Rutas, Export, WordPress")
    print("="*80)
    print()
    
    # Obtener todos los commits
    all_commits = get_all_commits(40)
    print(f"Total commits analizados: {len(all_commits)}")
    
    # Filtrar relevantes
    relevant = filter_relevant_commits(all_commits)
    print(f"Commits relevantes encontrados: {len(relevant)}")
    print()
    
    # Análisis por categoria
    change_type_count = defaultdict(int)
    files_touched = defaultdict(int)
    problem_count = defaultdict(int)
    
    print("="*80)
    print("COMMITS RELEVANTES - ANÁLISIS DETALLADO")
    print("="*80)
    print()
    
    for i, commit in enumerate(relevant, 1):
        print(f"\n{'='*80}")
        print(f"COMMIT {i} de {len(relevant)}")
        print(f"{'='*80}")
        print(f"Hash:     {commit['hash'][:12]}")
        print(f"Mensaje:  {commit['message']}")
        print(f"Fecha:    {commit['date']}")
        print(f"Autor:    {commit['author']}")
        
        analysis = analyze_commit(commit['hash'])
        
        print(f"\nTipo de cambio:  {analysis['change_type'].upper()}")
        print(f"Cambios:         +{analysis['insertions']} -{analysis['deletions']}")
        
        if analysis['problem_indicators']:
            print(f"Indicadores:     {', '.join(analysis['problem_indicators'])}")
        
        print(f"\nArchivos modificados ({len(analysis['files'])}):")
        for filepath, status in analysis['files'].items():
            print(f"  {status:1} {filepath}")
        
        # Actualizar contadores
        change_type_count[analysis['change_type']] += 1
        for f in analysis['files'].keys():
            files_touched[f] += 1
        for p in analysis['problem_indicators']:
            problem_count[p] += 1
    
    # RESUMEN FINAL
    print("\n" + "="*80)
    print("ANÁLISIS DE PATRONES")
    print("="*80)
    
    print("\nTipos de cambios:")
    for ctype, count in sorted(change_type_count.items(), key=lambda x: -x[1]):
        print(f"  {ctype:12} : {count:3}")
    
    print("\nProblemas más frecuentes:")
    for ptype, count in sorted(problem_count.items(), key=lambda x: -x[1]):
        print(f"  {ptype:20} : {count:3}")
    
    print("\nArchivos más tocados:")
    sorted_files = sorted(files_touched.items(), key=lambda x: -x[1])
    for filepath, count in sorted_files[:15]:
        print(f"  {count:2}x {filepath}")

if __name__ == '__main__':
    main()
