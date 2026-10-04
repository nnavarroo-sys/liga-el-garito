# Liga El Garito · Ranking y torneos

Página de la Liga de Pádel El Garito, Temporada Clausura 2026: ranking individual, fechas con su torneo, jugadores y estadísticas.

- Los jugadores la abren desde el enlace, sin instalar nada y sin cuenta.
- El organizador entra con un PIN y arma el torneo de cada fecha desde la misma página: registro de parejas, tómbola, grupos, canchas, resultados partido a partido, copas y cierre de la fecha.
- Todo se guarda solo en una planilla de Google. Los jugadores ven los cambios sin que haya que subir nada a GitHub.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | La página, publicada con GitHub Pages. Trae una copia de los datos para mostrarse al instante. |
| `config.js` | La dirección del servidor. Aquí va la URL de Apps Script. |
| `logo.png` | El logo de la liga. |
| `Codigo.gs` | El servidor, que corre en Google Apps Script. Este archivo es solo una copia de referencia: el que funciona es el que pegas en Apps Script. |

## 1. Instalar el servidor en Google (unos 5 minutos)

Es un proyecto aparte del de Inscripción, con su propia planilla. Así uno no afecta al otro.

1. Abre [script.google.com](https://script.google.com) con tu cuenta de Google y toca **Nuevo proyecto**. Ponle de nombre *Liga El Garito*.
2. Borra lo que aparece en `Código.gs` y pega todo el contenido de `Codigo.gs`.
3. Cambia esta línea por un PIN que solo conozcas tú:
   ```js
   const PIN_ORGANIZADOR = 'CAMBIA-ESTE-PIN';
   ```
   Cambia el PIN solo en el editor de Apps Script. No lo subas a GitHub.
4. Guarda el proyecto. En la barra de arriba, elige la función **setup** y toca **Ejecutar**.
   - Google te pedirá permisos. Toca *Revisar permisos*, elige tu cuenta, entra a *Configuración avanzada*, toca *Ir a Liga El Garito* y luego *Permitir*.
   - Esto crea en tu Drive la planilla **Liga El Garito · Datos**. El enlace aparece en el registro de ejecución. La planilla queda vacía hasta que entres como organizador (paso 3).
5. Toca **Implementar → Nueva implementación** y elige el tipo **Aplicación web**. Configúrala así:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
6. Toca **Implementar** y copia la URL de la aplicación web. Termina en `/exec`.

> Si usas una cuenta de trabajo y no aparece la opción *Cualquier usuario*, tu empresa no permite publicar aplicaciones abiertas. En ese caso, haz estos mismos pasos con una cuenta personal de Gmail.

## 2. Conectar la página

1. En GitHub, abre `config.js` y toca el lápiz para editarlo.
2. Pega la URL de Apps Script entre las comillas:
   ```js
   window.LIGA_API = 'https://script.google.com/macros/s/…/exec';
   ```
3. Toca **Commit changes**. Uno o dos minutos después, la página queda conectada en:
   **https://nnavarroo-sys.github.io/liga-el-garito/**

Mientras `config.js` esté vacío, la página muestra la copia de datos que trae `index.html` y no tiene modo organizador.

## 3. Primera vez como organizador

1. Abre la página y baja hasta el final.
2. Toca **Soy el organizador**, escribe tu PIN y toca **Entrar**.
3. La primera vez, la página sube sola a Google los datos de la liga: jugadores, las 9 fechas jugadas y el calendario. Aparece el aviso *Listo: la liga quedó guardada en Google*.

Ese teléfono queda en modo organizador hasta que toques *Salir del modo organizador*. Puedes entrar desde más de un teléfono.

## 4. Armar el torneo de cada fecha

1. Entra a **Fechas** y elige la fecha.
2. Elige la categoría y el formato (12 parejas, o 16 en las fechas especiales) y toca **Armar torneo**.
3. **Registro:** elige los dos jugadores de cada pareja. Si falta alguien en la lista, escríbelo en *¿Jugador nuevo?* y toca *Agregar*.
4. Toca **Sortear tómbola**. Si la tómbola se hizo en el club, elige el número de cada pareja. Los grupos, los partidos y las canchas se arman solos.
5. **Resultados:** carga los games de cada partido, ronda por ronda. Si empatan, aparece el tie-break. Las tablas, la clasificación a copas y los cruces se actualizan solos.
6. **Final:** revisa la clasificación y toca **Cerrar fecha y sumar al ranking**. Si hay que corregir algo, puedes reabrirla.

Mientras tanto:

- **Guardado:** cada cambio se guarda solo a los pocos segundos. Abajo a la derecha se ve *Guardando…* y luego *Guardado ✓*.
- **Sin señal:** los cambios quedan en el teléfono y se guardan solos cuando vuelve la conexión. Si cierras la página antes, se recuperan al abrirla de nuevo.
- **Jugadores:** ven los resultados sin recargar, cada 30 segundos mientras hay una fecha en juego. El resto del tiempo, cada 5 minutos o al abrir la página.
- **Dos organizadores a la vez:** si cada uno carga partidos distintos, se juntan los dos. Si cambian el mismo partido, queda el último que se guardó.

## La planilla

- **Ranking** y **Resultados:** se actualizan solas al cerrar o reabrir una fecha. Sirven para mirar o copiar; si las editas, la página no cambia y se reescriben en el próximo cierre.
- **Registro:** cada guardado importante, con su hora. Por ejemplo, cuándo se cerró cada fecha.
- **Respaldos:** las copias de seguridad.
- **Datos:** los datos de la liga en formato interno. No la edites.

Los cambios se hacen siempre desde la página, en modo organizador.

## Copias de seguridad

Se guarda una copia al subir los datos la primera vez, al cerrar o reabrir una fecha, y cada 6 horas si hubo cambios. Se conservan las últimas 40.

Para volver atrás, entra a **Ajustes → Datos en Google → Ver copias de seguridad** y toca **Restaurar** en la copia que quieras. Lo que había antes queda guardado como otra copia, así que también se puede deshacer.

## Si cambias el código del servidor o el PIN

Después de editar `Codigo.gs` en Apps Script, entra a **Implementar → Gestionar implementaciones**. Toca el lápiz, elige *Versión: Nueva versión* y toca **Implementar**. La URL no cambia, así que no hay que tocar `config.js`.

Para cambiar el PIN, haz lo mismo con la línea `PIN_ORGANIZADOR`. Los teléfonos que tenían el PIN anterior salen del modo organizador y piden el nuevo. Los cambios que no alcanzaron a guardarse quedan en el teléfono.

## Importante

No subas a este repositorio un `index.html` descargado desde la app de Claude. Reemplazaría esta página y se perdería el modo organizador.
