use core::ffi::c_char;
use core::ptr;
use std::ffi::CString;
use tracer_core::{TraceError, TraceOptions, TurnPolicy};

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct TraceOptionsFfi {
    pub threshold: u8,
    pub sensitivity: u8,
    pub turn_policy: u8,
    pub optimize_curve: u8,
    pub speckle_min_area: u32,
    pub corner_threshold: f32,
    pub max_path_count: u32,
    pub max_output_bytes: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct TraceResultFfi {
    pub status: i32,
    pub data: *mut c_char,
    pub data_len: usize,
}

impl TraceResultFfi {
    const fn error(error: TraceError) -> Self {
        Self {
            status: status_code(error),
            data: ptr::null_mut(),
            data_len: 0,
        }
    }

    fn success(json: String) -> Result<Self, TraceError> {
        let data = CString::new(json).map_err(|_| TraceError::EngineFailure)?;
        let data_len = data.as_bytes().len();
        Ok(Self {
            status: 0,
            data: data.into_raw(),
            data_len,
        })
    }
}

const fn status_code(error: TraceError) -> i32 {
    match error {
        TraceError::InvalidDimensions => 1,
        TraceError::InvalidInputLength => 2,
        TraceError::ResourceLimit => 3,
        TraceError::InvalidOptions => 4,
        TraceError::NotImplemented => 5,
        TraceError::EngineFailure => 6,
    }
}

fn options_from_ffi(options: TraceOptionsFfi) -> Result<TraceOptions, TraceError> {
    if options.optimize_curve > 1 {
        return Err(TraceError::InvalidOptions);
    }

    Ok(TraceOptions {
        threshold: options.threshold,
        sensitivity: options.sensitivity,
        speckle_min_area: options.speckle_min_area,
        turn_policy: TurnPolicy::try_from(options.turn_policy)?,
        corner_threshold: options.corner_threshold,
        optimize_curve: options.optimize_curve == 1,
        max_path_count: options.max_path_count,
        max_output_bytes: options.max_output_bytes,
    })
}

fn trace_mask_impl(
    pixels: Option<&[u8]>,
    width: i32,
    height: i32,
    options: TraceOptionsFfi,
) -> Result<TraceResultFfi, TraceError> {
    let options = match options_from_ffi(options) {
        Ok(options) => options,
        Err(error) => return Err(error),
    };
    let width = match u32::try_from(width) {
        Ok(width) => width,
        Err(_) => return Err(TraceError::InvalidDimensions),
    };
    let height = match u32::try_from(height) {
        Ok(height) => height,
        Err(_) => return Err(TraceError::InvalidDimensions),
    };
    let pixels = pixels.ok_or(TraceError::InvalidInputLength)?;
    let output = tracer_core::trace_mask(pixels, width, height, &options)?;
    let json = serde_json::to_string(&output).map_err(|_| TraceError::EngineFailure)?;
    TraceResultFfi::success(json)
}

/// The caller owns a contiguous binary mask whose readable byte length is
/// supplied explicitly. Successful UTF-8 JSON results must be freed once.
#[unsafe(no_mangle)]
pub extern "C" fn trace_mask(
    pixels: *const u8,
    pixels_len: usize,
    width: i32,
    height: i32,
    options: TraceOptionsFfi,
) -> TraceResultFfi {
    let pixels = if pixels.is_null() {
        None
    } else {
        // SAFETY: the ABI contract requires this pointer to be readable for
        // `pixels_len` bytes for the duration of the call.
        Some(unsafe { core::slice::from_raw_parts(pixels, pixels_len) })
    };
    match trace_mask_impl(pixels, width, height, options) {
        Ok(result) => result,
        Err(error) => TraceResultFfi::error(error),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn free_trace_result(result: TraceResultFfi) {
    if !result.data.is_null() {
        // SAFETY: successful results originate from `CString::into_raw`, and
        // callers must release each result at most once.
        drop(unsafe { CString::from_raw(result.data) });
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn trace_core_version() -> *const c_char {
    concat!(env!("CARGO_PKG_VERSION"), "\0").as_ptr().cast()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options() -> TraceOptionsFfi {
        TraceOptionsFfi {
            threshold: 128,
            sensitivity: 50,
            turn_policy: 2,
            optimize_curve: 1,
            speckle_min_area: 1,
            corner_threshold: 0.2,
            max_path_count: 1,
            max_output_bytes: 1_024,
        }
    }

    #[test]
    fn serializes_a_successful_trace() {
        let pixels = [0, 1, 1, 0];
        let result = trace_mask_impl(Some(&pixels), 2, 2, options()).unwrap();
        assert_eq!(result.status, 0);
        assert!(!result.data.is_null());
        free_trace_result(result);
    }

    #[test]
    fn maps_invalid_ffi_values_to_stable_errors() {
        assert_eq!(
            trace_mask_impl(None, 2, 2, options()).unwrap_err(),
            TraceError::InvalidInputLength
        );
        assert_eq!(
            trace_mask_impl(Some(&[1]), -1, 2, options()).unwrap_err(),
            TraceError::InvalidDimensions
        );
        assert_eq!(
            trace_mask_impl(
                Some(&[0, 1, 1, 0]),
                2,
                2,
                TraceOptionsFfi {
                    turn_policy: 9,
                    ..options()
                }
            )
            .unwrap_err(),
            TraceError::InvalidOptions
        );
    }
}
