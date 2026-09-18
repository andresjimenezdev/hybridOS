# HybridOS

HybridOS es un sistema personal, mobile-first, de salud, entrenamiento y rendimiento. Supabase es siempre la fuente de verdad. Google Sheets funciona como puente secundario para prescripción y consulta externa; un fallo de Google nunca invalida un registro guardado en Supabase.

## Arquitectura

```text
ChatGPT/Google Drive → AI_PLAN → HybridOS
                                 ↓
                         Supabase Auth + Postgres
                                 ↓
                    AI_DATA / AI_HEALTH / AI_WEEKLY
                                 ↓
                         Google Sheets / ChatGPT
```

- Next.js 16 App Router, TypeScript y Tailwind CSS.
- Server Components para lectura; Server Actions y Route Handlers para mutaciones.
- Supabase Auth, Postgres, constraints, RLS y funciones transaccionales.
- PWA instalable, con autoguardado local durante entrenamientos.
- Google Sheets REST API únicamente desde servidor.
- Sin OpenAI API, chatbot, analytics de pago, cron ni servicios deportivos de pago.

## Funcionalidad V1

- Hoy, planificación semanal y adherencia basada solo en sesiones completadas.
- Biblioteca de ejercicios, plantillas, sesiones, series, peso, repeticiones y RIR.
- Referencia anterior, descanso, recuperación y resumen postentreno.
- Running y otros cardio, salud, peso, medidas e históricos básicos.
- Progreso de fuerza, cardio y composición corporal.
- Importación idempotente de `AI_PLAN`, snapshots relacionales por sesión y exportación batch a `AI_DATA`, `AI_HEALTH` y `AI_WEEKLY`.
- Importador inicial idempotente del Sheet legado.

## Desarrollo local

Requisitos: Node.js 22+, npm 10+ y un proyecto Supabase Free.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abrir `http://localhost:3000`.

## Variables de entorno

| Variable | Ámbito | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | público | clave publicable, protegida por RLS |
| `SUPABASE_URL` | servidor | fallback automático de la integración Vercel/Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | servidor | fallback automático de la integración Vercel/Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor/script | solo migración legado; nunca frontend |
| `HYBRIDOS_USER_ID` | servidor/script | propietario de la migración legado |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | servidor | cuenta de servicio de Sheets |
| `GOOGLE_PRIVATE_KEY` | servidor | clave privada de Google, saltos como `\\n` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | servidor | `1XGrFyCW-fS5-rRiBMsjtWR8f4peHz_gu05Z4Qx3URH8` |

Ningún secreto debe usar `NEXT_PUBLIC_`. `.env*` está excluido de Git.

## Supabase y base de datos

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Las migraciones de `supabase/migrations` incluyen integridad referencial, índices, RLS por `auth.uid()`, un único entrenamiento activo y funciones transaccionales. Las series son entidades independientes. Planificación e histórico están separados: cambiar un plan nunca reescribe sesiones completadas.

Tablas principales: `profiles`, `exercises`, `workout_templates`, `workout_template_exercises`, `weekly_plans`, `planned_sessions`, `strength_sessions`, `strength_exercise_logs`, `strength_sets`, `cardio_sessions`, `mobility_routines`, `mobility_sessions`, `health_metrics`, `body_measurements`, `goals` y `sync_log`.

Tras crear la cuenta inicial desde `/login`, se recomienda desactivar nuevos registros en Supabase Auth.

## Google Sheets Bridge

1. Crear una cuenta de servicio de Google Cloud con Sheets API.
2. Compartir el workbook con `GOOGLE_SERVICE_ACCOUNT_EMAIL` como editor.
3. Crear pestañas y cabeceras exactas según [docs/chatgpt-bridge.md](docs/chatgpt-bridge.md).
4. Configurar las variables en local y Vercel.

`AI_PLAN` es prescripción entrante. `AI_DATA`, `AI_HEALTH` y `AI_WEEKLY` son proyecciones salientes reconstruibles. La app consulta el plan al abrir Hoy, con limitación por sesión, y permite reintento manual. No hay polling continuo.

Los ejercicios se resuelven primero por `exercise_key` y después por nombre normalizado único. Lo desconocido/ambiguo queda `needs_review`; nunca se crea un duplicado silencioso. Un plan completado es inmutable. Un cambio durante una sesión activa requiere aceptar o rechazar y nunca modifica series ya completadas.

## Apple Health Bridge

La integración sin coste usa un Atajo personal de iOS que envía resúmenes diarios validados a un endpoint privado. Supabase sigue siendo la fuente de verdad y los reenvíos son idempotentes. Consulta la configuración y el contrato en [docs/apple-health-shortcut.md](docs/apple-health-shortcut.md).

## Migración del Sheet legado

Primero ejecutar dry-run:

```bash
npm run import:legacy
npm run import:legacy -- --apply
```

Solo lee `Fuerza`, `Running`, `Salud` y `Medidas`; no modifica las pestañas antiguas. Usa IDs externos/upserts para repetirse sin duplicar. Revisar el resumen y hacer backup antes de `--apply`.

## PWA e iPhone

Manifest, service worker, iconos 192/512 y `apple-touch-icon` están en `public`. El service worker guarda solo el shell mínimo y no aplica una estrategia offline a endpoints API.

Instalación: Safari → Compartir → “Añadir a pantalla de inicio”. La interfaz usa `standalone`, safe areas y targets táctiles amplios. Durante fuerza, el borrador local se reenvía al recuperar conexión.

```bash
npm run icons
```

## QA

```bash
npm run qa
```

Ejecuta typecheck, ESLint, tests y build de producción. Se usa Webpack para compatibilidad con entornos donde Turbopack no puede abrir su puerto interno. La matriz manual está en [docs/qa-checklist.md](docs/qa-checklist.md).

## Deployment Vercel

1. Aplicar migraciones Supabase y verificar RLS.
2. Importar el repositorio en Vercel Hobby.
3. Configurar variables para Production (y Preview si se usa).
4. Desplegar Preview, ejecutar QA y promover exactamente ese artefacto.
5. Verificar login, entrenamiento, sync y reinstalación PWA en la URL final.

No desplegar como producción operativa sin credenciales Supabase/Google. La app no incluye secretos en el bundle cliente.

## Seguridad

- RLS en todas las tablas de usuario.
- Server Actions/rutas recuperan usuario autenticado.
- Inputs limitados y validados en servidor; constraints en Postgres.
- Credenciales Google y service role solo en servidor.
- Errores de sync registrados sin secretos; fallo de Google no revierte Supabase.
- Sheets nunca sobrescribe automáticamente el histórico completado.

## Backup

Supabase es la fuente de verdad; Sheets no sustituye un backup. Mantener SQL en Git, exportar periódicamente tablas principales y probar restauración antes de cambios grandes. Antes de importar legado, conservar una copia inmutable del workbook.

## COST

Objetivo recurrente: **0 €/mes** para uso personal.

- Vercel Hobby dentro de límites gratuitos.
- Supabase Free para Postgres y Auth.
- Google Sheets API con bajo volumen, eventos y batch updates.
- GitHub Free para repositorio.
- Cero APIs de IA, analytics, correo, cron, bases extra o APIs deportivas de pago.

Revisar cuotas antes de ampliar alcance. Ninguna dependencia futura debe convertirse en coste obligatorio.
