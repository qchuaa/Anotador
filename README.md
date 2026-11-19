# Anotador

Aplicación de Windows para apuntes de clase, con cuadernos por materia, fechas semanales, clases numeradas y tema oscuro.

Descargá el ejecutable desde la sección **Releases** del repositorio y abrilo en tu notebook con Windows.

El botón **Clase de hoy** abre o crea la clase correspondiente al día de cursada. Incluye listas, capturas movibles y redimensionables, y adjuntos PDF y PowerPoint que se abren con la aplicación asociada en Windows.

Para obtener explicaciones de texto e imágenes, ingresá tu clave de OpenAI en **Ajustes de IA**. Requiere conexión a Internet y créditos de API. La clave se guarda cifrada en Windows. Los apuntes se guardan localmente en cada equipo.

La autocorrección actual cubre un listado de errores frecuentes en español. Las correcciones muestran el texto original al pasar el mouse.

## Desarrollo

Requiere Node.js 24 y Windows para generar el ejecutable.

```sh
npm ci
npm start
npm run build
```

El flujo de GitHub Actions genera una descarga para Windows cuando se actualiza la aplicación en la rama principal.

## Edición y atajos

- Las capturas se pueden mover y redimensionar libremente; el texto queda por encima.
- `Ctrl + E` explica el texto o la captura seleccionada (requiere configurar la IA).
- `Backspace` o `Supr` borra la captura seleccionada.
- Las explicaciones mantienen el fondo verde. `Enter` dentro de una explicación continúa en un párrafo normal; `Shift + Enter` permite un salto dentro del bloque.

Pruebas de interacción con datos aislados: `node scripts/test-editor.cjs` y `node scripts/test-delete.cjs`. Las pruebas del editor simulan las respuestas de IA, sin llamadas ni consumo de API.

## Espacio de trabajo y descargas

El botón ☰ de la barra superior oculta o muestra el panel izquierdo; la preferencia se conserva al abrir la aplicación. La hoja aprovecha el ancho disponible y la barra flotante permanece accesible al desplazarse.

En una clase, **Descargar → PDF**, junto a **Borrar clase**, guarda sus apuntes. En un cuaderno, **Descargar → PDF** reúne todas las clases, ordenadas por fecha, con cada clase en una página nueva. Se elige el nombre y la ubicación desde el diálogo de Windows. Los PDF usan fondo blanco, incluyen capturas y explicaciones, y adaptan el contenido a A4 sin superponer imágenes y texto. Los PDF y PowerPoint adjuntos se enumeran por nombre; sus páginas no se incorporan.

Prueba de interfaz y exportación con datos aislados: `node scripts/test-layout-pdf.cjs`. Verificación de ubicación de explicaciones: `node scripts/test-placement.cjs`.

## Sincronización con Notion

Abrí **Conectar Notion** o el botón **Sincronizar ahora** de la barra superior. Esta conexión pertenece a Anotador y funciona sin tener abierto Codex; el complemento de Notion del chat no proporciona credenciales a la aplicación.

1. Creá un [token personal de Notion](https://www.notion.so/developers/tokens), con la capacidad **Notion API**, y pegalo en el campo de la app. No lo pegues en un chat ni en archivos del repositorio. También se admite un token de conexión interna con permisos de lectura, inserción y actualización; en ese caso, compartí la página de destino con esa conexión.
2. Pegá el enlace de la página de destino y guardá la conexión. La clave se cifra con el almacenamiento seguro de Windows y nunca se devuelve a la interfaz.
3. Dejá activada la sincronización automática o usá **Sincronizar ahora** cuando quieras.

Se crea una página por cuaderno y una subpágina por clase. Los cambios actualizan las páginas existentes y su sección **Apuntes sincronizados desde Anotador**. Se conservan los bloques personales que agregues fuera de esa sección. La copia es unidireccional: no trae cambios de Notion a Anotador y no elimina de Notion las clases o cuadernos borrados localmente.

La app guarda primero los apuntes locales; espera 15 segundos sin escribir, con un máximo de un minuto mientras seguís editando, para enviar los cambios. Debe estar abierta para sincronizar. Los pendientes se recuperan desde los apuntes guardados al reabrir. Los fallos de conexión se reintentan con espera creciente; los problemas de credenciales o permisos se muestran para corregirlos. Las nuevas versiones se preparan antes de retirar el bloque anterior para conservar la copia previa si falla un envío.

Se incluyen títulos, fechas, texto con formato, listas, explicaciones, capturas y archivos PDF/PPT. Notion organiza las capturas y los adjuntos en una sección propia, sin reproducir las coordenadas libres de la hoja. Los límites de archivo dependen del espacio de Notion: si un archivo excede el límite o no está disponible, se muestra **Sincronizado con avisos**, con el detalle, sin bloquear el resto del contenido. La clave y el estado de sincronización se guardan junto a los datos locales en `notion-sync.json`, fuera del repositorio. No borres este archivo: conserva la relación con las páginas existentes.

Documentación usada: [tokens personales](https://developers.notion.com/guides/connections-and-tokens/personal-access-tokens), [límites y reintentos](https://developers.notion.com/reference/request-limits), [archivos y límites de tamaño](https://developers.notion.com/guides/data-apis/working-with-files-and-media).

Pruebas: `node scripts/test-notion.cjs` verifica el motor con una API simulada, incluidos los fallos después de guardar una petición. `node scripts/test-notion-ui.cjs` prueba la interfaz con datos aislados. No usan claves reales ni envían apuntes a Notion.

Después de compilar, comprobá el paquete antes de abrirlo: `node scripts/check-package.cjs dist-notion/win-unpacked/resources/app.asar`. No modifiques los archivos de `src` mientras se está compilando.

### Word y Google Docs

La opción **Descargar → Word / Docs (.docx)** de una clase o un cuaderno descarga un archivo `.docx` editable para Word o para importar en Google Docs. Incluye títulos, fechas, texto con formato, listas, explicaciones y capturas; los cuadernos se ordenan por fecha y cada clase comienza en una página nueva. Los adjuntos se enumeran como referencias. Las imágenes se acomodan dentro de la página sin conservar la superposición libre del editor. La descarga es local y no crea automáticamente un documento en Google Drive.

### Importar apuntes de Word

Dentro de una clase, **↑ Importar Word** abre un `.docx` y agrega su contenido editable al final sin reemplazar los apuntes existentes. Se conserva una copia del original en los adjuntos. Word antiguo `.doc` y documentos protegidos deben guardarse primero como `.docx` sin contraseña.

La importación conserva títulos, negritas, cursivas, subrayado, tamaños y colores, alineación, listas anidadas, tablas con celdas combinadas e imágenes PNG/JPEG/GIF/WebP. El documento se integra al fondo oscuro, adapta la tinta oscura y elimina fondos blancos, conservando los resaltados de color; se puede editar dentro de él o continuar debajo. La autocorrección no reescribe el texto importado. También se puede volver a exportar a PDF o DOCX; Notion recibe el texto y las imágenes, con las tablas simplificadas por filas.

No reproduce exactamente la maquetación de Word: fuentes no instaladas pueden sustituirse, los encabezados y pies no se importan, las columnas pasan a texto continuo y ecuaciones, objetos o cuadros de texto complejos pueden perder detalles. La app avisa al detectar varios de estos elementos y conserva el archivo original. Los límites de importación son 40 MB de archivo y 160 MB descomprimidos.

Prueba: `node scripts/test-import-docx.cjs` (o con la ruta de un ejecutable empaquetado como argumento).

### Materiales y archivos arrastrados

Arrastrá DOCX, PDF, PPT o PPTX sobre la hoja. Word queda editable al final de la clase; PDF y PowerPoint se copian como material y se abren con la aplicación asociada en Windows. Cada adjunto tiene una **×** para quitarlo de la clase, con confirmación. Quitar el Word original adjunto no elimina su texto importado. Los archivos originales de la PC se conservan.

La exportación DOCX define todos los márgenes de Word y coloca las propiedades de sección al final del cuerpo, evitando los valores inválidos que impedían abrir algunas descargas en Microsoft Word. Prueba de materiales: `node scripts/test-materials.cjs`.

### Traer de Notion (descarga manual)

**↓ Traer de Notion**, en la barra superior, recupera los cuadernos y clases de Anotador dentro de la misma página configurada como destino. Ambas computadoras deben usar esa página y tener permiso para leerla. No busca todo el espacio de Notion ni importa bases de datos o páginas ajenas a esa estructura. No descarga cambios automáticamente: pulsá el botón cuando quieras traer lo de la otra PC.

Se recuperan texto, títulos, listas, tablas, imágenes y adjuntos alojados en Notion. Las imágenes se muestran dentro del texto: Notion no conserva las coordenadas libres originales. Los adjuntos PDF/PPT/DOCX se descargan a la PC; no se ejecutan ni abren solos. Los archivos externos, formatos no compatibles y descargas fallidas aparecen como avisos; una clase con avisos queda protegida frente al envío automático hasta recuperarla sin avisos.

La identificación usa los IDs de las páginas, no sus nombres. Repetir la descarga sin cambios no crea duplicados. Si se reemplaza una versión local, se conserva íntegra como **(copia local)**, incluso sus capturas y archivos. Estas copias no se envían a Notion. La clase recuperada sí puede editarse y enviarse luego por la sincronización normal. No es una fusión automática de cambios entre computadoras; conviene traer antes de continuar editando.

La app bloquea la edición mientras trae, espera los guardados pendientes, comprueba que no haya cambios concurrentes antes de escribir y guarda `notes.json.bak`. Si la lectura falla, conserva los apuntes existentes y pausa el envío programado hasta una nueva acción. Una descarga correcta muestra cuántas clases se agregaron, actualizaron o quedaron iguales.

Pruebas: `node scripts/test-notion-pull.cjs` y `node scripts/test-notion-ui.cjs`. El motor usa una API simulada para verificar IDs estables, copias locales, descarga de medios, fallos de red, edición concurrente, recuperación de estado y repetición sin duplicados.
