/**
 * EventBus — Sistema de eventos centralizado (Pub/Sub pattern)
 * 
 * Rol: Canal de comunicación desacoplado entre el motor de simulación
 * y la capa de UI (React). Ningún módulo del engine importa React;
 * todo se comunica mediante eventos.
 * 
 * Eventos principales:
 *   "pin-change"       → { pin, value: 0|1, mode, pwmValue?, brightness? }
 *   "pwm-change"       → { pin, value: 0-1023, brightness: 0.0-1.0 }
 *   "serial-log"       → { message: String, type: "info"|"warn"|"error" }
 *   "engine-state"     → { state: "running"|"stopped"|"paused"|"error" }
 *   "component-update" → { id: String, type: String, ...data }
 * 
 * Diseño: Singleton exportado para que todos los módulos compartan
 * la misma instancia. Preparado para ser reemplazado por WebSocket
 * cuando se escale a backend.
 */

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();

    /** @type {Array<{event: string, data: any, timestamp: number}>} */
    this._history = [];

    /** Máximo de eventos en el historial (evita memory leak) */
    this._maxHistory = 500;
  }

  /**
   * Suscribirse a un evento.
   * @param {string} event  Nombre del evento
   * @param {Function} callback  Función a ejecutar
   * @returns {Function} Función de desuscripción (cleanup)
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // Devuelve función de limpieza para useEffect de React
    return () => this.off(event, callback);
  }

  /**
   * Suscribirse a un evento solo una vez.
   * @param {string} event
   * @param {Function} callback
   */
  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Desuscribirse de un evento.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Emitir un evento a todos los suscriptores.
   * @param {string} event
   * @param {any} data
   */
  emit(event, data) {
    // Registrar en historial
    this._history.push({ event, data, timestamp: Date.now() });
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in listener for "${event}":`, error);
        }
      });
    }
  }

  /**
   * Eliminar todos los listeners (útil para reset completo).
   */
  removeAll() {
    this._listeners.clear();
  }

  /**
   * Obtener historial de eventos (útil para debugging).
   * @param {string} [eventFilter] Filtrar por nombre de evento
   * @returns {Array}
   */
  getHistory(eventFilter) {
    if (eventFilter) {
      return this._history.filter((entry) => entry.event === eventFilter);
    }
    return [...this._history];
  }

  /**
   * Limpiar historial.
   */
  clearHistory() {
    this._history = [];
  }
}

// Singleton: toda la app comparte la misma instancia
const eventBus = new EventBus();
export default eventBus;
