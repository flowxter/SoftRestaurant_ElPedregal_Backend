import { Schema, model } from "mongoose";

/**
 * Contador de secuencias. Cada documento representa una secuencia con nombre
 * (su `_id`) y su valor actual (`seq`). Se usa para generar números de pedido
 * únicos y consecutivos de forma atómica.
 */
export interface CounterDocument {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDocument>({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter = model<CounterDocument>("Counter", counterSchema);

/**
 * Incrementa y devuelve el siguiente valor de la secuencia `name`.
 * El `$inc` con `upsert` es atómico, así que dos pedidos simultáneos nunca
 * obtienen el mismo número.
 */
export async function getNextSequence(name: string): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter!.seq;
}
