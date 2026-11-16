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
