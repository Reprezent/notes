cmake_minimum_required(VERSION 3.22.1)
project(expo_local_vectorizer LANGUAGES C)

add_library(tracer_ffi STATIC IMPORTED)
set_target_properties(tracer_ffi PROPERTIES
  IMPORTED_LOCATION
  "${CMAKE_CURRENT_LIST_DIR}/../artifacts/android/${ANDROID_ABI}/libtracer_ffi.a"
)

add_library(expo_local_vectorizer SHARED src/main/cpp/trace_jni.c)
target_include_directories(expo_local_vectorizer PRIVATE
  "${CMAKE_CURRENT_LIST_DIR}/../../../crates/tracer-ffi/include"
)
target_link_libraries(expo_local_vectorizer PRIVATE tracer_ffi android dl log m)
