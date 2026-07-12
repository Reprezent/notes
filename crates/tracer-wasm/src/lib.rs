use serde::{Deserialize, Serialize};
use tracer_core::{TraceError, TraceOptions, TurnPolicy};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmTraceOptions {
    threshold: u8,
    sensitivity: u8,
    speckle_min_area: u32,
    turn_policy: u8,
    corner_threshold: f32,
    optimize_curve: bool,
    max_path_count: u32,
    max_output_bytes: u32,
}

impl TryFrom<WasmTraceOptions> for TraceOptions {
    type Error = TraceError;

    fn try_from(options: WasmTraceOptions) -> Result<Self, Self::Error> {
        Ok(Self {
            threshold: options.threshold,
            sensitivity: options.sensitivity,
            speckle_min_area: options.speckle_min_area,
            turn_policy: TurnPolicy::try_from(options.turn_policy)?,
            corner_threshold: options.corner_threshold,
            optimize_curve: options.optimize_curve,
            max_path_count: options.max_path_count,
            max_output_bytes: options.max_output_bytes,
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WasmError {
    code: &'static str,
    message: &'static str,
    core_version: &'static str,
}

fn error_value(error: TraceError) -> JsValue {
    serde_wasm_bindgen::to_value(&WasmError {
        code: error.code(),
        message: error.code(),
        core_version: tracer_core::CORE_VERSION,
    })
    .unwrap_or_else(|_| JsValue::from_str(error.code()))
}

#[wasm_bindgen(js_name = coreVersion)]
pub fn core_version() -> String {
    tracer_core::CORE_VERSION.to_owned()
}

#[wasm_bindgen(js_name = traceMask)]
pub fn trace_mask(
    pixels: &[u8],
    width: u32,
    height: u32,
    options: JsValue,
) -> Result<JsValue, JsValue> {
    let options = serde_wasm_bindgen::from_value::<WasmTraceOptions>(options)
        .map_err(|_| error_value(TraceError::InvalidOptions))?;
    let options = TraceOptions::try_from(options).map_err(error_value)?;
    let output = tracer_core::trace_mask(pixels, width, height, &options).map_err(error_value)?;
    serde_wasm_bindgen::to_value(&output).map_err(|_| error_value(TraceError::EngineFailure))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_the_core_version() {
        assert_eq!(core_version(), tracer_core::CORE_VERSION);
    }
}
