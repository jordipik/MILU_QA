<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$dataFile = __DIR__ . DIRECTORY_SEPARATOR . 'qa_revision_server_data.json';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'GET') {
    if (!is_file($dataFile)) {
        echo json_encode([
            'meta' => [
                'source' => 'qa_revision_sync.php',
                'version' => 2,
                'rows' => 0
            ],
            'revisions' => [
                'v' => 2,
                'r' => [],
                'k' => new stdClass()
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $raw = @file_get_contents($dataFile);
    if ($raw === false || trim($raw) === '') {
        echo json_encode([
            'meta' => [
                'source' => 'qa_revision_sync.php',
                'version' => 2,
                'rows' => 0
            ],
            'revisions' => [
                'v' => 2,
                'r' => [],
                'k' => new stdClass()
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'El JSON almacenado es invalido.']);
        exit;
    }

    echo json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Metodo no permitido.']);
    exit;
}

$rawInput = file_get_contents('php://input');
$decodedInput = json_decode($rawInput ?? '', true);
if (!is_array($decodedInput)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'JSON no valido.']);
    exit;
}

$revisions = $decodedInput['revisions'] ?? null;
if (!is_array($revisions)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Falta objeto revisions.']);
    exit;
}

$version = isset($revisions['v']) ? (int)$revisions['v'] : 2;
$rows = [];
$legacy = [];

if (!empty($revisions['r']) && is_array($revisions['r'])) {
    foreach ($revisions['r'] as $entry) {
        if (!is_array($entry) || count($entry) < 3) {
            continue;
        }

        $idx = (int)$entry[0];
        if ($idx <= 0) {
            continue;
        }

        $estado = trim((string)($entry[1] ?? ''));
        $accion = trim((string)($entry[2] ?? ''));
        if ($estado === '' && $accion === '') {
            continue;
        }

        $rows[] = [$idx, $estado, $accion];
    }
}

if (!empty($revisions['k']) && is_array($revisions['k'])) {
    foreach ($revisions['k'] as $key => $value) {
        if (!is_array($value)) {
            continue;
        }

        $estado = trim((string)($value['estado'] ?? ''));
        $accion = trim((string)($value['accion'] ?? ''));
        if ($estado === '' && $accion === '') {
            continue;
        }

        $legacy[(string)$key] = [
            'estado' => $estado,
            'accion' => $accion,
            'updated_at' => ''
        ];
    }
}

usort($rows, static function (array $a, array $b): int {
    return $a[0] <=> $b[0];
});

$payload = [
    'meta' => [
        'updated_at' => gmdate('c'),
        'source' => 'qa_revision_sync.php',
        'version' => 2,
        'rows' => count($rows) + count($legacy)
    ],
    'revisions' => [
        'v' => $version,
        'r' => $rows,
        'k' => $legacy
    ]
];

$tmpFile = $dataFile . '.tmp';
$encoded = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encoded === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo serializar el JSON.']);
    exit;
}

$writeOk = @file_put_contents($tmpFile, $encoded . PHP_EOL, LOCK_EX);
if ($writeOk === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo escribir archivo temporal.']);
    exit;
}

if (!@rename($tmpFile, $dataFile)) {
    @unlink($tmpFile);
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo actualizar el archivo de revisiones.']);
    exit;
}

echo json_encode([
    'ok' => true,
    'saved_rows' => count($rows) + count($legacy)
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
