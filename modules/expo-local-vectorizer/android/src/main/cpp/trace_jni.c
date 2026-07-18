#include <jni.h>
#include <stdio.h>

#include "tracer_ffi.h"

static const char *error_code(int32_t status) {
  switch (status) {
    case TRACE_INVALID_DIMENSIONS:
      return "TRACE_INVALID_DIMENSIONS";
    case TRACE_INVALID_INPUT:
      return "TRACE_INVALID_INPUT";
    case TRACE_RESOURCE_LIMIT:
      return "TRACE_RESOURCE_LIMIT";
    case TRACE_INVALID_OPTIONS:
      return "TRACE_INVALID_OPTIONS";
    case TRACE_NOT_IMPLEMENTED:
      return "TRACE_NOT_IMPLEMENTED";
    default:
      return "TRACE_ENGINE_FAILURE";
  }
}

static jstring error_json(JNIEnv *env, int32_t status) {
  const char *code = error_code(status);
  char json[128];
  snprintf(json, sizeof(json), "{\"code\":\"%s\"}", code);
  return (*env)->NewStringUTF(env, json);
}

JNIEXPORT jstring JNICALL
Java_expo_modules_localvectorizer_TraceEngine_traceMask(
    JNIEnv *env,
    jobject thiz,
    jbyteArray pixels,
    jint width,
    jint height,
    jint threshold,
    jint sensitivity,
    jint speckle_min_area,
    jint turn_policy,
    jfloat corner_threshold,
    jboolean optimize_curve,
    jint max_path_count,
    jint max_output_bytes) {
  (void)thiz;
  if (pixels == NULL) {
    return error_json(env, TRACE_INVALID_INPUT);
  }

  const jsize pixels_len = (*env)->GetArrayLength(env, pixels);
  jbyte *pixel_bytes = (*env)->GetByteArrayElements(env, pixels, NULL);
  if (pixel_bytes == NULL) {
    return error_json(env, TRACE_ENGINE_FAILURE);
  }

  const TraceOptionsFfi options = {
      .threshold = (uint8_t)threshold,
      .sensitivity = (uint8_t)sensitivity,
      .turn_policy = (uint8_t)turn_policy,
      .optimize_curve = optimize_curve ? 1 : 0,
      .speckle_min_area = (uint32_t)speckle_min_area,
      .corner_threshold = corner_threshold,
      .max_path_count = (uint32_t)max_path_count,
      .max_output_bytes = (uint32_t)max_output_bytes,
  };
  const TraceResultFfi result =
      trace_mask((const uint8_t *)pixel_bytes, (size_t)pixels_len, width, height, options);
  (*env)->ReleaseByteArrayElements(env, pixels, pixel_bytes, JNI_ABORT);

  if (result.status != 0 || result.data == NULL) {
    return error_json(env, result.status);
  }

  jstring json = (*env)->NewStringUTF(env, result.data);
  free_trace_result(result);
  return json;
}

JNIEXPORT jstring JNICALL
Java_expo_modules_localvectorizer_TraceEngine_coreVersion(JNIEnv *env, jobject thiz) {
  (void)thiz;
  return (*env)->NewStringUTF(env, trace_core_version());
}
