#!/usr/bin/env python3
"""
Genera historial_mensual_sintetico.csv: ocho meses (enero a agosto de 2026) por
cliente, para las graficas de tendencia del asesor.

Reglas que este generador respeta, y por que:

- AGOSTO CUADRA AL PESO con clientes_sintetico_con_nombres.csv. Ingreso,
  gastos, capacidad de ahorro, saldo de tarjeta, uso de linea y score de agosto
  son exactamente los del perfil. Si no, el titular diria "tu saldo es $16,525"
  y la grafica de al lado terminaria en otra cifra.
- Las tendencias salen del perfil, no del azar puro. Quien usa mas del 80% de
  su linea viene endeudandose; quien acumula atrasos viene bajando de score;
  quien paga puntual y usa poco su linea viene subiendo.
- Es REPRODUCIBLE. El azar se siembra con el id del cliente: correrlo dos veces
  da el mismo CSV byte por byte, y el historial de CLI131 no cambia entre
  demos.
- Es SINTETICO (AGENTS.md, regla 6). Ningun dato es de una persona real.

Uso:  python3 apps/mcp/seed/generar_historial.py
"""
import csv
import math
import random
from pathlib import Path

AQUI = Path(__file__).parent
MESES = [
    ("2026-01", "Ene"), ("2026-02", "Feb"), ("2026-03", "Mar"), ("2026-04", "Abr"),
    ("2026-05", "May"), ("2026-06", "Jun"), ("2026-07", "Jul"), ("2026-08", "Ago"),
]


def num(valor):
    try:
        x = float(valor)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def historial_de(c):
    rnd = random.Random(f"historial-{c['cliente_id']}")
    n = len(MESES)

    ingreso = num(c["ingreso_mensual_mxn"]) or num(c["ventas_mensuales_mxn"]) or 0.0
    gastos = num(c["gastos_mensuales_mxn"]) or 0.0
    ahorro = num(c["capacidad_ahorro_mensual_mxn"]) or 0.0
    saldo_cuenta = num(c["saldo_promedio_cuenta_mxn"]) or 0.0
    saldo_tdc = num(c["saldo_tarjeta_credito_mxn"]) or 0.0
    limite = num(c["limite_credito_mxn"]) or 0.0
    uso = num(c["porcentaje_uso_limite_credito"]) or 0.0
    score = num(c["score_crediticio"]) or 600.0
    atrasos12 = int(num(c["pagos_atrasados_ultimos_12_meses"]) or 0)

    # En las personas fisicas el seed cumple ingreso - gastos = ahorro. Se
    # conserva mes a mes para que el area de cashflow y el ahorro digan lo mismo.
    cuadra = abs(ingreso - gastos - ahorro) < 2

    ingresos = [ingreso * (1 + rnd.uniform(-0.03, 0.03)) for _ in range(n)]
    gastos_m = [gastos * (1 + rnd.uniform(-0.09, 0.09)) for _ in range(n)]
    ingresos[-1], gastos_m[-1] = ingreso, gastos
    if cuadra:
        ahorros = [i - g for i, g in zip(ingresos, gastos_m)]
    else:
        ahorros = [ahorro * (1 + rnd.uniform(-0.12, 0.12)) for _ in range(n)]
    ahorros[-1] = ahorro

    # Ahorro acumulado. Agosto = saldo promedio de su cuenta.
    #
    # El crecimiento de enero a agosto se decide POR CLIENTE, segun que parte
    # de su ingreso le queda libre: quien ahorra mucho crecio mucho, quien vive
    # al dia casi no, y quien gasta mas de lo que gana vio bajar su colchon.
    #
    # Una version anterior fijaba un piso de 35% para enero. Casi todos los
    # clientes chocaban con el piso y todos salian con el mismo "crecio 186%":
    # la grafica de tendencia decia lo mismo de cualquier persona.
    tasa_libre = (ahorro / ingreso) if ingreso > 0 else 0.0
    if tasa_libre <= 0:
        crecimiento = rnd.uniform(-0.25, -0.02)
    else:
        crecimiento = min(0.9, tasa_libre * rnd.uniform(1.2, 3.2)) + rnd.uniform(-0.04, 0.04)
    inicio = saldo_cuenta / (1 + crecimiento) if saldo_cuenta > 0 else 0.0

    # El camino entre enero y agosto sigue el ahorro de cada mes: los meses con
    # mas ahorro suben mas. Si el total baja, se reparte la caida parejo.
    delta = saldo_cuenta - inicio
    pesos = [max(0.0, a) for a in ahorros[1:]]
    if delta < 0 or sum(pesos) == 0:
        pesos = [1.0] * (n - 1)
    total_pesos = sum(pesos)
    acumulado = [inicio]
    for peso in pesos:
        acumulado.append(max(0.0, acumulado[-1] + delta * peso / total_pesos))
    acumulado[-1] = saldo_cuenta

    # Saldo de tarjeta hacia atras desde agosto.
    tendencia = 0.045 if uso >= 80 else (-0.02 if uso < 30 else 0.0)
    saldos = [0.0] * n
    saldos[-1] = saldo_tdc
    for i in range(n - 2, -1, -1):
        if limite <= 0:
            continue
        base = saldos[i + 1] if saldos[i + 1] > 0 else limite * rnd.uniform(0, 0.08)
        saldos[i] = min(limite, max(0.0, base * (1 - tendencia) * (1 + rnd.uniform(-0.06, 0.06))))

    # El uso del seed no siempre es saldo/limite exacto; se conserva su proporcion.
    factor = uso / (saldo_tdc / limite * 100) if saldo_tdc > 0 and limite > 0 else 1.0
    usos = [min(100.0, s / limite * 100 * factor) if limite > 0 else 0.0 for s in saldos]
    usos[-1] = uso

    # Atrasos: la parte proporcional de los ultimos 12 meses que cae en estos 8.
    # Con 3 o mas, se cargan hacia los meses recientes: el problema es actual.
    atrasos = [0] * n
    for _ in range(round(atrasos12 * n / 12)):
        pesos = [1 + (i if atrasos12 >= 3 else 0) for i in range(n)]
        atrasos[rnd.choices(range(n), weights=pesos)[0]] += 1

    # Score hacia atras. `paso` es cuanto MAS ALTO estaba el mes anterior.
    scores = [0.0] * n
    scores[-1] = score
    for i in range(n - 2, -1, -1):
        if atrasos12 >= 3:
            paso = rnd.uniform(0, 9)
        elif atrasos12 == 0 and uso < 50:
            paso = -rnd.uniform(0, 7)
        else:
            paso = rnd.uniform(-4, 4)
        if atrasos[i + 1]:
            paso += 12  # un atraso en el mes siguiente lo tumbo
        scores[i] = min(850.0, max(300.0, scores[i + 1] + paso))

    return [
        {
            "cliente_id": c["cliente_id"],
            "mes": mes,
            "etiqueta": etiqueta,
            "ingreso_mxn": round(ingresos[i]),
            "gastos_mxn": round(gastos_m[i]),
            "ahorro_mxn": round(ahorros[i]),
            "ahorro_acumulado_mxn": round(acumulado[i]),
            "saldo_tarjeta_mxn": round(saldos[i]),
            "uso_limite_pct": round(usos[i], 1),
            "score_crediticio": round(scores[i]),
            "pagos_atrasados": atrasos[i],
        }
        for i, (mes, etiqueta) in enumerate(MESES)
    ]


def main():
    with open(AQUI / "clientes_sintetico_con_nombres.csv", encoding="utf-8") as f:
        clientes = list(csv.DictReader(f))
    filas = [fila for c in clientes for fila in historial_de(c)]
    destino = AQUI / "historial_mensual_sintetico.csv"
    with open(destino, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)
    print(f"{destino.name}: {len(filas)} filas de {len(clientes)} clientes")


if __name__ == "__main__":
    main()
