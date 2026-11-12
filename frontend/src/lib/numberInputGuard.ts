/**
 * Protege TODOS los <input type="number"> (actuales y futuros) contra cambios
 * accidentales de valor al hacer scroll con la rueda del mouse o con las
 * flechas arriba/abajo del teclado.
 *
 * Se registra una sola vez en el documento (delegación de eventos).
 */
export function installNumberInputGuard(): void {
  // Rueda del mouse: si el input numérico tiene foco, se le quita para que la
  // página haga scroll normal y el valor no cambie.
  document.addEventListener(
    'wheel',
    (e) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === 'number' && e.target === el) {
        el.blur();
      }
    },
    { passive: true },
  );

  // Flechas arriba/abajo no modifican el valor.
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (
      t instanceof HTMLInputElement &&
      t.type === 'number' &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown')
    ) {
      e.preventDefault();
    }
  });
}
