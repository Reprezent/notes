#ifndef TRACER_FFI_H
#define TRACER_FFI_H

#include <stddef.h>
#include <stdint.h>

typedef struct TraceOptionsFfi {
  uint8_t threshold;
  uint8_t sensitivity;
  uint8_t turn_policy;
  uint8_t optimize_curve;
  uint32_t speckle_min_area;
  float corner_threshold;
  uint32_t max_path_count;
  uint32_t max_output_bytes;
} TraceOptionsFfi;

typedef struct TraceResultFfi {
  int32_t status;
  char *data;
  size_t data_len;
} TraceResultFfi;

enum TraceStatus {
  TRACE_INVALID_DIMENSIONS = 1,
  TRACE_INVALID_INPUT = 2,
  TRACE_RESOURCE_LIMIT = 3,
  TRACE_INVALID_OPTIONS = 4,
  TRACE_NOT_IMPLEMENTED = 5,
  TRACE_ENGINE_FAILURE = 6,
};

TraceResultFfi trace_mask(
    const uint8_t *pixels,
    size_t pixels_len,
    int32_t width,
    int32_t height,
    TraceOptionsFfi options);
void free_trace_result(TraceResultFfi result);
const char *trace_core_version(void);

#endif
