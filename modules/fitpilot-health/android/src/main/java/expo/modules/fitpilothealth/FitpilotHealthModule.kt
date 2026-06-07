package expo.modules.fitpilothealth

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
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
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.coroutines.resume
import kotlin.reflect.KClass

class FitpilotHealthModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private lateinit var permissionsLauncher: AppContextActivityResultLauncher<ArrayList<String>, Set<String>>

  private val requiredPermissions = setOf(
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

  override fun definition() = ModuleDefinition {
    Name("FitpilotHealth")

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

    AsyncFunction("syncRange") Coroutine { range: Map<String, String> ->
      val startAt = Instant.parse(range["startAt"] ?: error("startAt is required"))
      val endAt = Instant.parse(range["endAt"] ?: error("endAt is required"))
      val granted = grantedPermissions()
      val missing = requiredPermissions.minus(granted)

      val summaries = queryDailySummaries(startAt, endAt, granted)
      val records = queryRecords(startAt, endAt, granted)
      mapOf(
        "platform" to "health_connect",
        "from_at" to startAt.toString(),
        "to_at" to endAt.toString(),
        "permissions" to granted.toList(),
        "records" to records,
        "daily_summaries" to summaries,
        "metadata" to mapOf(
          "missing_permissions" to missing.toList(),
          "sync_granularity" to "daily",
          "read_mode" to "foreground",
          "android_sdk" to Build.VERSION.SDK_INT,
        ),
      )
    }

    AsyncFunction("openSettings") Coroutine { ->
      openHealthConnectSettings()
    }

    RegisterActivityContracts {
      permissionsLauncher = registerForActivityResult(HealthConnectPermissionsContract())
    }
  }

  private fun availability(): Map<String, Any?> {
    val status = HealthConnectClient.getSdkStatus(context)
    return when (status) {
      HealthConnectClient.SDK_AVAILABLE -> mapOf(
        "available" to true,
        "platform" to "health_connect",
        "status" to "available",
      )
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> mapOf(
        "available" to false,
        "platform" to "health_connect",
        "status" to "needs_install",
        "message" to "Health Connect needs to be installed or updated.",
      )
      else -> mapOf(
        "available" to false,
        "platform" to "health_connect",
        "status" to "unavailable",
      )
    }
  }

  private suspend fun grantedPermissions(): Set<String> = withContext(Dispatchers.IO) {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
      return@withContext emptySet()
    }
    HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
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

    if (Build.VERSION.SDK_INT >= 34) {
      requestPlatformHealthPermissions(missing.toTypedArray())
      return
    }

    permissionsLauncher.launch(ArrayList(missing))
  }

  private suspend fun requestPlatformHealthPermissions(permissions: Array<String>) {
    val permissionsManager = appContext.permissions
      ?: throw Exceptions.PermissionsModuleNotFound()

    suspendCancellableCoroutine { continuation ->
      permissionsManager.askForPermissions({ _ ->
        if (continuation.isActive) {
          continuation.resume(Unit)
        }
      }, *permissions)
    }
  }

  private fun openHealthConnectSettings() {
    val intent = Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS").apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      context.startActivity(intent)
    } catch (_: Exception) {
      context.startActivity(
        Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }

  private suspend fun queryDailySummaries(
    startAt: Instant,
    endAt: Instant,
    granted: Set<String>,
  ): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    val client = HealthConnectClient.getOrCreate(context)
    val zone = ZoneId.systemDefault()
    val startDate = LocalDate.ofInstant(startAt, zone)
    val endDate = LocalDate.ofInstant(endAt.minusMillis(1), zone)
    val summaries = mutableListOf<Map<String, Any?>>()
    var cursor = startDate

    while (!cursor.isAfter(endDate)) {
      val dayStart = cursor.atStartOfDay(zone).toInstant()
      val dayEnd = cursor.plusDays(1).atStartOfDay(zone).toInstant()
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

      if (metrics.isEmpty()) {
        summaries.add(
          mapOf(
            "date" to cursor.format(DateTimeFormatter.ISO_LOCAL_DATE),
            "sources" to listOf("Health Connect"),
          )
        )
        cursor = cursor.plusDays(1)
        continue
      }

      val result = client.aggregate(
        AggregateRequest(
          metrics = metrics,
          timeRangeFilter = TimeRangeFilter.between(
            maxOf(dayStart, startAt),
            minOf(dayEnd, endAt),
          ),
        )
      )

      summaries.add(
        mapOf(
          "date" to cursor.format(DateTimeFormatter.ISO_LOCAL_DATE),
          "active_energy_kcal" to result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories,
          "basal_energy_kcal" to result[BasalMetabolicRateRecord.BASAL_CALORIES_TOTAL]?.inKilocalories,
          "total_energy_kcal" to result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories,
          "steps" to result[StepsRecord.COUNT_TOTAL],
          "distance_m" to result[DistanceRecord.DISTANCE_TOTAL]?.inMeters,
          "sleep_minutes" to result[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMinutes(),
          "exercise_minutes" to result[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes(),
          "avg_hr_bpm" to result[HeartRateRecord.BPM_AVG],
          "resting_hr_bpm" to result[RestingHeartRateRecord.BPM_AVG],
          "systolic_avg_mmhg" to result[BloodPressureRecord.SYSTOLIC_AVG]?.inMillimetersOfMercury,
          "diastolic_avg_mmhg" to result[BloodPressureRecord.DIASTOLIC_AVG]?.inMillimetersOfMercury,
          "metadata" to mapOf(
            "weight_avg_kg" to result[WeightRecord.WEIGHT_AVG]?.inKilograms,
          ).filterValues { it != null },
          "sources" to listOf("Health Connect"),
        ).filterValues { it != null }
      )
      cursor = cursor.plusDays(1)
    }

    summaries
  }

  private suspend fun queryRecords(
    startAt: Instant,
    endAt: Instant,
    granted: Set<String>,
  ): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    val client = HealthConnectClient.getOrCreate(context)
    val timeRange = TimeRangeFilter.between(startAt, endAt)
    val records = mutableListOf<Map<String, Any?>>()

    if (hasPermission(granted, ExerciseSessionRecord::class)) {
      client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, timeRangeFilter = timeRange))
        .records
        .forEach { record ->
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
      client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, timeRangeFilter = timeRange))
        .records
        .forEach { record ->
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
      client.readRecords(ReadRecordsRequest(WeightRecord::class, timeRangeFilter = timeRange))
        .records
        .forEach { record ->
          records.add(instantRecord("weight", record.time, record.weight.inKilograms, "kg", record.metadata.id, record.metadata.dataOrigin.packageName))
        }
    }

    if (hasPermission(granted, BodyFatRecord::class)) {
      client.readRecords(ReadRecordsRequest(BodyFatRecord::class, timeRangeFilter = timeRange))
        .records
        .forEach { record ->
          records.add(instantRecord("body_fat", record.time, record.percentage.value, "pct", record.metadata.id, record.metadata.dataOrigin.packageName))
        }
    }

    if (hasPermission(granted, LeanBodyMassRecord::class)) {
      client.readRecords(ReadRecordsRequest(LeanBodyMassRecord::class, timeRangeFilter = timeRange))
        .records
        .forEach { record ->
          records.add(instantRecord("lean_body_mass", record.time, record.mass.inKilograms, "kg", record.metadata.id, record.metadata.dataOrigin.packageName))
        }
    }

    if (hasPermission(granted, BloodGlucoseRecord::class)) {
      client.readRecords(ReadRecordsRequest(BloodGlucoseRecord::class, timeRangeFilter = timeRange))
        .records
        .forEach { record ->
          records.add(instantRecord("glucose", record.time, record.level.inMilligramsPerDeciliter, "mg/dL", record.metadata.id, record.metadata.dataOrigin.packageName))
        }
    }

    if (hasPermission(granted, HeartRateVariabilityRmssdRecord::class)) {
      client.readRecords(ReadRecordsRequest(HeartRateVariabilityRmssdRecord::class, timeRangeFilter = timeRange))
        .records
        .forEach { record ->
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
      client.readRecords(ReadRecordsRequest(BloodPressureRecord::class, timeRangeFilter = timeRange))
        .records
        .forEach { record ->
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

    records
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
}

private class HealthConnectPermissionsContract :
  AppContextActivityResultContract<ArrayList<String>, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: ArrayList<String>): Intent =
    delegate.createIntent(context, input.toSet())

  override fun parseResult(input: ArrayList<String>, resultCode: Int, intent: Intent?): Set<String> =
    delegate.parseResult(resultCode, intent)
}
