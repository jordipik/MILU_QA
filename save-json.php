<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$ALLOWED_FILES = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_12V4000M70.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json',
];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Health check: GET devuelve {"ok":true} para que el frontend detecte disponibilidad
if ($method === 'GET') {
    echo json_encode(['ok' => true, 'mode' => 'php']);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Metodo no permitido.']);
    exit;
}

$rawInput = (string)file_get_contents('php://input');
$body = json_decode($rawInput, true);

if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON no valido.']);
    exit;
}

$file  = isset($body['file'])  ? (string)$body['file']  : '';
$id    = isset($body['id'])    ? (string)$body['id']    : '';
$col   = isset($body['col'])   ? (string)$body['col']   : '';
$value = $body['value'] ?? null;

if ($file === '' || $id === '' || $col === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Faltan parametros requeridos']);
    exit;
}

// Validar que el archivo esta en la lista permitida (evita path traversal)
if (!in_array($file, $ALLOWED_FILES, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Archivo no permitido']);
    exit;
}

// Validar nombre de campo: solo alfanumericos, guion, guion_bajo y punto
if (!preg_match('/^[a-zA-Z0-9_\-\.]+$/', $col)) {
    http_response_code(400);
    echo json_encode(['error' => 'Nombre de campo no valido']);
    exit;
}

$filePath = __DIR__ . DIRECTORY_SEPARATOR . $file;

if (!is_file($filePath)) {
    http_response_code(404);
    echo json_encode(['error' => 'Archivo no encontrado']);
    exit;
}

$raw = @file_get_contents($filePath);
if ($raw === false) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo leer el archivo']);
    exit;
}

$json = json_decode($raw, true);
if (!is_array($json)) {
    http_response_code(500);
    echo json_encode(['error' => 'JSON invalido en el archivo']);
    exit;
}

$found = false;
foreach ($json as &$row) {
    if (isset($row['ID']) && (string)$row['ID'] === $id) {
        $row[$col] = $value;
        $found = true;
        break;
    }
}
unset($row);

if (!$found) {
    http_response_code(404);
    echo json_encode(['error' => 'Registro no encontrado']);
    exit;
}

$output = json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
if ($output === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al serializar JSON']);
    exit;
}

$written = @file_put_contents($filePath, $output . "\n", LOCK_EX);
if ($written === false) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo guardar el archivo']);
    exit;
}

echo json_encode(['ok' => true]);
