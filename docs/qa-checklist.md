# HybridOS — QA de producción

No marcar una prueba como superada sin ejecutarla contra Supabase y Google reales. Usar datos de prueba recuperables.

## Automatizado

- [x] `npm run typecheck`.
- [x] `npm run lint`.
- [x] `npm test`.
- [x] `npm run build`.
- [ ] Migraciones aplicadas y validadas en Supabase staging.

## Fuerza y resiliencia

- [ ] Login y acceso solo a datos propios.
- [ ] Iniciar plantilla con tres ejercicios.
- [ ] Registrar peso/reps/RIR; recargar Safari; confirmar recuperación exacta.
- [ ] Cortar red, editar dos series, reconectar y confirmar en Supabase.
- [ ] Completar serie: descanso automático, +30 s y omitir.
- [ ] Terminar; comprobar duración, resumen, histórico y plan completado.
- [ ] Una sesión planificada no cuenta como completada.

## Google Bridge

- [ ] Importar igual `AI_PLAN` diez veces: una sesión/plantilla, cero duplicados.
- [ ] Resolver ejercicio por `exercise_key`.
- [ ] Resolver por nombre normalizado único y asignar clave.
- [ ] Desconocido/ambiguo: `needs_review`, sin duplicado.
- [ ] Cambio `planned`: actualización directa.
- [ ] Cambio `in_progress`: aviso; aceptar y rechazar.
- [ ] Aceptar no modifica series completadas.
- [ ] Cambio `completed`: histórico inmutable.
- [ ] Error Google: Supabase persiste, `sync_log` falla y Ajustes reintenta.
- [ ] Verificar cabeceras/contenido de tres pestañas salientes.
- [ ] Ejecutar migración legado dos veces y comparar conteos/IDs.

## Cardio, salud y progreso

- [ ] Running planificado/libre; ritmo, FC, RPE y talk test.
- [ ] Otro cardio sin confundir actividad cotidiana.
- [ ] Salud parcial y medidas en misma fecha.
- [ ] Rangos 4 semanas, 3 meses, 6 meses y todo.
- [ ] Adherencia basada solo en completadas.

## iPhone / Safari

- [ ] Sin scroll horizontal; teclado numérico y targets ≥44 px.
- [ ] Safe areas correctas en portrait/landscape.
- [ ] Instalar: icono, nombre y standalone correctos.
- [ ] Reabrir entrenamiento activo y recuperar punto exacto.
- [ ] Contraste, focus y labels accesibles.

## Producción

- [ ] Preview con variables y migraciones aplicadas.
- [ ] Flujo crítico completo en Preview.
- [ ] Promover artefacto verificado, sin reconstruir.
- [ ] Revisar logs tras login, entrenamiento y sync.
- [ ] Ningún secreto en HTML, JS cliente o logs públicos.
