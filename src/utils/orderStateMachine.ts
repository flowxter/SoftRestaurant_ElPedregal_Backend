import { OrderStatus } from "../models/Order";
import { UserRole } from "../models/User";

export interface OrderTransition {
  to: OrderStatus;
  /** Roles autorizados a ejecutar esta transición. */
  roles: UserRole[];
  /** Si true, además del rol se exige ser el dueño del pedido. */
  ownerOnly?: boolean;
}

/**
 * Máquina de estados de los pedidos.
 * Para cada estado se listan las transiciones permitidas y quién puede hacerlas.
 * Los estados sin transiciones (ENTREGADO, CANCELADO) son terminales.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderTransition[]> = {
  PENDIENTE: [
    { to: "CONFIRMADO", roles: ["admin", "employee"] },
    { to: "CANCELADO", roles: ["admin", "employee", "user"], ownerOnly: true },
  ],
  CONFIRMADO: [
    { to: "EN_PREPARACION", roles: ["admin", "employee"] },
    { to: "CANCELADO", roles: ["admin", "employee"] },
  ],
  EN_PREPARACION: [
    { to: "ENTREGADO", roles: ["admin", "employee"] },
    { to: "CANCELADO", roles: ["admin"] },
  ],
  ENTREGADO: [],
  CANCELADO: [],
};

/** Devuelve los estados destino válidos desde un estado dado. */
export function allowedTargets(from: OrderStatus): OrderStatus[] {
  return ORDER_TRANSITIONS[from].map((t) => t.to);
}

/** Busca la definición de una transición concreta, o null si no existe. */
export function findTransition(
  from: OrderStatus,
  to: OrderStatus
): OrderTransition | null {
  return ORDER_TRANSITIONS[from].find((t) => t.to === to) ?? null;
}
