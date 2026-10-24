import ExpoModulesCore
import HealthKit
import UIKit

private struct QuantityMetric {
  let permission: String
  let type: HKQuantityType
  let unit: HKUnit
  let summaryKey: String?
  let recordType: String
  let option: HKStatisticsOptions
}

/** Un permiso de lectura con el tipo de HealthKit que lo respalda. */
private struct ReadPermission {
  let name: String
  let type: HKObjectType
}

/** Lo leído del dispositivo para un rango, más los permisos que HealthKit aún no ha resuelto. */
private struct DeviceRead {
  let summaries: [[String: Any]]
  let records: [[String: Any]]
  let pending: [String]
}

/**
 * HealthKit lanza `errorAuthorizationNotDetermined` al consultar un tipo que el usuario aún no
 * ha resuelto: la hoja de permisos se presentó en blanco y se cerró sola, se interrumpió, o se
 * restauró un backup antes de que Salud terminara de sincronizar con iCloud.
 */
private func isAuthorizationNotDetermined(_ error: Error) -> Bool {
  (error as? HKError)?.code == .errorAuthorizationNotDetermined
}

/**
 * El sueño cuenta para el día en que te despiertas: un tramo que empieza desde las 18:00
 * pertenece al día siguiente. Con fechas locales, sin este desplazamiento una noche se
 * partiría en dos días a medianoche.
 */
private let sleepDayShift: TimeInterval = 6 * 60 * 60

public class FitpilotHealthModule: Module {
  private let healthStore = HKHealthStore()
  private var observerQueries: [HKObserverQuery] = []
  // Arrancar y parar observadores puede llegar a la vez (desde JS y desde `OnDestroy`); sin
  // serializar, `observerQueries` se modificaba desde dos hilos al mismo tiempo.
  private let observerQueue = DispatchQueue(label: "expo.modules.fitpilothealth.observers")

  public func definition() -> ModuleDefinition {
    Name("FitpilotHealth")

    Events("onHealthDataChanged")

    AsyncFunction("isAvailable") { () -> [String: Any] in
      [
        "available": HKHealthStore.isHealthDataAvailable(),
        "platform": "healthkit",
        "status": HKHealthStore.isHealthDataAvailable() ? "available" : "unavailable",
      ]
    }

    AsyncFunction("requestPermissions") { () async throws -> [String: Any] in
      guard HKHealthStore.isHealthDataAvailable() else {
        return self.permissionStatus(granted: [], requestStatus: .unknown)
      }

      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        self.healthStore.requestAuthorization(toShare: [], read: self.readTypes()) { success, error in
          if let error {
            continuation.resume(throwing: error)
            return
          }
          if success {
            continuation.resume()
          } else {
            continuation.resume(throwing: NSError(
              domain: "FitpilotHealth",
              code: 1,
              userInfo: [NSLocalizedDescriptionKey: "HealthKit authorization was not completed."]
            ))
          }
        }
      }

      // `success` solo dice que la petición se procesó, no que el usuario respondiera. Si la
      // hoja se presentó en blanco y se cerró sola, HealthKit sigue respondiendo
      // `.shouldRequest` para esos tipos y salen como pendientes, en vez de darlos por
      // concedidos como hasta ahora.
      return await self.currentPermissionStatus()
    }

    AsyncFunction("getGrantedPermissions") { () async -> [String: Any] in
      guard HKHealthStore.isHealthDataAvailable() else {
        return self.permissionStatus(granted: [], requestStatus: .unknown)
      }
      return await self.currentPermissionStatus()
    }

    // Lectura ligera para pintar la pantalla: agrega el rango y NO sube nada. El dato ya
    // está en el teléfono; hacerle dar la vuelta por el backend antes de enseñarlo es lo
    // que hacía que las métricas se sintieran ajenas a la app. Se salta los registros
    // corporales (peso, grasa, masa magra), que no alimentan ninguna tarjeta del resumen.
    AsyncFunction("readSnapshot") { (range: [String: String]) async throws -> [String: Any] in
      guard
        let startInput = range["startAt"],
        let endInput = range["endAt"],
        let startAt = ISO8601DateFormatter.fitpilot.date(from: startInput),
        let endAt = ISO8601DateFormatter.fitpilot.date(from: endInput)
      else {
        throw NSError(
          domain: "FitpilotHealth",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "readSnapshot requires valid startAt and endAt ISO strings."]
        )
      }

      // A diferencia de syncRange, aquí no se lanza por falta de disponibilidad: el
      // snapshot es una optimización de render y la pantalla debe seguir su curso con lo
      // que venga del backend.
      guard HKHealthStore.isHealthDataAvailable() else {
        return [
          "platform": "healthkit",
          "from_at": ISO8601DateFormatter.fitpilot.string(from: startAt),
          "to_at": ISO8601DateFormatter.fitpilot.string(from: endAt),
          "permissions": [String](),
          "daily_summaries": [[String: Any]](),
        ]
      }

      let read = try await self.readDevice(startAt: startAt, endAt: endAt, includeBodyRecords: false)

      return [
        "platform": "healthkit",
        "from_at": ISO8601DateFormatter.fitpilot.string(from: startAt),
        "to_at": ISO8601DateFormatter.fitpilot.string(from: endAt),
        "permissions": self.permissionNames().filter { !read.pending.contains($0) },
        "daily_summaries": read.summaries,
        "metadata": [
          "read_mode": "snapshot",
          "pending_permissions": read.pending,
        ],
      ]
    }

    AsyncFunction("syncRange") { (range: [String: String]) async throws -> [String: Any] in
      guard HKHealthStore.isHealthDataAvailable() else {
        throw NSError(
          domain: "FitpilotHealth",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "HealthKit is not available on this device."]
        )
      }
      guard
        let startInput = range["startAt"],
        let endInput = range["endAt"],
        let startAt = ISO8601DateFormatter.fitpilot.date(from: startInput),
        let endAt = ISO8601DateFormatter.fitpilot.date(from: endInput)
      else {
        throw NSError(
          domain: "FitpilotHealth",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "syncRange requires valid startAt and endAt ISO strings."]
        )
      }

      let read = try await self.readDevice(startAt: startAt, endAt: endAt, includeBodyRecords: true)

      return [
        "platform": "healthkit",
        "from_at": ISO8601DateFormatter.fitpilot.string(from: startAt),
        "to_at": ISO8601DateFormatter.fitpilot.string(from: endAt),
        // Solo los tipos que se pudieron leer: si no queda ninguno, la capa JS corta antes
        // de subir nada. Los pendientes viajan en metadata y quedan en el sync run.
        "permissions": self.permissionNames().filter { !read.pending.contains($0) },
        "records": read.records,
        "daily_summaries": read.summaries,
        "metadata": [
          "sync_granularity": "daily",
          "read_mode": "foreground",
          "pending_permissions": read.pending,
        ],
      ]
    }

    /**
     * Se suscribe a los cambios de HealthKit. A partir de aquí la app no tiene que
     * preguntar: iOS avisa en cuanto el reloj o el iPhone escriben una muestra nueva, así
     * que la pantalla se pone al día sola mientras está abierta.
     *
     * Solo con la app abierta: despertarla en segundo plano requiere el entitlement
     * `com.apple.developer.healthkit.background-delivery`, que la app no tiene. Al volver a
     * primer plano la pantalla relee el dispositivo de todas formas.
     */
    AsyncFunction("startObservingChanges") { () -> Bool in
      guard HKHealthStore.isHealthDataAvailable() else {
        return false
      }

      return self.observerQueue.sync { () -> Bool in
        self.stopObservingLocked()

        for type in self.observedSampleTypes() {
          let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
            // El completionHandler debe invocarse SIEMPRE, también en error: si no, iOS deja
            // de entregar cambios para ese tipo durante el resto de la sesión.
            defer { completionHandler() }
            guard error == nil, let self else {
              return
            }
            self.sendEvent("onHealthDataChanged", ["types": [type.identifier]])
          }

          self.healthStore.execute(query)
          self.observerQueries.append(query)
        }

        return !self.observerQueries.isEmpty
      }
    }

    AsyncFunction("stopObservingChanges") { () -> Void in
      self.observerQueue.sync {
        self.stopObservingLocked()
      }
    }

    // HealthKit no usa el modelo de token de Health Connect: aquí los cambios llegan por
    // push con el observador de arriba, que es estrictamente mejor. Se mantiene el método
    // para que el contrato sea el mismo en ambas plataformas.
    AsyncFunction("getChangesToken") { () -> String? in
      nil
    }

    AsyncFunction("getChanges") { (_: String) -> [String: Any] in
      [
        "dates": [String](),
        "nextToken": NSNull(),
        "expired": true,
        "requiresFullSync": false,
      ]
    }

    OnDestroy {
      self.observerQueue.sync {
        self.stopObservingLocked()
      }
    }

    AsyncFunction("openSettings") { () -> Void in
      if let url = URL(string: UIApplication.openSettingsURLString) {
        DispatchQueue.main.async {
          UIApplication.shared.open(url)
        }
      }
    }
  }

  private func permissionStatus(
    granted: [String],
    requestStatus: HKAuthorizationRequestStatus
  ) -> [String: Any] {
    let allPermissions = permissionNames()
    let missing = allPermissions.filter { !granted.contains($0) }
    return [
      "platform": "healthkit",
      "granted": granted,
      "missing": missing,
      "requiresManualGrant": false,
      "requestStatus": requestStatus.fitpilotName,
    ]
  }

  /**
   * Lo que HealthKit sí deja saber de los permisos de lectura: a qué tipos ya se le preguntó
   * al usuario. Si concedió o negó sigue siendo privado (una lectura negada solo devuelve
   * vacío), así que en iOS `granted` significa "ya respondido". Lo inequívoco es un tipo que
   * sigue en `.shouldRequest` después de pedir permiso: la hoja no se aplicó, y ese tipo va a
   * `missing`.
   */
  private func currentPermissionStatus() async -> [String: Any] {
    let overall = await requestStatus(read: readTypes())
    guard overall == .shouldRequest else {
      return permissionStatus(granted: permissionNames(), requestStatus: overall)
    }

    // Solo cuando falta algo se pregunta tipo a tipo, para poder decir cuáles.
    var pending: [String] = []
    for permission in readPermissions() {
      if await requestStatus(read: [permission.type]) == .shouldRequest {
        pending.append(permission.name)
      }
    }
    return permissionStatus(
      granted: permissionNames().filter { !pending.contains($0) },
      requestStatus: overall
    )
  }

  private func requestStatus(read types: Set<HKObjectType>) async -> HKAuthorizationRequestStatus {
    await withCheckedContinuation { (continuation: CheckedContinuation<HKAuthorizationRequestStatus, Never>) in
      healthStore.getRequestStatusForAuthorization(toShare: [], read: types) { status, error in
        continuation.resume(returning: error == nil ? status : .unknown)
      }
    }
  }

  /** Tipos cuyos cambios merece la pena vigilar: los que alimentan alguna tarjeta. */
  private func observedSampleTypes() -> [HKSampleType] {
    var types: [HKSampleType] = quantityMetrics().map { $0.type as HKSampleType }
    if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      types.append(sleep)
    }
    types.append(HKObjectType.workoutType())
    return types
  }

  /** Solo dentro de `observerQueue`. */
  private func stopObservingLocked() {
    for query in observerQueries {
      healthStore.stop(query)
    }
    observerQueries = []
  }

  /** Única lista de permisos de lectura: `permissionNames` y `readTypes` salen de aquí. */
  private func readPermissions() -> [ReadPermission] {
    var permissions = quantityMetrics().map { ReadPermission(name: $0.permission, type: $0.type) }
    permissions.append(ReadPermission(name: "workouts", type: HKObjectType.workoutType()))
    if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      permissions.append(ReadPermission(name: "sleep", type: sleep))
    }
    return permissions
  }

  private func permissionNames() -> [String] {
    readPermissions().map { $0.name }
  }

  private func readTypes() -> Set<HKObjectType> {
    Set(readPermissions().map { $0.type })
  }

  private func quantityMetrics() -> [QuantityMetric] {
    var metrics: [QuantityMetric] = []
    func append(
      _ identifier: HKQuantityTypeIdentifier,
      permission: String,
      unit: HKUnit,
      summaryKey: String?,
      recordType: String,
      option: HKStatisticsOptions = .cumulativeSum
    ) {
      if let type = HKObjectType.quantityType(forIdentifier: identifier) {
        metrics.append(QuantityMetric(
          permission: permission,
          type: type,
          unit: unit,
          summaryKey: summaryKey,
          recordType: recordType,
          option: option
        ))
      }
    }

    append(.activeEnergyBurned, permission: "active_energy", unit: .kilocalorie(), summaryKey: "active_energy_kcal", recordType: "active_energy")
    append(.basalEnergyBurned, permission: "basal_energy", unit: .kilocalorie(), summaryKey: "basal_energy_kcal", recordType: "basal_energy")
    append(.stepCount, permission: "steps", unit: .count(), summaryKey: "steps", recordType: "steps")
    append(.distanceWalkingRunning, permission: "distance", unit: .meter(), summaryKey: "distance_m", recordType: "distance")
    append(.appleExerciseTime, permission: "exercise_minutes", unit: .minute(), summaryKey: "exercise_minutes", recordType: "exercise_minutes")
    append(.heartRate, permission: "heart_rate", unit: HKUnit.count().unitDivided(by: .minute()), summaryKey: "avg_hr_bpm", recordType: "heart_rate", option: .discreteAverage)
    append(.restingHeartRate, permission: "resting_heart_rate", unit: HKUnit.count().unitDivided(by: .minute()), summaryKey: "resting_hr_bpm", recordType: "resting_heart_rate", option: .discreteAverage)
    append(.heartRateVariabilitySDNN, permission: "heart_rate_variability", unit: .secondUnit(with: .milli), summaryKey: "hrv_ms", recordType: "heart_rate_variability", option: .discreteAverage)
    append(.bloodGlucose, permission: "glucose", unit: HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci)), summaryKey: "glucose_avg_mg_dl", recordType: "glucose", option: .discreteAverage)
    append(.bloodPressureSystolic, permission: "blood_pressure_systolic", unit: .millimeterOfMercury(), summaryKey: "systolic_avg_mmhg", recordType: "blood_pressure", option: .discreteAverage)
    append(.bloodPressureDiastolic, permission: "blood_pressure_diastolic", unit: .millimeterOfMercury(), summaryKey: "diastolic_avg_mmhg", recordType: "blood_pressure", option: .discreteAverage)
    append(.bodyMass, permission: "weight", unit: .gramUnit(with: .kilo), summaryKey: nil, recordType: "weight", option: .discreteAverage)
    append(.bodyFatPercentage, permission: "body_fat", unit: .percent(), summaryKey: nil, recordType: "body_fat", option: .discreteAverage)
    append(.leanBodyMass, permission: "lean_body_mass", unit: .gramUnit(with: .kilo), summaryKey: nil, recordType: "lean_body_mass", option: .discreteAverage)
    return metrics
  }

  private func readDevice(
    startAt: Date,
    endAt: Date,
    includeBodyRecords: Bool
  ) async throws -> DeviceRead {
    var pending: [String] = []
    let quantitySummaries = try await queryDailyQuantitySummaries(
      startAt: startAt,
      endAt: endAt,
      pending: &pending
    )
    let sleepRecords = try await readSkippingUndetermined("sleep", pending: &pending, {
      try await self.querySleepRecords(startAt: startAt, endAt: endAt)
    }) ?? []
    let workoutRecords = try await readSkippingUndetermined("workouts", pending: &pending, {
      try await self.queryWorkoutRecords(startAt: startAt, endAt: endAt)
    }) ?? []
    var bodyRecords: [[String: Any]] = []
    if includeBodyRecords {
      bodyRecords = try await queryBodyRecords(startAt: startAt, endAt: endAt, pending: &pending)
    }

    return DeviceRead(
      summaries: mergeSummaries(quantitySummaries, records: sleepRecords + workoutRecords),
      records: sleepRecords + workoutRecords + bodyRecords,
      pending: pending
    )
  }

  /**
   * Lee un tipo y, si HealthKit responde que ese tipo sigue sin resolver, lo anota en `pending`
   * y devuelve `nil` en vez de lanzar. Antes un solo tipo pendiente tumbaba la lectura entera y
   * no se subía nada, ni siquiera lo que el usuario sí había concedido. Cualquier otro error
   * (p. ej. el iPhone bloqueado) se sigue propagando: ahí fallan todos los tipos por igual y
   * toca reintentar más tarde.
   */
  private func readSkippingUndetermined<T>(
    _ permission: String,
    pending: inout [String],
    _ read: () async throws -> T
  ) async throws -> T? {
    do {
      return try await read()
    } catch let error where isAuthorizationNotDetermined(error) {
      pending.append(permission)
      return nil
    }
  }

  private func queryDailyQuantitySummaries(
    startAt: Date,
    endAt: Date,
    pending: inout [String]
  ) async throws -> [[String: Any]] {
    var summaries: [String: [String: Any]] = [:]
    for metric in quantityMetrics().filter({ $0.summaryKey != nil }) {
      guard let rows = try await readSkippingUndetermined(metric.permission, pending: &pending, {
        try await self.queryDailyStatistics(metric: metric, startAt: startAt, endAt: endAt)
      }) else {
        continue
      }
      for row in rows {
        guard let date = row["date"] as? String else { continue }
        var summary = summaries[date] ?? ["date": date, "sources": ["Apple Health"]]
        if let key = metric.summaryKey {
          summary[key] = row["value"]
        }
        summaries[date] = summary
      }
    }
    return summaries.values.sorted {
      (($0["date"] as? String) ?? "") < (($1["date"] as? String) ?? "")
    }
  }

  private func queryDailyStatistics(
    metric: QuantityMetric,
    startAt: Date,
    endAt: Date
  ) async throws -> [[String: Any]] {
    try await withCheckedThrowingContinuation { continuation in
      let calendar = Calendar(identifier: .gregorian)
      let anchor = calendar.startOfDay(for: startAt)
      let predicate = HKQuery.predicateForSamples(withStart: startAt, end: endAt, options: [.strictStartDate])
      let query = HKStatisticsCollectionQuery(
        quantityType: metric.type,
        quantitySamplePredicate: predicate,
        options: metric.option,
        anchorDate: anchor,
        intervalComponents: DateComponents(day: 1)
      )
      query.initialResultsHandler = { _, collection, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        var rows: [[String: Any]] = []
        collection?.enumerateStatistics(from: startAt, to: endAt) { statistics, _ in
          let quantity = metric.option == .cumulativeSum
            ? statistics.sumQuantity()
            : statistics.averageQuantity()
          guard let quantity else { return }
          rows.append([
            "date": ISO8601DateFormatter.dateOnly.string(from: statistics.startDate),
            "value": quantity.doubleValue(for: metric.unit),
          ])
        }
        continuation.resume(returning: rows)
      }
      self.healthStore.execute(query)
    }
  }

  private func querySleepRecords(startAt: Date, endAt: Date) async throws -> [[String: Any]] {
    guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      return []
    }
    let samples = try await querySamples(sampleType: sleepType, startAt: startAt, endAt: endAt) as? [HKCategorySample] ?? []
    return samples
      .filter { sample in
        if #available(iOS 16.0, *) {
          return [
            HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
            HKCategoryValueSleepAnalysis.asleepCore.rawValue,
            HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
            HKCategoryValueSleepAnalysis.asleepREM.rawValue,
          ].contains(sample.value)
        }
        return sample.value == HKCategoryValueSleepAnalysis.asleep.rawValue
      }
      .map { sample in
        [
          "type": "sleep_session",
          "start_at": ISO8601DateFormatter.fitpilot.string(from: sample.startDate),
          "end_at": ISO8601DateFormatter.fitpilot.string(from: sample.endDate),
          "source_name": sample.sourceRevision.source.name,
          "metadata": ["healthkit_category_value": sample.value],
        ]
      }
  }

  private func queryWorkoutRecords(startAt: Date, endAt: Date) async throws -> [[String: Any]] {
    let samples = try await querySamples(sampleType: HKObjectType.workoutType(), startAt: startAt, endAt: endAt) as? [HKWorkout] ?? []
    return samples.map { workout in
      [
        "type": "workout",
        "start_at": ISO8601DateFormatter.fitpilot.string(from: workout.startDate),
        "end_at": ISO8601DateFormatter.fitpilot.string(from: workout.endDate),
        "value": workout.duration / 60.0,
        "unit": "minutes",
        "source_name": workout.sourceRevision.source.name,
        "external_id": workout.uuid.uuidString,
        "metadata": [
          "activity_type": workout.workoutActivityType.rawValue,
          "active_energy_kcal": workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) as Any,
          "distance_m": workout.totalDistance?.doubleValue(for: .meter()) as Any,
        ],
      ]
    }
  }

  private func queryBodyRecords(
    startAt: Date,
    endAt: Date,
    pending: inout [String]
  ) async throws -> [[String: Any]] {
    var records: [[String: Any]] = []
    for metric in quantityMetrics().filter({ $0.summaryKey == nil }) {
      guard let samples = try await readSkippingUndetermined(metric.permission, pending: &pending, {
        () async throws -> [HKQuantitySample] in
        try await self.querySamples(sampleType: metric.type, startAt: startAt, endAt: endAt) as? [HKQuantitySample] ?? []
      }) else {
        continue
      }
      records.append(contentsOf: samples.map { sample in
        [
          "type": metric.recordType,
          "start_at": ISO8601DateFormatter.fitpilot.string(from: sample.startDate),
          "end_at": ISO8601DateFormatter.fitpilot.string(from: sample.endDate),
          "value": sample.quantity.doubleValue(for: metric.unit),
          "unit": metric.permission == "body_fat" ? "pct" : "kg",
          "source_name": sample.sourceRevision.source.name,
          "external_id": sample.uuid.uuidString,
        ]
      })
    }
    return records
  }

  private func querySamples(sampleType: HKSampleType, startAt: Date, endAt: Date) async throws -> [HKSample] {
    try await withCheckedThrowingContinuation { continuation in
      let predicate = HKQuery.predicateForSamples(withStart: startAt, end: endAt, options: [.strictStartDate])
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
      let query = HKSampleQuery(sampleType: sampleType, predicate: predicate, limit: 500, sortDescriptors: [sort]) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: samples ?? [])
      }
      self.healthStore.execute(query)
    }
  }

  private func mergeSummaries(_ summaries: [[String: Any]], records: [[String: Any]]) -> [[String: Any]] {
    var byDate = Dictionary(uniqueKeysWithValues: summaries.compactMap { summary -> (String, [String: Any])? in
      guard let date = summary["date"] as? String else { return nil }
      return (date, summary)
    })
    for record in records {
      guard
        let start = record["start_at"] as? String,
        let startDate = ISO8601DateFormatter.fitpilot.date(from: start)
      else { continue }
      let isSleep = record["type"] as? String == "sleep_session"
      let date = ISO8601DateFormatter.dateOnly.string(
        from: isSleep ? startDate.addingTimeInterval(sleepDayShift) : startDate
      )
      var summary = byDate[date] ?? ["date": date, "sources": ["Apple Health"]]
      if isSleep,
         let end = record["end_at"] as? String,
         let endDate = ISO8601DateFormatter.fitpilot.date(from: end) {
        let minutes = Int(max(0, endDate.timeIntervalSince(startDate) / 60.0))
        summary["sleep_minutes"] = (summary["sleep_minutes"] as? Int ?? 0) + minutes
      }
      if record["type"] as? String == "workout" {
        summary["exercise_minutes"] = (summary["exercise_minutes"] as? Int ?? 0) + Int(record["value"] as? Double ?? 0)
      }
      byDate[date] = summary
    }
    return byDate.values.sorted {
      (($0["date"] as? String) ?? "") < (($1["date"] as? String) ?? "")
    }
  }
}

private extension HKAuthorizationRequestStatus {
  /** El nombre que viaja a JS en `FitpilotHealthPermissionStatus.requestStatus`. */
  var fitpilotName: String {
    switch self {
    case .shouldRequest:
      return "shouldRequest"
    case .unnecessary:
      return "unnecessary"
    case .unknown:
      return "unknown"
    @unknown default:
      return "unknown"
    }
  }
}

private extension ISO8601DateFormatter {
  static let fitpilot: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  // Días en la zona horaria del iPhone. En GMT (el valor por defecto) todo lo que empezaba
  // después de las 18:00 hora de México caía en el día siguiente, y la tarjeta mostraba
  // "mañana" como el día más reciente.
  static let dateOnly: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]
    formatter.timeZone = TimeZone.autoupdatingCurrent
    return formatter
  }()
}
