# Apple Health mediante Atajos de iOS

HybridOS recibe un resumen diario desde un Atajo personal. Apple Health sigue siendo el origen; Supabase almacena una fila diaria con `source = apple_health`.

## Variables privadas de Vercel

Configura en Production, Preview y Development:

- `SUPABASE_SERVICE_ROLE_KEY`: service-role del proyecto Supabase. Nunca debe llevar prefijo `NEXT_PUBLIC_`.
- `HYBRIDOS_USER_ID`: UUID del único usuario de HybridOS.
- `APPLE_HEALTH_SYNC_SECRET`: token aleatorio generado con `openssl rand -hex 32`.

Después de guardar las variables, crea un nuevo deployment.

## Endpoint

`POST https://hybrid.noktoapp.com/api/apple-health/import`

Cabeceras:

```text
Authorization: Bearer TU_APPLE_HEALTH_SYNC_SECRET
Content-Type: application/json
```

Ejemplo de cuerpo:

```json
{
  "date": "2026-09-19",
  "steps": 8421,
  "active_calories": 534,
  "total_calories": 2240,
  "sleep_minutes": 438,
  "resting_heart_rate": 52,
  "vo2_max": 48.2,
  "weight_kg": 74.6,
  "body_fat_percent": 16.8
}
```

Todos los campos son opcionales salvo que debe existir al menos una métrica. Si `date` se omite o Atajos la serializa en otro formato, el servidor usa automáticamente la fecha actual de Madrid. Un campo ausente conserva el valor ya importado ese día. Repetir el envío no duplica datos.

## Crear el Atajo

1. Crea un atajo llamado `Sincronizar HybridOS`.
2. Obtén la fecha actual y formatéala como `yyyy-MM-dd`.
3. Usa `Buscar muestras de salud` para cada métrica disponible.
4. Para pasos, energía activa y energía basal del día, calcula la suma. `total_calories` es energía activa + energía basal.
5. Para FC en reposo, VO₂max, peso y grasa corporal, ordena por fecha descendente, limita a una muestra y extrae su valor.
6. Para sueño, busca muestras cuyo final pertenezca al día actual, conserva las categorías de sueño real y suma su duración en minutos.
7. Construye un diccionario con los nombres exactos del ejemplo. Omite cualquier clave que no tenga valor.
8. Añade `Obtener contenido de URL`: método `POST`, cuerpo JSON con el diccionario y cabecera `Authorization` con `Bearer TU_APPLE_HEALTH_SYNC_SECRET`.
9. Muestra una notificación solo si la respuesta no contiene `ok: true`.

Si iPhone y Apple Watch aportan pasos simultáneamente, no sumes muestras de fuentes mezcladas sin revisar el resultado: puede duplicar actividad. Elige la fuente prioritaria que utilizas habitualmente y compara el primer día con la app Salud.

## Automatización

En Atajos → Automatización:

1. Crea una automatización por hora del día, por ejemplo 23:55.
2. Ejecuta `Sincronizar HybridOS`.
3. Activa ejecución inmediata y desactiva la confirmación previa si iOS lo permite.
4. Crea opcionalmente otra ejecución al abrir la app Salud para refrescar los datos más recientes.

## Seguridad

- El token solo vive en Vercel y en tu Atajo personal.
- El endpoint no acepta cookies ni una sesión web como sustituto del token.
- La service-role se usa únicamente en el servidor.
- Si compartes accidentalmente el Atajo, rota inmediatamente `APPLE_HEALTH_SYNC_SECRET`.
