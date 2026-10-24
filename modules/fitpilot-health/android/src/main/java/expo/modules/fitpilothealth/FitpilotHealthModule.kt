package expo.modules.fitpilothealth

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.reflect.KClass

// Errores tipados. El JS solo podía distinguir fallos por el texto del mensaje, y los
// textos que buscaba ("Authorization not determined") son de HealthKit: en Android todo
// acababa en el mensaje genérico "No se pudo sincronizar".
class HealthUnavailableException(message: String) :
  CodedException("ERR_HEALTH_UNAVAILABLE", message, null)

class HealthPermissionsException(message: String, cause: Throwable? = null) :
  CodedException("ERR_HEALTH_PERMISSIONS", message, cause)

class HealthRangeException(message: String) :
  CodedException("ERR_HEALTH_RANGE", message, null)

class HealthReadException(message: String, cause: Throwable? = null) :
  CodedException("ERR_HEALTH_READ", message, cause)

class FitpilotHealthModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private lateinit var permissionsLauncher: AppContextActivityResultLauncher<ArrayList<String>, Set<String>>

  // Permisos que alimentan métricas. Su ausencia se refleja en `missing` y la UI ofrece
  // completarlos.
  private val corePermissions = setOf(
    HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
    HealthPermission.getReadPermission(BasalMetabolicRateRecord::class),
    HealthPermission.getReadPermission(StepsRecord::class),
    HealthPermission.getReadPermission(DistanceRecord::class),
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    HealthPermission.getReadPermission(SleepSessionRecord::class),
    HealthPermission.getReadPermission(HeartRateRecord::class),
    HealthPermission.getReadPermission(RestingHeartRateRecord::class),
    HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
    HealthPermission.getReadPermission(BloodGlucoseRecord::class),
    HealthPermission.getReadPermission(BloodPressureRecord::class),
    HealthPermission.getReadPermission(WeightRecord::class),
    HealthPermission.getReadPermission(BodyFatRecord::class),
    HealthPermission.getReadPermission(LeanBodyMassRecord::class),
  )

  // Sin este permiso Health Connect limita cada lectura a los últimos 30 días CONTADOS
  // DESDE QUE SE CONCEDIÓ, y el sync pide exactamente 30 días: los más antiguos del rango
  // volvían vacíos. Se usa el literal en vez de la constante de la librería para no atar el
  // módulo a la versión de connect-client que la introdujo; Health Connect compara strings.
  //
  // Es OPCIONAL a propósito: denegarlo recorta el histórico pero no impide sincronizar, y
  // el lado JS lo excluye de los permisos que disparan el aviso de "permisos incompletos".
  private val optionalPermissions = setOf(HEALTH_DATA_HISTORY_PERMISSION)

  private val requiredPermissions = corePermissions + optionalPermissions

  override fun definition() = ModuleDefinition {
    Name("FitpilotHealth")

    // Declarado para que el contrato sea idéntico en las dos plataformas, aunque en Android
    // no llegue a emitirse: Health Connect no notifica cambios, hay que preguntarle.
    Events("onHealthDataChanged")

    AsyncFunction("isAvailable") Coroutine { ->
      availability()
    }

    AsyncFunction("requestPermissions") Coroutine { ->
      requestHealthConnectPermissions()
      permissionStatus(requiresManualGrant = false)
    }

    AsyncFunction("getGrantedPermissions") Coroutine { ->
      permissionStatus(requiresManualGrant = false)
    }

    AsyncFunction("getChangesToken") Coroutine { ->
      changesToken()
    }

    // Health Connect no tiene nada equivalente a HKObserverQuery: no existe forma de que
    // avise de datos nuevos. Devolver `false` es la respuesta honesta, y hace que el lado
    // JS caiga al camino de preguntar por los cambios al ganar foco.
    AsyncFunction("startObservingChanges") Coroutine { ->
      false
    }

    AsyncFunction("stopObservingChanges") Coroutine { ->
      // Sin observador que parar.
    }

    AsyncFunction("getChanges") Coroutine { token: String ->
      changesSince(token)
    }

    AsyncFunction("readSnapshot") Coroutine { range: Map<String, String> ->
      readSnapshot(range)
    }

    AsyncFunction("syncRange") Coroutine { range: Map<String, String> ->
      syncRange(range)
    }

    AsyncFunction("openSettings") Coroutine { ->
      openHealthConnectSettings()
    }

    RegisterActivityContracts {
      permissionsLauncher = registerForActivityResult(HealthConnectPermissionsContract())
    }
  }

  // --- Disponibilidad -------------------------------------------------------

  private fun availability(): Map<String, Any?> {
    return when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_AVAILABLE -> mapOf(
        "available" to true,
        "platform" to "health_connect",
        "status" to "available",
      )
      // Health Connect ESTÁ instalado, solo que su versión es anterior a la que exige el
      // SDK. Se mapeaba a "needs_install", así que la app le decía "Instala Health Connect"
      // a quien ya lo tenía: exactamente lo que reportaban los testers.
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> mapOf(
        "available" to false,
        "platform" to "health_connect",
        "status" to "needs_update",
        "message" to "Health Connect está desactualizado. Actualízalo desde Play Store para que FitPilot pueda leer tus métricas.",
      )
      // A partir de Android 14 Health Connect es parte del sistema y no se instala: si no
      // está disponible es porque está desactivado o restringido. En versiones anteriores
      // sí es una app que puede faltar.
      else -> if (Build.VERSION.SDK_INT >= 34) {
        mapOf(
          "available" to false,
          "platform" to "health_connect",
          "status" to "unavailable",
          "message" to "Health Connect está desactivado en este dispositivo. Actívalo en Ajustes > Seguridad y privacidad > Más ajustes > Health Connect.",
        )
      } else {
        mapOf(
          "available" to false,
          "platform" to "health_connect",
          "status" to "needs_install",
          "message" to "Instala Health Connect desde Play Store para activar tus métricas.",
        )
      }
    }
  }

  // --- Permisos -------------------------------------------------------------

  private suspend fun grantedPermissions(): Set<String> = withContext(Dispatchers.IO) {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
      return@withContext emptySet()
    }
    runCatching {
      HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
    }.getOrElse { emptySet() }
  }

  private suspend fun permissionStatus(requiresManualGrant: Boolean): Map<String, Any?> {
    val granted = grantedPermissions()
    return mapOf(
      "platform" to "health_connect",
      "granted" to granted.toList(),
      "missing" to requiredPermissions.minus(granted).toList(),
      "requiresManualGrant" to requiresManualGrant,
    )
  }

  private fun hasPermission(granted: Set<String>, recordClass: KClass<out Record>): Boolean =
    granted.contains(HealthPermission.getReadPermission(recordClass))

  private suspend fun requestHealthConnectPermissions() {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
      openHealthConnectSettings()
      return
    }

    val granted = grantedPermissions()
    val missing = requiredPermissions.minus(granted)
    if (missing.isEmpty()) {
      return
    }

    // Los permisos de Health Connect (android.permission.health.*) deben pedirse
    // SIEMPRE con el contrato PermissionController de Health Connect, en cualquier
    // versión de Android. El diálogo de permisos genérico no puede otorgarlos
    // (dejaba a los usuarios de Android 14+ con cero permisos), por eso usamos
    // permissionsLauncher en todas las versiones.
    if (!::permissionsLauncher.isInitialized) {
      // El launcher se registra en el primer onHostResume. Si algo pide permisos antes
      // (deep link, arranque en frío rápido) esto salía como UninitializedPropertyAccess
      // sin capturar.
      throw HealthPermissionsException(
        "La app aún no está lista para pedir permisos. Inténtalo de nuevo en un momento.",
      )
    }

    permissionsLauncher.launch(ArrayList(missing))
  }

  private fun openHealthConnectSettings() {
    val intent = Intent(ACTION_HEALTH_CONNECT_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    if (runCatching { context.startActivity(intent) }.isSuccess) {
      return
    }

    // En Android 14+ Health Connect vive en el sistema: mandar a la ficha de Play Store del
    // APK antiguo lleva a "esta app no está disponible para tu dispositivo", un callejón sin
    // salida. Ahí lo correcto son los ajustes del sistema.
    val fallback = if (Build.VERSION.SDK_INT >= 34) {
      Intent(Settings.ACTION_SETTINGS)
    } else {
      Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$HEALTH_CONNECT_PACKAGE"))
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    if (runCatching { context.startActivity(fallback) }.isFailure) {
      throw HealthUnavailableException(
        "No se pudo abrir Health Connect en este dispositivo. Ábrelo manualmente desde tus ajustes.",
      )
    }
  }

  // --- Sincronización -------------------------------------------------------

  // --- Cambios incrementales ------------------------------------------------

  /**
   * Un token opaco contra el que preguntar después "¿ha cambiado algo?".
   *
   * Sin esto, la única forma de saber si había datos nuevos era releer y reagregar los 30
   * días enteros. Preguntar por los cambios cuesta una llamada y permite no sincronizar
   * cuando no hay nada que sincronizar.
   */
  private suspend fun changesToken(): String? = withContext(Dispatchers.IO) {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
      return@withContext null
    }

    val granted = grantedPermissions()
    val types = WATCHED_RECORD_TYPES.filter { hasPermission(granted, it) }.toSet()
    if (types.isEmpty()) {
      return@withContext null
    }

    runCatching {
      healthClient().getChangesToken(ChangesTokenRequest(recordTypes = types))
    }.getOrNull()
  }

  /**
   * Qué días tienen datos nuevos desde el token dado.
   *
   * Devuelve fechas locales, no registros: lo que la app necesita saber es qué días hay que
   * reagregar. Un borrado no dice a qué día pertenecía —solo llega el id— así que en ese
   * caso se pide una resincronización completa en lugar de adivinar.
   */
  private suspend fun changesSince(token: String): Map<String, Any?> = withContext(Dispatchers.IO) {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
      return@withContext mapOf("expired" to true, "requiresFullSync" to true)
    }

    val zone = ZoneId.systemDefault()
    val dates = sortedSetOf<String>()
    var requiresFullSync = false
    var nextToken = token
    var expired = false
    var pages = 0

    while (pages < MAX_CHANGE_PAGES) {
      pages += 1
      val response = runCatching { healthClient().getChanges(nextToken) }.getOrElse {
        return@withContext mapOf("expired" to true, "requiresFullSync" to true)
      }

      if (response.changesTokenExpired) {
        expired = true
        requiresFullSync = true
        break
      }

      for (change in response.changes) {
        when (change) {
          is UpsertionChange -> {
            val instant = when (val record = change.record) {
              // The temporal base interfaces are internal in Health Connect 1.1.0.
              // Use public record types; keep these aligned with WATCHED_RECORD_TYPES.
              is ActiveCaloriesBurnedRecord -> record.startTime
              is TotalCaloriesBurnedRecord -> record.startTime
              is StepsRecord -> record.startTime
              is DistanceRecord -> record.startTime
              is ExerciseSessionRecord -> record.startTime
              is SleepSessionRecord -> record.startTime
              is HeartRateRecord -> record.startTime
              is RestingHeartRateRecord -> record.time
              is HeartRateVariabilityRmssdRecord -> record.time
              is BloodGlucoseRecord -> record.time
              is BloodPressureRecord -> record.time
              is WeightRecord -> record.time
              else -> null
            }
            instant?.let {
              dates.add(it.atZone(zone).toLocalDate().format(DateTimeFormatter.ISO_LOCAL_DATE))
            }
          }
          // El borrado solo trae el id: no hay forma de saber qué día quedó afectado.
          is DeletionChange -> requiresFullSync = true
          else -> Unit
        }
      }

      nextToken = response.nextChangesToken
      if (!response.hasMore) {
        break
      }
    }

    mapOf(
      "dates" to dates.toList(),
      "nextToken" to nextToken,
      "expired" to expired,
      "requiresFullSync" to requiresFullSync,
    )
  }

  /**
   * Lectura ligera para pintar la pantalla: agrega los días del rango y NO sube nada.
   *
   * Existe porque el dato ya está en el teléfono y hacerle dar la vuelta por el backend
   * antes de enseñarlo es lo que hacía que las métricas se sintieran ajenas a la app. El
   * sync completo sigue ocurriendo después, en segundo plano.
   *
   * Se salta la lectura de registros salvo HRV y glucosa, que son las dos métricas sin
   * agregado en Health Connect y hay que promediar a mano.
   */
  private suspend fun readSnapshot(range: Map<String, String>): Map<String, Any?> {
    val startAt = parseInstant(range["startAt"], "startAt")
    val endAt = parseInstant(range["endAt"], "endAt")
    if (!endAt.isAfter(startAt)) {
      throw HealthRangeException("endAt debe ser posterior a startAt")
    }

    val emptySnapshot = mapOf(
      "platform" to "health_connect",
      "from_at" to startAt.toString(),
      "to_at" to endAt.toString(),
      "permissions" to emptyList<String>(),
      "daily_summaries" to emptyList<Map<String, Any?>>(),
    )

    // A diferencia de syncRange, aquí no se lanza: el snapshot es una optimización de
    // render y la pantalla debe poder seguir su curso con lo que venga del backend.
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
      return emptySnapshot
    }

    val granted = grantedPermissions()
    if (granted.intersect(corePermissions).isEmpty()) {
      return emptySnapshot
    }

    val zone = ZoneId.systemDefault()
    val derived = queryDerivedDailyValues(startAt, endAt, granted, zone)
    val summaries = queryDailySummaries(startAt, endAt, granted, zone, derived)

    return mapOf(
      "platform" to "health_connect",
      "from_at" to startAt.toString(),
      "to_at" to endAt.toString(),
      "permissions" to granted.toList(),
      "daily_summaries" to summaries.summaries,
      "metadata" to mapOf(
        "read_mode" to "snapshot",
        "android_sdk" to Build.VERSION.SDK_INT,
        "timezone_offset_minutes" to zone.rules.getOffset(endAt).totalSeconds / 60,
        "source_packages" to summaries.sources.sorted(),
      ),
    )
  }

  /**
   * Solo HRV y glucosa: son las dos métricas que Health Connect no sabe agregar, así que su
   * media diaria hay que calcularla desde los registros. El resto del snapshot sale de
   * agregados, que son mucho más baratos.
   */
  private suspend fun queryDerivedDailyValues(
    startAt: Instant,
    endAt: Instant,
    granted: Set<String>,
    zone: ZoneId,
  ): DerivedDailyValues = withContext(Dispatchers.IO) {
    val client = healthClient()
    val timeRange = TimeRangeFilter.between(startAt, endAt)
    val hrvBuckets = mutableMapOf<LocalDate, MutableList<Double>>()
    val glucoseBuckets = mutableMapOf<LocalDate, MutableList<Double>>()

    if (hasPermission(granted, HeartRateVariabilityRmssdRecord::class)) {
      runCatching {
        client.readRecords(
          ReadRecordsRequest(
            recordType = HeartRateVariabilityRmssdRecord::class,
            timeRangeFilter = timeRange,
            ascendingOrder = false,
            pageSize = PAGE_SIZE,
          )
        ).records
      }.getOrDefault(emptyList()).forEach { record ->
        hrvBuckets.getOrPut(record.time.atZone(zone).toLocalDate()) { mutableListOf() }
          .add(record.heartRateVariabilityMillis)
      }
    }

    if (hasPermission(granted, BloodGlucoseRecord::class)) {
      runCatching {
        client.readRecords(
          ReadRecordsRequest(
            recordType = BloodGlucoseRecord::class,
            timeRangeFilter = timeRange,
            ascendingOrder = false,
            pageSize = PAGE_SIZE,
          )
        ).records
      }.getOrDefault(emptyList()).forEach { record ->
        glucoseBuckets.getOrPut(record.time.atZone(zone).toLocalDate()) { mutableListOf() }
          .add(record.level.inMilligramsPerDeciliter)
      }
    }

    DerivedDailyValues(
      hrvByDate = hrvBuckets.mapValues { (_, values) -> values.average().round(2) },
      glucoseByDate = glucoseBuckets.mapValues { (_, values) -> values.average().round(2) },
    )
  }

  private suspend fun syncRange(range: Map<String, String>): Map<String, Any?> {
    val startAt = parseInstant(range["startAt"], "startAt")
    val endAt = parseInstant(range["endAt"], "endAt")
    if (!endAt.isAfter(startAt)) {
      throw HealthRangeException("endAt debe ser posterior a startAt")
    }

    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
      throw HealthUnavailableException(
        availability()["message"] as? String
          ?: "Health Connect no está disponible en este dispositivo.",
      )
    }

    val granted = grantedPermissions()
    val missing = requiredPermissions.minus(granted)

    // Sin un solo permiso no hay nada que leer: los 30 resúmenes saldrían vacíos, el backend
    // respondería 200 y la app pintaría "Actualizado ahora" sobre la nada. Cortar aquí con un
    // código tipado es lo que permite al JS ofrecer conceder permisos en vez de un error
    // genérico.
    if (granted.intersect(corePermissions).isEmpty()) {
      throw HealthPermissionsException(
        "FitPilot no tiene permisos de Health Connect. Concédelos para leer tus métricas.",
      )
    }

    val zone = ZoneId.systemDefault()
    // Los registros se leen ANTES que los resúmenes: HRV y glucosa no tienen agregado en
    // Health Connect, así que su media diaria hay que derivarla de los registros, y aquí es
    // donde se conoce la zona horaria real del dispositivo.
    val recordsResult = queryRecords(startAt, endAt, granted, zone)
    val summariesResult = queryDailySummaries(startAt, endAt, granted, zone, recordsResult.derived)

    return mapOf(
      "platform" to "health_connect",
      "from_at" to startAt.toString(),
      "to_at" to endAt.toString(),
      "permissions" to granted.toList(),
      "records" to recordsResult.records,
      "daily_summaries" to summariesResult.summaries,
      "metadata" to buildMap {
        put("missing_permissions", missing.toList())
        put("sync_granularity", "daily")
        put("read_mode", "foreground")
        put("android_sdk", Build.VERSION.SDK_INT)
        put("timezone_offset_minutes", zone.rules.getOffset(endAt).totalSeconds / 60)
        // Instrumentación: sin esto no se puede distinguir "Health Connect está vacío" de
        // "la lectura falló" ni saber qué apps escriben de verdad en el dispositivo.
        put("counts_by_type", recordsResult.countsByType)
        put("source_packages", (recordsResult.sources + summariesResult.sources).sorted())
        put("summary_metric_coverage", summariesResult.coverage)
        put("summaries_processed", summariesResult.summaries.size)
        if (recordsResult.truncatedTypes.isNotEmpty()) {
          put("truncated_types", recordsResult.truncatedTypes.sorted())
        }
        val errors = recordsResult.errors + summariesResult.errors
        if (errors.isNotEmpty()) {
          put("errors_by_type", errors)
        }
      },
    )
  }

  // --- Resúmenes diarios ----------------------------------------------------

  private class SummariesResult(
    val summaries: List<Map<String, Any?>>,
    val coverage: Map<String, Int>,
    val sources: Set<String>,
    val errors: Map<String, String>,
  )

  private suspend fun queryDailySummaries(
    startAt: Instant,
    endAt: Instant,
    granted: Set<String>,
    zone: ZoneId,
    derived: DerivedDailyValues,
  ): SummariesResult = withContext(Dispatchers.IO) {
    val client = healthClient()
    // `Instant.atZone(...).toLocalDate()` está disponible desde API 26. La versión anterior
    // usaba `LocalDate.ofInstant`, que la documentación de Android marca como API 34 y que en
    // este proyecto (minSdk 28, sin core library desugaring y con lint silenciado) habría
    // reventado con NoSuchMethodError en dispositivos antiguos.
    val startDate = startAt.atZone(zone).toLocalDate()
    val endDate = endAt.minusMillis(1).atZone(zone).toLocalDate()

    val metrics = aggregateMetricsFor(granted)
    val summaries = mutableListOf<Map<String, Any?>>()
    val coverage = mutableMapOf<String, Int>()
    val sources = mutableSetOf<String>()
    val errors = mutableMapOf<String, String>()

    var cursor = startDate
    while (!cursor.isAfter(endDate)) {
      val dayStart = maxOf(cursor.atStartOfDay(zone).toInstant(), startAt)
      val dayEnd = minOf(cursor.plusDays(1).atStartOfDay(zone).toInstant(), endAt)

      val result = if (metrics.isEmpty() || !dayEnd.isAfter(dayStart)) {
        null
      } else {
        // Un fallo puntual (rate limiting, un proveedor que no soporta una métrica, un
        // permiso revocado a media sincronización) tumbaba los 30 días y los registros.
        // Ahora cada día cae solo.
        runCatching {
          client.aggregate(
            AggregateRequest(
              metrics = metrics,
              timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd),
            )
          )
        }.onFailure { failure ->
          errors["aggregate:" + cursor.format(DateTimeFormatter.ISO_LOCAL_DATE)] =
            describeFailure(failure)
        }.getOrNull()
      }

      val daySources = result?.dataOrigins?.map { it.packageName }?.toSet().orEmpty()
      sources.addAll(daySources)

      val summary = buildDailySummary(cursor, result, derived, daySources)
      summary.keys.forEach { key ->
        if (key !in SUMMARY_NON_METRIC_KEYS) {
          coverage[key] = (coverage[key] ?: 0) + 1
        }
      }
      summaries.add(summary)
      cursor = cursor.plusDays(1)
    }

    SummariesResult(summaries, coverage, sources, errors)
  }

  private fun aggregateMetricsFor(granted: Set<String>): Set<AggregateMetric<*>> {
    val metrics = mutableSetOf<AggregateMetric<*>>()
    if (hasPermission(granted, ActiveCaloriesBurnedRecord::class)) {
      metrics.add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
    }
    if (hasPermission(granted, TotalCaloriesBurnedRecord::class)) {
      metrics.add(TotalCaloriesBurnedRecord.ENERGY_TOTAL)
    }
    if (hasPermission(granted, BasalMetabolicRateRecord::class)) {
      metrics.add(BasalMetabolicRateRecord.BASAL_CALORIES_TOTAL)
    }
    if (hasPermission(granted, StepsRecord::class)) {
      metrics.add(StepsRecord.COUNT_TOTAL)
    }
    if (hasPermission(granted, DistanceRecord::class)) {
      metrics.add(DistanceRecord.DISTANCE_TOTAL)
    }
    if (hasPermission(granted, SleepSessionRecord::class)) {
      metrics.add(SleepSessionRecord.SLEEP_DURATION_TOTAL)
    }
    if (hasPermission(granted, ExerciseSessionRecord::class)) {
      metrics.add(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL)
    }
    if (hasPermission(granted, HeartRateRecord::class)) {
      metrics.add(HeartRateRecord.BPM_AVG)
      // Casi nadie escribe RestingHeartRateRecord (solo Fitbit, Garmin y Samsung Health), así
      // que la FC en reposo llegaba vacía siempre. El mínimo del día es un proxy razonable y
      // va en el mismo AggregateRequest: no cuesta ni una llamada más.
      metrics.add(HeartRateRecord.BPM_MIN)
    }
    if (hasPermission(granted, RestingHeartRateRecord::class)) {
      metrics.add(RestingHeartRateRecord.BPM_AVG)
    }
    if (hasPermission(granted, BloodPressureRecord::class)) {
      metrics.add(BloodPressureRecord.SYSTOLIC_AVG)
      metrics.add(BloodPressureRecord.DIASTOLIC_AVG)
    }
    if (hasPermission(granted, WeightRecord::class)) {
      metrics.add(WeightRecord.WEIGHT_AVG)
    }
    return metrics
  }

  private fun buildDailySummary(
    date: LocalDate,
    result: AggregationResult?,
    derived: DerivedDailyValues,
    sources: Set<String>,
  ): Map<String, Any?> {
    val dateKey = date.format(DateTimeFormatter.ISO_LOCAL_DATE)
    val restingHr = result?.get(RestingHeartRateRecord.BPM_AVG)
    val minHr = result?.get(HeartRateRecord.BPM_MIN)
    val flags = mutableListOf<String>()

    if (restingHr == null && minHr != null) {
      flags.add("resting_hr_estimated")
    }

    val metadata = buildMap {
      result?.get(WeightRecord.WEIGHT_AVG)?.let { put("weight_avg_kg", it.inKilograms) }
      minHr?.let { put("min_hr_bpm", it) }
    }

    return buildMap {
      put("date", dateKey)
      result?.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)?.let {
        put("active_energy_kcal", it.inKilocalories)
      }
      result?.get(BasalMetabolicRateRecord.BASAL_CALORIES_TOTAL)?.let {
        put("basal_energy_kcal", it.inKilocalories)
      }
      result?.get(TotalCaloriesBurnedRecord.ENERGY_TOTAL)?.let {
        put("total_energy_kcal", it.inKilocalories)
      }
      result?.get(StepsRecord.COUNT_TOTAL)?.let { put("steps", it) }
      result?.get(DistanceRecord.DISTANCE_TOTAL)?.let { put("distance_m", it.inMeters) }
      result?.get(SleepSessionRecord.SLEEP_DURATION_TOTAL)?.let {
        put("sleep_minutes", it.toMinutes())
      }
      result?.get(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL)?.let {
        put("exercise_minutes", it.toMinutes())
      }
      result?.get(HeartRateRecord.BPM_AVG)?.let { put("avg_hr_bpm", it) }
      (restingHr ?: minHr)?.let { put("resting_hr_bpm", it) }
      result?.get(BloodPressureRecord.SYSTOLIC_AVG)?.let {
        put("systolic_avg_mmhg", it.inMillimetersOfMercury)
      }
      result?.get(BloodPressureRecord.DIASTOLIC_AVG)?.let {
        put("diastolic_avg_mmhg", it.inMillimetersOfMercury)
      }
      // Health Connect no expone AggregateMetric para HRV ni una media de glucosa, así que
      // ambas se promedian aquí desde los registros ya leídos. Antes solo viajaban como
      // registros sueltos y la app, que lee el resumen diario, mostraba "--" siempre.
      derived.hrvByDate[date]?.let { put("hrv_ms", it) }
      derived.glucoseByDate[date]?.let { put("glucose_avg_mg_dl", it) }
      if (flags.isNotEmpty()) {
        put("flags", flags)
      }
      if (metadata.isNotEmpty()) {
        put("metadata", metadata)
      }
      // Las fuentes reales que contribuyeron, en lugar de un "Health Connect" fijo que no
      // informaba de nada. Si viene vacío es justamente la señal de que no hay ninguna app
      // escribiendo datos.
      put("sources", if (sources.isEmpty()) listOf("Health Connect") else sources.toList())
    }
  }

  // --- Registros ------------------------------------------------------------

  private class DerivedDailyValues(
    val hrvByDate: Map<LocalDate, Double>,
    val glucoseByDate: Map<LocalDate, Double>,
  )

  private class RecordsResult(
    val records: List<Map<String, Any?>>,
    val countsByType: Map<String, Int>,
    val truncatedTypes: Set<String>,
    val sources: Set<String>,
    val errors: Map<String, String>,
    val derived: DerivedDailyValues,
  )

  private suspend fun queryRecords(
    startAt: Instant,
    endAt: Instant,
    granted: Set<String>,
    zone: ZoneId,
  ): RecordsResult = withContext(Dispatchers.IO) {
    val client = healthClient()
    val timeRange = TimeRangeFilter.between(startAt, endAt)
    val records = mutableListOf<Map<String, Any?>>()
    val countsByType = mutableMapOf<String, Int>()
    val truncatedTypes = mutableSetOf<String>()
    val sources = mutableSetOf<String>()
    val errors = mutableMapOf<String, String>()
    val hrvBuckets = mutableMapOf<LocalDate, MutableList<Double>>()
    val glucoseBuckets = mutableMapOf<LocalDate, MutableList<Double>>()

    // Lee TODAS las páginas del tipo, en orden descendente y dentro de un presupuesto.
    // Antes se hacía una sola llamada sin paginar: Health Connect devuelve como máximo 1000
    // registros por página y en orden ASCENDENTE, así que con un wearable que escribe HRV o
    // glucosa continua se conservaban los 1000 más ANTIGUOS y se descartaban en silencio los
    // recientes, que son justo los que la app muestra.
    suspend fun <T : Record> readAll(klass: KClass<T>, typeName: String): List<T> {
      val collected = mutableListOf<T>()
      var pageToken: String? = null
      val budget = minOf(MAX_RECORDS_PER_TYPE, MAX_RECORDS_TOTAL - records.size).coerceAtLeast(0)
      if (budget == 0) {
        truncatedTypes.add(typeName)
        return collected
      }

      do {
        val response = runCatching {
          client.readRecords(
            ReadRecordsRequest(
              recordType = klass,
              timeRangeFilter = timeRange,
              ascendingOrder = false,
              pageSize = PAGE_SIZE,
              pageToken = pageToken,
            )
          )
        }.onFailure { failure ->
          errors[typeName] = describeFailure(failure)
        }.getOrNull() ?: break

        collected.addAll(response.records)
        pageToken = response.pageToken

        if (collected.size >= budget) {
          if (pageToken != null) {
            truncatedTypes.add(typeName)
          }
          return collected.take(budget)
        }
      } while (pageToken != null)

      return collected
    }

    fun track(typeName: String, sourceName: String) {
      countsByType[typeName] = (countsByType[typeName] ?: 0) + 1
      if (sourceName.isNotBlank()) {
        sources.add(sourceName)
      }
    }

    if (hasPermission(granted, ExerciseSessionRecord::class)) {
      readAll(ExerciseSessionRecord::class, "workout").forEach { record ->
        track("workout", record.metadata.dataOrigin.packageName)
        records.add(
          intervalRecord(
            type = "workout",
            startAt = record.startTime,
            endAt = record.endTime,
            value = Duration.between(record.startTime, record.endTime).toMinutes().toDouble(),
            unit = "min",
            externalId = record.metadata.id,
            sourceName = record.metadata.dataOrigin.packageName,
            metadata = mapOf(
              "exercise_type" to record.exerciseType,
              "title" to record.title,
            ),
          )
        )
      }
    }

    if (hasPermission(granted, SleepSessionRecord::class)) {
      readAll(SleepSessionRecord::class, "sleep_session").forEach { record ->
        track("sleep_session", record.metadata.dataOrigin.packageName)
        records.add(
          intervalRecord(
            type = "sleep_session",
            startAt = record.startTime,
            endAt = record.endTime,
            value = Duration.between(record.startTime, record.endTime).toMinutes().toDouble(),
            unit = "min",
            externalId = record.metadata.id,
            sourceName = record.metadata.dataOrigin.packageName,
            metadata = mapOf("title" to record.title),
          )
        )
      }
    }

    if (hasPermission(granted, WeightRecord::class)) {
      readAll(WeightRecord::class, "weight").forEach { record ->
        track("weight", record.metadata.dataOrigin.packageName)
        records.add(
          instantRecord("weight", record.time, record.weight.inKilograms, "kg", record.metadata.id, record.metadata.dataOrigin.packageName)
        )
      }
    }

    if (hasPermission(granted, BodyFatRecord::class)) {
      readAll(BodyFatRecord::class, "body_fat").forEach { record ->
        track("body_fat", record.metadata.dataOrigin.packageName)
        records.add(
          instantRecord("body_fat", record.time, record.percentage.value, "pct", record.metadata.id, record.metadata.dataOrigin.packageName)
        )
      }
    }

    if (hasPermission(granted, LeanBodyMassRecord::class)) {
      readAll(LeanBodyMassRecord::class, "lean_body_mass").forEach { record ->
        track("lean_body_mass", record.metadata.dataOrigin.packageName)
        records.add(
          instantRecord("lean_body_mass", record.time, record.mass.inKilograms, "kg", record.metadata.id, record.metadata.dataOrigin.packageName)
        )
      }
    }

    if (hasPermission(granted, BloodGlucoseRecord::class)) {
      readAll(BloodGlucoseRecord::class, "glucose").forEach { record ->
        track("glucose", record.metadata.dataOrigin.packageName)
        val value = record.level.inMilligramsPerDeciliter
        glucoseBuckets.getOrPut(record.time.atZone(zone).toLocalDate()) { mutableListOf() }.add(value)
        records.add(
          instantRecord("glucose", record.time, value, "mg/dL", record.metadata.id, record.metadata.dataOrigin.packageName)
        )
      }
    }

    if (hasPermission(granted, HeartRateVariabilityRmssdRecord::class)) {
      readAll(HeartRateVariabilityRmssdRecord::class, "heart_rate_variability").forEach { record ->
        track("heart_rate_variability", record.metadata.dataOrigin.packageName)
        hrvBuckets.getOrPut(record.time.atZone(zone).toLocalDate()) { mutableListOf() }
          .add(record.heartRateVariabilityMillis)
        records.add(
          instantRecord(
            "heart_rate_variability",
            record.time,
            record.heartRateVariabilityMillis,
            "ms",
            record.metadata.id,
            record.metadata.dataOrigin.packageName,
          )
        )
      }
    }

    if (hasPermission(granted, BloodPressureRecord::class)) {
      readAll(BloodPressureRecord::class, "blood_pressure").forEach { record ->
        track("blood_pressure", record.metadata.dataOrigin.packageName)
        records.add(
          instantRecord(
            type = "blood_pressure",
            time = record.time,
            value = null,
            unit = "mmHg",
            externalId = record.metadata.id,
            sourceName = record.metadata.dataOrigin.packageName,
            metadata = mapOf(
              "systolic_mmhg" to record.systolic.inMillimetersOfMercury,
              "diastolic_mmhg" to record.diastolic.inMillimetersOfMercury,
            ),
          )
        )
      }
    }

    RecordsResult(
      records = records,
      countsByType = countsByType,
      truncatedTypes = truncatedTypes,
      sources = sources,
      errors = errors,
      derived = DerivedDailyValues(
        hrvByDate = hrvBuckets.mapValues { (_, values) -> values.average().round(2) },
        glucoseByDate = glucoseBuckets.mapValues { (_, values) -> values.average().round(2) },
      ),
    )
  }

  // --- Utilidades -----------------------------------------------------------

  private fun healthClient(): HealthConnectClient =
    runCatching { HealthConnectClient.getOrCreate(context) }.getOrElse { failure ->
      throw HealthReadException(
        "No se pudo abrir Health Connect para leer tus datos. Vuelve a intentarlo.",
        failure,
      )
    }

  private fun parseInstant(value: String?, field: String): Instant {
    if (value.isNullOrBlank()) {
      throw HealthRangeException("Falta $field en el rango de sincronización")
    }
    return runCatching { Instant.parse(value) }.getOrElse {
      throw HealthRangeException("$field no es una fecha ISO válida: $value")
    }
  }

  private fun describeFailure(failure: Throwable): String =
    listOfNotNull(failure.javaClass.simpleName, failure.message).joinToString(": ").take(200)

  private fun Double.round(decimals: Int): Double {
    var factor = 1.0
    repeat(decimals) { factor *= 10 }
    return Math.round(this * factor) / factor
  }

  private fun intervalRecord(
    type: String,
    startAt: Instant,
    endAt: Instant,
    value: Double?,
    unit: String,
    externalId: String,
    sourceName: String,
    metadata: Map<String, Any?> = emptyMap(),
  ): Map<String, Any?> =
    mapOf(
      "type" to type,
      "start_at" to startAt.toString(),
      "end_at" to endAt.toString(),
      "value" to value,
      "unit" to unit,
      "external_id" to externalId,
      "source_name" to sourceName.ifBlank { "Health Connect" },
      "metadata" to metadata.filterValues { it != null },
    ).filterValues { it != null }

  private fun instantRecord(
    type: String,
    time: Instant,
    value: Double?,
    unit: String,
    externalId: String,
    sourceName: String,
    metadata: Map<String, Any?> = emptyMap(),
  ): Map<String, Any?> =
    mapOf(
      "type" to type,
      "start_at" to time.toString(),
      "value" to value,
      "unit" to unit,
      "external_id" to externalId,
      "source_name" to sourceName.ifBlank { "Health Connect" },
      "metadata" to metadata.filterValues { it != null },
    ).filterValues { it != null }

  companion object {
    private const val PAGE_SIZE = 1000

    // Presupuestos de lectura. El backend rechaza el lote entero con un 400 si llegan más de
    // 5000 registros, y ese 400 no deja rastro en connected_health_sync_runs porque la
    // validación corre antes del servicio: mejor truncar aquí y anotarlo en el metadata.
    private const val MAX_RECORDS_PER_TYPE = 1500
    private const val MAX_RECORDS_TOTAL = 4000

    private const val HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata"
    private const val ACTION_HEALTH_CONNECT_SETTINGS = "androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"
    private const val HEALTH_DATA_HISTORY_PERMISSION = "android.permission.health.READ_HEALTH_DATA_HISTORY"

    // Claves del resumen que no son métricas: no cuentan para la cobertura.
    private val SUMMARY_NON_METRIC_KEYS = setOf("date", "sources", "metadata", "flags")

    // Tope de páginas al recorrer los cambios: si un proveedor volcó un histórico entero,
    // sale más barato resincronizar que ir paginando miles de cambios.
    private const val MAX_CHANGE_PAGES = 10

    // Tipos cuyos cambios importan porque alimentan alguna métrica visible.
    private val WATCHED_RECORD_TYPES = setOf(
      ActiveCaloriesBurnedRecord::class,
      TotalCaloriesBurnedRecord::class,
      StepsRecord::class,
      DistanceRecord::class,
      ExerciseSessionRecord::class,
      SleepSessionRecord::class,
      HeartRateRecord::class,
      RestingHeartRateRecord::class,
      HeartRateVariabilityRmssdRecord::class,
      BloodGlucoseRecord::class,
      BloodPressureRecord::class,
      WeightRecord::class,
    )
  }
}

private class HealthConnectPermissionsContract :
  AppContextActivityResultContract<ArrayList<String>, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: ArrayList<String>): Intent =
    delegate.createIntent(context, input.toSet())

  override fun parseResult(input: ArrayList<String>, resultCode: Int, intent: Intent?): Set<String> =
    delegate.parseResult(resultCode, intent)
}
