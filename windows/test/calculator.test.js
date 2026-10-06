// Tests de la calculadora natural (port de CalculatorEngine.swift).
// Ejecutar: node test/calculator.test.js
const assert = require('assert');
const Calc = require('../src/shared/calculator');

const fmt = s => { const v = Calc.evaluate(s); return v === null ? null : Calc.format(v); };

// [entrada, resultado formateado esperado (null = no interpretable)]
const CASES = [
  // Ejemplos del README
  ['1.500.000 + 19%', '1.785.000'],
  ['2.380.000 - iva', '2.000.000'],
  ['2.380.000 sin iva', '2.000.000'],
  ['iva de 100.000', '19.000'],
  ['20% de 250.000', '50.000'],
  ['(2+3)*4', '20'],
  ['$1.500.000', '1.500.000'],
  ['1.500.000 cop', '1.500.000'],
  ['1.500.000 pesos', '1.500.000'],
  ['$ 100.000 + iva', '119.000'],
  ['1.500.000', '1.500.000'],
  // Números colombianos
  ['1.500', '1.500'],
  ['1,5', '1,5'],
  ['1.5', '1,5'],
  ['1.500,50', '1.500,5'],
  ['1,500.50', '1.500,5'],
  ['1.500.000,25 * 2', '3.000.000,5'],
  ['0,1 + 0,2', '0,3'],
  ['1.5.5', null],
  ['1,,5', null],
  ['1..5', null],
  ['100.', null], // igual que Swift: el '.' final queda como carácter desconocido
  ['1.000.', null],
  ['12.34', '12,34'],
  ['1234.5678', '1.234,57'],
  // Operadores y palabras
  ['2 x 3', '6'],
  ['2 por 3', '6'],
  ['10 mas 5', '15'],
  ['10 más 5', '15'],
  ['10 menos 5', '5'],
  ['10 × 3 ÷ 2', '15'],
  ['10 − 4', '6'],
  ['-5 + 2', '-3'],
  ['--5', '5'],
  ['50%', '0,5'],
  ['100 + 10%', '110'],
  ['100 - 10%', '90'],
  ['100 + 10% de 50', '105'],
  ['100 + iva', '119'],
  ['119 - iva', '100'],
  ['119 sin iva', '100'],
  ['(100 + 19) sin iva', '100'],
  ['iva de 100 + 1', '19,19'],
  ['IVA DE 100', '19'],
  ['  7  ', '7'],
  // Casos inválidos
  ['', null],
  ['hola', null],
  ['1 / 0', null],
  ['(1 + 2', null],
  ['1 +', null],
  ['sin iva', null],
  ['100 sin', null],
  ['copia 5', null],
  ['5 # 3', null],
  ['iva 100', null],
  // Formato
  ['1/3', '0,33'],
  ['2/3', '0,67'],
  ['-1/3', '-0,33'],
  ['0,005', '0,01'],
  ['-0,001', '0'],
  ['1000000000000', '1.000.000.000.000'],
  ['999,999', '1.000']
];

let failures = 0;
for (const [input, expected] of CASES) {
  const got = fmt(input);
  try { assert.strictEqual(got, expected); console.log(`  ok  ${JSON.stringify(input)} → ${got}`); }
  catch { failures++; console.error(`FAIL  ${JSON.stringify(input)} → ${got} (esperado ${expected})`); }
}

// Diferencial contra el motor Swift original (solo si se pasa la ruta del binario de referencia)
const refBin = process.env.CLIPPY_SWIFT_CALC;
if (refBin) {
  const { execFileSync } = require('child_process');
  const extra = ['1.500.000 + 19% + iva', '20% de 100 + 5', '2 * -3', '(1.000 + 500) * 2 sin iva', '1,5,5', '1.234,5.6', '3 %', '5 % de (10 + 10)', 'iva de iva de 100', '100 - 20% - 10%', '1.000,', '0.001', '1.0000', '12.345.67', '½', '1²', '٣', '1e5', 'cop5', 'peso', '((((2))))', ')(', '100 + 10% * 2', '-(-(3))', '10 / 4', '1.999,995', '0,125', '7 sin iva sin iva', '1 + 1 sin iva'];
  const inputs = [...CASES.map(c => c[0]), ...extra];
  const out = execFileSync(refBin, { input: inputs.join('\n') + '\n', encoding: 'utf8' }).split('\n');
  inputs.forEach((input, i) => {
    const swift = out[i] === 'nil' ? null : out[i];
    if (swift !== fmt(input)) { failures++; console.error(`DIFF  ${JSON.stringify(input)}: swift=${swift} js=${fmt(input)}`); }
  });
  console.log(`Diferencial Swift vs JS: ${inputs.length} entradas comparadas`);
}

if (failures) { console.error(`\n${failures} fallo(s)`); process.exit(1); }
console.log(`\nTodos los tests de la calculadora pasaron (${CASES.length} casos).`);
