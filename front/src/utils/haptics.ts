/**
 * Vibração do celular para avisar sem tirar o olho da mesa. Não funciona no
 * iPhone (o Safari não expõe a API): lá o aviso é só visual.
 */
export function buzz(pattern: number | number[] = 200) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    /* sem suporte ou bloqueado: o aviso visual cobre */
  }
}
