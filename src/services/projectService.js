/**
 * ProjectService — Servicio de gestión de proyectos
 *
 * Rol: Maneja la persistencia de proyectos del simulador.
 * Funcionalidades:
 *   - Guardar/cargar proyectos en localStorage
 *   - Exportar como archivo .ino
 *   - Importar archivos .ino
 *   - Historial básico de versiones (últimas N versiones)
 *   - Guardado automático (autosave)
 *
 * Diseño: Preparado para migrar a backend REST/GraphQL.
 * Todas las operaciones son async para facilitar esa transición.
 */

const STORAGE_KEY = "esp8266_simulator_projects";
const CURRENT_PROJECT_KEY = "esp8266_simulator_current";
const HISTORY_KEY = "esp8266_simulator_history";
const MAX_HISTORY = 20;

class ProjectService {
  constructor() {
    /** Timer de autosave */
    this._autosaveTimer = null;

    /** Intervalo de autosave en ms */
    this._autosaveInterval = 30000; // 30 segundos
  }

  // ── Proyecto actual ──────────────────────────────────────────────

  /**
   * Guarda el proyecto actual.
   * @param {{name: string, code: string, components: Array}} project
   * @returns {Promise<{success: boolean, savedAt: string}>}
   */
  async saveProject(project) {
    try {
      const projectData = {
        ...project,
        id: project.id || this._generateId(),
        savedAt: new Date().toISOString(),
        version: (project.version || 0) + 1,
      };

      // Guardar como proyecto actual
      localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(projectData));

      // Guardar en lista de proyectos
      const projects = await this.listProjects();
      const index = projects.findIndex((p) => p.id === projectData.id);
      if (index >= 0) {
        projects[index] = projectData;
      } else {
        projects.push(projectData);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));

      // Agregar al historial
      await this._addToHistory(projectData);

      return { success: true, savedAt: projectData.savedAt };
    } catch (error) {
      console.error("[ProjectService] Error saving:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Carga el último proyecto abierto.
   * @returns {Promise<object|null>}
   */
  async loadCurrentProject() {
    try {
      const data = localStorage.getItem(CURRENT_PROJECT_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("[ProjectService] Error loading current:", error);
      return null;
    }
  }

  /**
   * Lista todos los proyectos guardados.
   * @returns {Promise<Array>}
   */
  async listProjects() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("[ProjectService] Error listing:", error);
      return [];
    }
  }

  /**
   * Carga un proyecto por ID.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async loadProject(id) {
    const projects = await this.listProjects();
    return projects.find((p) => p.id === id) || null;
  }

  /**
   * Elimina un proyecto por ID.
   * @param {string} id
   */
  async deleteProject(id) {
    const projects = await this.listProjects();
    const filtered = projects.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  // ── Exportar / Importar ──────────────────────────────────────────

  /**
   * Exporta el código como archivo .ino descargable.
   * @param {string} filename  Nombre del archivo (sin extensión)
   * @param {string} code  Código Arduino
   */
  exportAsIno(filename, code) {
    const header = `/**
 * ${filename}.ino
 * Generado por ESP8266 Simulator
 * Fecha: ${new Date().toLocaleDateString()}
 */\n\n`;

    const blob = new Blob([header + code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.ino`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Importa un archivo .ino seleccionado por el usuario.
   * @returns {Promise<{name: string, code: string}|null>}
   */
  async importIno() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".ino,.cpp,.c,.h,.txt";

      input.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) {
          resolve(null);
          return;
        }

        try {
          const code = await file.text();
          const name = file.name.replace(/\.\w+$/, "");
          resolve({ name, code });
        } catch (error) {
          console.error("[ProjectService] Error importing:", error);
          resolve(null);
        }
      };

      input.click();
    });
  }

  // ── Historial ────────────────────────────────────────────────────

  /**
   * Obtiene el historial de versiones del proyecto actual.
   * @param {string} projectId
   * @returns {Promise<Array>}
   */
  async getHistory(projectId) {
    try {
      const data = localStorage.getItem(`${HISTORY_KEY}_${projectId}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * Agrega una entrada al historial.
   * @param {object} projectData
   */
  async _addToHistory(projectData) {
    const key = `${HISTORY_KEY}_${projectData.id}`;
    const history = await this.getHistory(projectData.id);

    history.unshift({
      version: projectData.version,
      code: projectData.code,
      savedAt: projectData.savedAt,
    });

    // Limitar tamaño del historial
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }

    localStorage.setItem(key, JSON.stringify(history));
  }

  // ── Autosave ─────────────────────────────────────────────────────

  /**
   * Inicia el guardado automático.
   * @param {Function} getProjectData  Función que retorna los datos actuales
   * @param {Function} onSaved  Callback cuando se guarda
   */
  startAutosave(getProjectData, onSaved) {
    this.stopAutosave();

    this._autosaveTimer = setInterval(async () => {
      const data = getProjectData();
      if (data) {
        const result = await this.saveProject(data);
        if (result.success && onSaved) {
          onSaved(result.savedAt);
        }
      }
    }, this._autosaveInterval);
  }

  /**
   * Detiene el guardado automático.
   */
  stopAutosave() {
    if (this._autosaveTimer) {
      clearInterval(this._autosaveTimer);
      this._autosaveTimer = null;
    }
  }

  // ── Utilidades ───────────────────────────────────────────────────

  /**
   * Genera un ID único para proyectos.
   * @returns {string}
   */
  _generateId() {
    return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton
const projectService = new ProjectService();
export default projectService;
