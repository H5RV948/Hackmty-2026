/**
 * Elegibilidad y riesgo. Reglas duras, no juicio del modelo.
 *
 * Por que vive aqui y no en el prompt: "¿este cliente califica?" tiene una
 * respuesta verificable —ingreso minimo, rango de edad, tipo de persona— y un
 * banco no puede contestarla distinto cada vez que el modelo tiene un mal dia.
 * El LLM decide QUE mostrar y como explicarlo; esta capa decide QUIEN califica.
 *
 * Los requisitos salen de `catalogo_tarjetas.csv`, que trae la columna `edad` en
 * texto libre con trece formatos distintos ("18 a 69 años 11 meses", "18+",
 * "Mayor de edad; sujeto a evaluación"...). De ahi el parser de abajo.
 */
import type { Cliente, ProductoTarjeta } from "./data.js";

/* ------------------------------------------------------------------ */
/* Requisito de edad                                                   */
/* ------------------------------------------------------------------ */

export type RangoEdad = { min: number | null; max: number | null };

/**
 * Interpreta la columna `edad` del catalogo.
 *
 * Ante un texto que no reconoce devuelve un rango abierto en vez de inventar
 * uno: preferimos mostrar un producto de mas y que el usuario lo descarte, a
 * esconderle algo a lo que si tenia derecho por un formato que no previmos.
 */
export function parseRangoEdad(texto: string): RangoEdad {
  const t = (texto || "").toLowerCase();
  if (!t) return { min: null, max: null };

  // "PF: criterios del producto; página histórica indica 30-65" — el propio
  // dato se declara historico, asi que no se aplica como requisito vigente.
  if (t.includes("histórica") || t.includes("historica")) return { min: null, max: null };

  const rango = t.match(/(\d{1,2})\s*a\s*(\d{1,3})\s*años/);
  if (rango) return { min: Number(rango[1]), max: Number(rango[2]) };

  const menor = t.match(/menor de\s*(\d{1,2})/);
  if (menor) return { min: null, max: Number(menor[1]) - 1 };

  const masDe = t.match(/(\d{1,2})\s*\+/);
  if (masDe) return { min: Number(masDe[1]), max: null };

  // Ojo con el orden: "menor de edad" ya se fue arriba.
  if (t.includes("mayor de edad")) return { min: 18, max: null };

  return { min: null, max: null };
}

/* ------------------------------------------------------------------ */
/* Tipo de persona                                                     */
/* ------------------------------------------------------------------ */

/**
 * El catalogo escribe el tipo como "Persona Física / PFAE" y el CSV de
 * clientes como "Persona Física". Se comparan por familia, no por cadena.
 */
export function aceptaTipoCliente(producto: ProductoTarjeta, cliente: Cliente): boolean {
  const acepta = (producto.tipoCliente || "").toLowerCase();
  const tiene = (cliente.tipoCliente || "").toLowerCase();
  if (!acepta) return true;

  const esFisica = tiene.startsWith("persona f");
  const esMoral = tiene.includes("moral");
  const esPfae = tiene.includes("pfae");

  if (esMoral) return acepta.includes("moral") || acepta.includes("corporativo");
  if (esPfae) return acepta.includes("pfae");
  if (esFisica) {
    // "Persona Física (menor)" es un producto aparte, no para adultos.
    if (acepta.includes("menor")) return (cliente.edad ?? 99) < 18;
    return acepta.includes("persona física") || acepta.includes("persona fisica");
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Afinidad de segmento                                                */
/* ------------------------------------------------------------------ */

/**
 * Productos dirigidos a un publico concreto (hoy solo "Mujer Banorte").
 *
 * Deliberadamente NO es un filtro de elegibilidad: es afinidad, y solo suma
 * puntos. Banorte no le niega la tarjeta Mujer a nadie por su sexo, y codificar
 * un rechazo por genero dentro de un sistema bancario es justo el tipo de regla
 * que no queremos escribir. El efecto practico es el que se pidio —a una
 * clienta le sale arriba— sin convertirlo en una negativa para nadie mas.
 */
export function afinidadSegmento(producto: ProductoTarjeta, cliente: Cliente): number {
  const nombre = `${producto.producto} ${producto.segmento}`.toLowerCase();
  const sexo = (cliente.sexo || "").toLowerCase();

  if (nombre.includes("mujer")) return sexo.startsWith("femenino") ? 18 : -12;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Elegibilidad                                                        */
/* ------------------------------------------------------------------ */

export type Elegibilidad = {
  producto: string;
  elegible: boolean;
  /** Requisitos que el cliente NO cumple. Vacio si es elegible. */
  bloqueos: string[];
  /** Requisitos verificados que si cumple, para poder explicarlo. */
  cumple: string[];
};

export function evaluarElegibilidad(cliente: Cliente, producto: ProductoTarjeta): Elegibilidad {
  const bloqueos: string[] = [];
  const cumple: string[] = [];

  if (!aceptaTipoCliente(producto, cliente)) {
    bloqueos.push(`Es para ${producto.tipoCliente} y el cliente es ${cliente.tipoCliente}.`);
  } else if (producto.tipoCliente) {
    cumple.push(`Tipo de cliente: ${producto.tipoCliente}.`);
  }

  if (producto.ingresoMinimo !== null) {
    const ingreso = cliente.ingresoMensual ?? 0;
    if (ingreso < producto.ingresoMinimo) {
      bloqueos.push(
        `Pide ingreso minimo de $${producto.ingresoMinimo.toLocaleString("es-MX")} y el cliente reporta $${ingreso.toLocaleString("es-MX")}.`,
      );
    } else {
      cumple.push(`Ingreso minimo $${producto.ingresoMinimo.toLocaleString("es-MX")}: lo cubre.`);
    }
  }

  const rango = parseRangoEdad(producto.edadRequisito);
  if (cliente.edad !== null && (rango.min !== null || rango.max !== null)) {
    const bajo = rango.min !== null && cliente.edad < rango.min;
    const alto = rango.max !== null && cliente.edad > rango.max;
    if (bajo || alto) {
      bloqueos.push(
        `El rango de edad es ${rango.min ?? "sin minimo"} a ${rango.max ?? "sin maximo"} y el cliente tiene ${cliente.edad}.`,
      );
    } else {
      cumple.push(`Edad ${cliente.edad} dentro del rango del producto.`);
    }
  }

  return { producto: producto.producto, elegible: bloqueos.length === 0, bloqueos, cumple };
}

/* ------------------------------------------------------------------ */
/* Puntaje                                                             */
/* ------------------------------------------------------------------ */

/**
 * Que tan bien le queda un producto a este cliente, de 0 a 100.
 *
 * Es un criterio del equipo, no un dato del banco, y por eso el desglose viaja
 * con el puntaje: cualquiera puede ver por que una quedo arriba. Penaliza CAT y
 * anualidad —lo que le cuesta a la persona— y premia holgura de ingreso y
 * afinidad de segmento.
 */
export type Puntuacion = { puntaje: number; factores: string[] };

export function puntuar(cliente: Cliente, producto: ProductoTarjeta): Puntuacion {
  const factores: string[] = [];
  let puntaje = 55;

  if (producto.catPromedio !== null) {
    // El CAT del catalogo va de ~60% a ~130%. Menos CAT, mas puntos.
    const ajuste = Math.round(Math.max(-20, Math.min(20, (100 - producto.catPromedio) / 2)));
    puntaje += ajuste;
    factores.push(`CAT ${producto.catPromedio}% (${ajuste >= 0 ? "+" : ""}${ajuste})`);
  }

  if (producto.comisionAnual !== null) {
    const ajuste =
      producto.comisionAnual === 0 ? 12 : -Math.min(15, Math.round(producto.comisionAnual / 200));
    puntaje += ajuste;
    factores.push(
      `Anualidad $${producto.comisionAnual.toLocaleString("es-MX")} (${ajuste >= 0 ? "+" : ""}${ajuste})`,
    );
  }

  if (producto.ingresoMinimo !== null && cliente.ingresoMensual) {
    // Holgura: cuantas veces cubre el ingreso minimo. Premia que no vaya
    // justo, porque ir al limite del requisito es donde se cae una solicitud.
    const veces = cliente.ingresoMensual / producto.ingresoMinimo;
    const ajuste = Math.round(Math.max(-5, Math.min(12, (veces - 1) * 6)));
    puntaje += ajuste;
    factores.push(`Cubre ${veces.toFixed(1)}x el ingreso minimo (${ajuste >= 0 ? "+" : ""}${ajuste})`);
  }

  const afin = afinidadSegmento(producto, cliente);
  if (afin !== 0) {
    puntaje += afin;
    factores.push(`Afinidad de segmento (${afin > 0 ? "+" : ""}${afin})`);
  }

  return { puntaje: Math.max(0, Math.min(100, puntaje)), factores };
}

/* ------------------------------------------------------------------ */
/* Riesgo de endeudamiento                                             */
/* ------------------------------------------------------------------ */

export type AlertaDeuda = {
  nivel: "ok" | "precaucion" | "alto";
  titulo: string;
  mensaje: string;
  /** Cifras concretas que sostienen la alerta. */
  senales: string[];
  /** Si es true, la UI no debe empujar contratacion. */
  desaconsejaNuevoCredito: boolean;
};

/**
 * Decide si a esta persona hay que decirle que NO saque mas credito.
 *
 * Tambien es regla dura por la misma razon que la elegibilidad: es la parte de
 * la pantalla donde el banco asume una responsabilidad, y no puede depender de
 * que el modelo se sienta prudente ese dia. Cada senial que se muestra es una
 * cifra del perfil, nunca una interpretacion.
 */
export function evaluarRiesgoDeuda(cliente: Cliente): AlertaDeuda {
  const senales: string[] = [];
  let gravedad = 0;

  const uso = cliente.usoLimitePct;
  if (uso !== null && uso >= 80) {
    gravedad += uso >= 90 ? 2 : 1;
    senales.push(`Usa el ${uso}% de su linea de credito.`);
  }

  if ((cliente.nivelEndeudamiento || "").toLowerCase() === "alto") {
    gravedad += 2;
    senales.push("Su nivel de endeudamiento esta clasificado como alto.");
  }

  if ((cliente.nivelRiesgoCrediticio || "").toLowerCase() === "alto") {
    gravedad += 1;
    senales.push("Su nivel de riesgo crediticio esta clasificado como alto.");
  }

  if (cliente.tieneCreditosVencidos) {
    gravedad += 2;
    senales.push("Tiene creditos vencidos.");
  }

  const atrasos = cliente.pagosAtrasados12m ?? 0;
  if (atrasos >= 3) {
    gravedad += 2;
    senales.push(`Acumula ${atrasos} pagos atrasados en los ultimos 12 meses.`);
  } else if (atrasos > 0) {
    gravedad += 1;
    senales.push(`Tuvo ${atrasos} pago(s) atrasado(s) en los ultimos 12 meses.`);
  }

  if ((cliente.clasificacionCrediticia || "").toLowerCase() === "baja") {
    gravedad += 1;
    senales.push("Su clasificacion crediticia es baja.");
  }

  if (gravedad >= 4) {
    return {
      nivel: "alto",
      titulo: "Antes de pedir otra tarjeta, conviene bajar lo que ya debes",
      mensaje:
        "Con tu situacion actual, sumar una linea nueva encarece el problema en vez de resolverlo. Lo que mas te ayuda hoy es ordenar la deuda que ya tienes.",
      senales,
      desaconsejaNuevoCredito: true,
    };
  }

  if (gravedad >= 2) {
    return {
      nivel: "precaucion",
      titulo: "Puedes pedirla, pero vale la pena verlo con calma",
      mensaje:
        "Calificas para varios productos, aunque tu nivel de deuda ya pesa. Si contratas, que sea por un beneficio concreto y no por la linea extra.",
      senales,
      desaconsejaNuevoCredito: false,
    };
  }

  return {
    nivel: "ok",
    titulo: "Tu situacion da espacio para una tarjeta nueva",
    mensaje: "Tus indicadores de deuda estan en rango.",
    senales,
    desaconsejaNuevoCredito: false,
  };
}
