#![forbid(unsafe_code)]

//! Platform-neutral binary-mask tracing backed by VTracer.

use core::fmt;
use serde::Serialize;
use visioncortex::{CompoundPathElement, PathSimplifyMode, PointF64, PointI32};
use vtracer::{ColorImage, ColorMode, Config, Hierarchical};

pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const MAX_WIDTH: u32 = 4_096;
pub const MAX_HEIGHT: u32 = 4_096;
pub const MAX_PIXELS: u32 = 16_777_216;
pub const MAX_SPECKLE_AREA: u32 = MAX_PIXELS;
pub const MAX_PATH_COUNT: u32 = 16_384;
pub const MAX_OUTPUT_BYTES: u32 = 4 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum TurnPolicy {
    Black = 0,
    White = 1,
    Minority = 2,
}

impl TryFrom<u8> for TurnPolicy {
    type Error = TraceError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Black),
            1 => Ok(Self::White),
            2 => Ok(Self::Minority),
            _ => Err(TraceError::InvalidOptions),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TraceOptions {
    pub threshold: u8,
    pub sensitivity: u8,
    pub speckle_min_area: u32,
    pub turn_policy: TurnPolicy,
    pub corner_threshold: f32,
    pub optimize_curve: bool,
    pub max_path_count: u32,
    pub max_output_bytes: u32,
}

impl Default for TraceOptions {
    fn default() -> Self {
        Self {
            threshold: 128,
            sensitivity: 50,
            speckle_min_area: 1,
            turn_policy: TurnPolicy::Minority,
            corner_threshold: 0.2,
            optimize_curve: true,
            max_path_count: MAX_PATH_COUNT,
            max_output_bytes: MAX_OUTPUT_BYTES,
        }
    }
}

impl TraceOptions {
    pub fn validate(&self) -> Result<(), TraceError> {
        if self.sensitivity > 100
            || !(0.0..=1.0).contains(&self.corner_threshold)
            || self.speckle_min_area > MAX_SPECKLE_AREA
            || self.max_path_count == 0
            || self.max_path_count > MAX_PATH_COUNT
            || self.max_output_bytes == 0
            || self.max_output_bytes > MAX_OUTPUT_BYTES
        {
            return Err(TraceError::InvalidOptions);
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TraceError {
    InvalidDimensions,
    InvalidInputLength,
    ResourceLimit,
    InvalidOptions,
    EngineFailure,
    NotImplemented,
}

impl TraceError {
    pub const fn code(self) -> &'static str {
        match self {
            Self::InvalidDimensions => "TRACE_INVALID_DIMENSIONS",
            Self::InvalidInputLength => "TRACE_INVALID_INPUT",
            Self::ResourceLimit => "TRACE_RESOURCE_LIMIT",
            Self::InvalidOptions => "TRACE_INVALID_OPTIONS",
            Self::EngineFailure => "TRACE_ENGINE_FAILURE",
            Self::NotImplemented => "TRACE_NOT_IMPLEMENTED",
        }
    }
}

impl fmt::Display for TraceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for TraceError {}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SvgPathRecord {
    pub path: String,
    pub fill_rule: FillRule,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FillRule {
    EvenOdd,
    NonZero,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceOutput {
    pub view_box: [u32; 4],
    pub paths: Vec<SvgPathRecord>,
    pub warnings: Vec<String>,
}

pub fn validate_request_metadata(
    width: u32,
    height: u32,
    options: &TraceOptions,
) -> Result<usize, TraceError> {
    options.validate()?;
    if width == 0 || height == 0 {
        return Err(TraceError::InvalidDimensions);
    }
    if width > MAX_WIDTH || height > MAX_HEIGHT {
        return Err(TraceError::ResourceLimit);
    }

    let pixels = width.checked_mul(height).ok_or(TraceError::ResourceLimit)?;
    if pixels > MAX_PIXELS {
        return Err(TraceError::ResourceLimit);
    }
    usize::try_from(pixels).map_err(|_| TraceError::ResourceLimit)
}

pub fn validate_mask(
    pixels: &[u8],
    width: u32,
    height: u32,
    options: &TraceOptions,
) -> Result<(), TraceError> {
    let expected_length = validate_request_metadata(width, height, options)?;
    if pixels.len() != expected_length {
        return Err(TraceError::InvalidInputLength);
    }
    if pixels.iter().any(|pixel| *pixel > 1) {
        return Err(TraceError::InvalidInputLength);
    }
    Ok(())
}

fn absolute_svg_path(path: &vtracer::SvgPath) -> String {
    path.path
        .iter()
        .map(|element| match element {
            CompoundPathElement::PathI32(path) => {
                path.to_svg_string(true, &PointI32::default(), Some(2))
            }
            CompoundPathElement::PathF64(path) => {
                path.to_svg_string(true, &PointF64::default(), Some(2))
            }
            CompoundPathElement::Spline(path) => {
                path.to_svg_string(true, &PointF64::default(), Some(2))
            }
        })
        .collect()
}

fn speckle_side_length(minimum_area: u32) -> usize {
    (f64::from(minimum_area).sqrt().ceil() as usize).max(1)
}

/// Traces a normalized mask. A byte value of `1` is foreground and `0` is
/// background; image preprocessing and thresholding remain outside this crate.
pub fn trace_mask(
    pixels: &[u8],
    width: u32,
    height: u32,
    options: &TraceOptions,
) -> Result<TraceOutput, TraceError> {
    validate_mask(pixels, width, height, options)?;

    let mut rgba = Vec::with_capacity(pixels.len() * 4);
    for pixel in pixels {
        let channel = if *pixel == 1 { 0 } else { 255 };
        rgba.extend_from_slice(&[channel, channel, channel, 255]);
    }
    let image = ColorImage {
        pixels: rgba,
        width: width as usize,
        height: height as usize,
    };
    let config = Config {
        color_mode: ColorMode::Binary,
        hierarchical: Hierarchical::Stacked,
        filter_speckle: speckle_side_length(options.speckle_min_area),
        mode: if options.optimize_curve {
            PathSimplifyMode::Spline
        } else {
            PathSimplifyMode::Polygon
        },
        corner_threshold: (options.corner_threshold * 180.0).round() as i32,
        path_precision: Some(2),
        ..Config::default()
    };
    let svg = vtracer::convert(image, config).map_err(|_| TraceError::EngineFailure)?;
    let mut output_bytes = 0usize;
    let mut paths = Vec::with_capacity(svg.paths.len());
    for path in &svg.paths {
        let path = absolute_svg_path(path);
        if path.trim().is_empty() {
            continue;
        }
        if paths.len() >= options.max_path_count as usize {
            return Err(TraceError::ResourceLimit);
        }
        output_bytes = output_bytes
            .checked_add(path.len())
            .ok_or(TraceError::ResourceLimit)?;
        if output_bytes > options.max_output_bytes as usize {
            return Err(TraceError::ResourceLimit);
        }
        paths.push(SvgPathRecord {
            path,
            fill_rule: FillRule::EvenOdd,
        });
    }

    let mut warnings = vec![
        "Threshold and sensitivity are preprocessing settings and were not applied by tracing."
            .to_owned(),
    ];
    if options.turn_policy != TurnPolicy::Minority {
        warnings.push(
            "VTracer does not expose Potrace turn policies; its binary clustering policy was used."
                .to_owned(),
        );
    }

    Ok(TraceOutput {
        view_box: [0, 0, width, height],
        paths,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_pixels() -> Vec<u8> {
        let mut pixels = vec![0; 64];
        for y in 2..6 {
            for x in 2..6 {
                pixels[y * 8 + x] = 1;
            }
        }
        pixels
    }

    #[test]
    fn reports_a_stable_version() {
        assert_eq!(CORE_VERSION, "0.1.0");
    }

    #[test]
    fn valid_request_returns_filled_paths() {
        let output = trace_mask(&valid_pixels(), 8, 8, &TraceOptions::default()).unwrap();
        assert_eq!(output.view_box, [0, 0, 8, 8]);
        assert!(!output.paths.is_empty());
        assert!(output.paths.iter().all(|path| path.path.starts_with('M')));
    }

    #[test]
    fn rejects_invalid_dimensions_and_input_length() {
        assert_eq!(
            trace_mask(&[], 0, 1, &TraceOptions::default()),
            Err(TraceError::InvalidDimensions)
        );
        assert_eq!(
            trace_mask(&[1], 2, 2, &TraceOptions::default()),
            Err(TraceError::InvalidInputLength)
        );
        assert_eq!(
            trace_mask(&[2], 1, 1, &TraceOptions::default()),
            Err(TraceError::InvalidInputLength)
        );
    }

    #[test]
    fn enforces_resource_and_option_budgets() {
        assert_eq!(
            validate_request_metadata(3_024, 4_032, &TraceOptions::default()),
            Ok(12_192_768)
        );
        assert_eq!(
            validate_request_metadata(MAX_WIDTH + 1, 1, &TraceOptions::default()),
            Err(TraceError::ResourceLimit)
        );

        let invalid_options = TraceOptions {
            max_output_bytes: MAX_OUTPUT_BYTES + 1,
            ..TraceOptions::default()
        };
        assert_eq!(
            validate_request_metadata(1, 1, &invalid_options),
            Err(TraceError::InvalidOptions)
        );
    }
}
