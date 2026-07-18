package expo.modules.localvectorizer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

private class TraceOptions : Record {
  @Field
  var threshold = 0

  @Field
  var sensitivity = 0

  @Field
  var speckleMinArea = 0

  @Field
  var turnPolicy = 0

  @Field
  var cornerThreshold = 0f

  @Field
  var optimizeCurve = false

  @Field
  var maxPathCount = 0

  @Field
  var maxOutputBytes = 0
}

private class TraceEngine {
  external fun traceMask(
    pixels: ByteArray,
    width: Int,
    height: Int,
    threshold: Int,
    sensitivity: Int,
    speckleMinArea: Int,
    turnPolicy: Int,
    cornerThreshold: Float,
    optimizeCurve: Boolean,
    maxPathCount: Int,
    maxOutputBytes: Int,
  ): String

  external fun coreVersion(): String

  companion object {
    init {
      System.loadLibrary("expo_local_vectorizer")
    }
  }
}

class ExpoLocalVectorizerModule : Module() {
  private val traceEngine = TraceEngine()

  override fun definition() = ModuleDefinition {
    Name("ExpoLocalVectorizer")

    Function("coreVersion") {
      traceEngine.coreVersion()
    }

    AsyncFunction("traceMaskAsync") {
        pixels: ByteArray,
        width: Int,
        height: Int,
        options: TraceOptions,
      ->
      traceEngine.traceMask(
        pixels,
        width,
        height,
        options.threshold,
        options.sensitivity,
        options.speckleMinArea,
        options.turnPolicy,
        options.cornerThreshold,
        options.optimizeCurve,
        options.maxPathCount,
        options.maxOutputBytes,
      )
    }
  }
}
