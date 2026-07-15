import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  PanResponder,
  Dimensions,
  LayoutChangeEvent,
  StyleSheet,
  Platform,
} from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { databaseService } from '../services/DatabaseService';
import {
  DEFAULT_JOURNAL_BACKGROUND_STYLE,
  getJournalType,
  JournalBackgroundStyle,
  JournalTypeId,
} from '../services/JournalTypes';
import { LocalVectorizationService } from '../services/LocalVectorizationService';
import {
  MAX_TRACE_OUTPUT_BYTES,
  MAX_TRACE_PATHS,
  type CompletedVectorizationResponse,
  type TurnPolicy,
  LocalTraceError,
  type TraceSettings,
} from '../services/LocalVectorization.types';
import { decodeImageToMask, type DecodedImageMask } from '../services/ImageMask';
import { drawingLog, uiLog, vectorizationLog } from '../services/Logger';
import { drawingColors, palette } from './theme';

// Smooth a path using quadratic curves
const smoothPath = (points: { x: number; y: number }[]): string => {
  if (points.length < 2) return '';

  uiLog.debug('Smoothing path with points', { pointCount: points.length });
  let path = `M ${points[0].x} ${points[0].y}`;

  // If only two points, use simple line
  if (points.length === 2) {
    path += ` L ${points[1].x} ${points[1].y}`;
    return path;
  }

  // Use quadratic curves for smoothing
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];

    // Control point is the current point
    const controlX = current.x;
    const controlY = current.y;

    // End point is midway to next point
    const endX = (current.x + next.x) / 2;
    const endY = (current.y + next.y) / 2;

    path += ` Q ${controlX} ${controlY} ${endX} ${endY}`;
  }

  // Add final point
  const lastPoint = points[points.length - 1];
  path += ` L ${lastPoint.x} ${lastPoint.y}`;

  return path;
};

interface DrawingScreenProps {
  date: string;
  journalType: JournalTypeId;
  onBack: () => void;
  initialImage?: { base64: string; mimeType?: string | null };
}

interface DrawingPath {
  path: string;
  color: string;
  strokeWidth: number;
  fillColor?: string;
  fillRule?: 'evenodd' | 'nonzero';
  transform?: string;
}

interface PersistedDrawing {
  paths: DrawingPath[];
}

const strokeWidths = [1, 3, 6, 10];
const backgroundOptions: { label: string; value: JournalBackgroundStyle }[] = [
  { label: 'Ruled', value: 'ruled' },
  { label: 'Grid', value: 'grid' },
  { label: 'Dot', value: 'dot' },
  { label: 'Blank', value: 'blank' },
];
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const roundToStep = (value: number, minimum: number, step: number) => {
  if (step <= 0) {
    return value;
  }
  const steps = Math.round((value - minimum) / step);
  return minimum + steps * step;
};

interface SliderControlProps {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onValueChange: (nextValue: number) => void;
  formatValue?: (value: number) => string;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  minimum,
  maximum,
  step,
  onValueChange,
  formatValue,
}) => {
  const [panResponder, setPanResponder] = useState<ReturnType<typeof PanResponder.create> | null>(
    null
  );
  const trackWidthRef = useRef(1);
  const dragStartValueRef = useRef(value);
  const valueRef = useRef(value);
  const minimumRef = useRef(minimum);
  const maximumRef = useRef(maximum);
  const stepRef = useRef(step);
  const onValueChangeRef = useRef(onValueChange);

  useEffect(() => {
    valueRef.current = value;
    minimumRef.current = minimum;
    maximumRef.current = maximum;
    stepRef.current = step;
    onValueChangeRef.current = onValueChange;
  }, [value, minimum, maximum, step, onValueChange]);

  useLayoutEffect(() => {
    setPanResponder(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          dragStartValueRef.current = valueRef.current;
          const safeWidth = Math.max(trackWidthRef.current, 1);
          const minimumValue = minimumRef.current;
          const maximumValue = maximumRef.current;
          const stepValue = stepRef.current;
          const ratio = clamp(event.nativeEvent.locationX / safeWidth, 0, 1);
          const nextValue = clamp(
            roundToStep(
              minimumValue + ratio * (maximumValue - minimumValue),
              minimumValue,
              stepValue
            ),
            minimumValue,
            maximumValue
          );
          onValueChangeRef.current(nextValue);
        },
        onPanResponderMove: (_event, gestureState) => {
          const safeWidth = Math.max(trackWidthRef.current, 1);
          const minimumValue = minimumRef.current;
          const maximumValue = maximumRef.current;
          const stepValue = stepRef.current;
          const range = maximumValue - minimumValue;
          const nextValue = clamp(
            roundToStep(
              dragStartValueRef.current + (gestureState.dx / safeWidth) * range,
              minimumValue,
              stepValue
            ),
            minimumValue,
            maximumValue
          );
          onValueChangeRef.current(nextValue);
        },
      })
    );
  }, []);

  if (!panResponder) {
    return null;
  }

  const ratio = (value - minimum) / (maximum - minimum || 1);
  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-ink">{label}</Text>
        <Text className="text-xs font-semibold text-muted">{displayValue}</Text>
      </View>
      <View
        className="h-10 flex-row items-center"
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          trackWidthRef.current = width;
        }}
        {...panResponder.panHandlers}>
        <View pointerEvents="none" className="h-2 w-full rounded-full bg-teal-soft">
          <View
            pointerEvents="none"
            className="h-2 rounded-full bg-sky"
            style={{ width: `${clamp(ratio * 100, 0, 100)}%` }}
          />
        </View>
        <View
          pointerEvents="none"
          className="border-surface absolute h-5 w-5 rounded-full border-2 bg-teal"
          style={{ left: `${clamp(ratio * 100, 0, 100)}%`, marginLeft: -10 }}
        />
      </View>
    </View>
  );
};

interface VectorPreviewState {
  sourceImage: {
    base64: string;
    mimeType?: string | null;
  };
  request: DecodedImageMask;
  settings: TraceSettings;
  response: CompletedVectorizationResponse;
}

const turnPolicies: TurnPolicy[] = ['minority', 'black', 'white'];

const defaultTraceSettings: TraceSettings = {
  threshold: 180,
  sensitivity: 50,
  speckleMinArea: 8,
  turnPolicy: 'minority',
  cornerThreshold: 0.2,
  optimizeCurve: true,
  maxPathCount: MAX_TRACE_PATHS,
  maxOutputBytes: MAX_TRACE_OUTPUT_BYTES,
};

const isDrawingPath = (value: unknown): value is DrawingPath => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === 'string' &&
    typeof candidate.color === 'string' &&
    typeof candidate.strokeWidth === 'number' &&
    (candidate.fillColor === undefined || typeof candidate.fillColor === 'string') &&
    (candidate.fillRule === undefined ||
      candidate.fillRule === 'evenodd' ||
      candidate.fillRule === 'nonzero') &&
    (candidate.transform === undefined || typeof candidate.transform === 'string')
  );
};

const normalizePersistedDrawing = (value: unknown): PersistedDrawing => {
  if (Array.isArray(value)) {
    return {
      paths: value.filter(isDrawingPath),
    };
  }

  if (typeof value !== 'object' || value === null) {
    return { paths: [] };
  }

  const candidate = value as Record<string, unknown>;
  return {
    paths: Array.isArray(candidate.paths) ? candidate.paths.filter(isDrawingPath) : [],
  };
};

const fitViewBoxToCanvas = (
  viewBox: readonly [number, number, number, number],
  canvasWidth: number,
  canvasHeight: number
): string | undefined => {
  const [x, y, width, height] = viewBox;
  if (width <= 0 || height <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return undefined;
  }

  const scale = Math.min(canvasWidth / width, canvasHeight / height);
  const offsetX = (canvasWidth - width * scale) / 2 - x * scale;
  const offsetY = (canvasHeight - height * scale) / 2 - y * scale;
  return `matrix(${scale} 0 0 ${scale} ${offsetX} ${offsetY})`;
};

const drawingPathsFromVectorization = (
  response: CompletedVectorizationResponse,
  color: string,
  canvasWidth: number,
  canvasHeight: number
): DrawingPath[] => {
  const transform = fitViewBoxToCanvas(response.viewBox, canvasWidth, canvasHeight);
  return response.paths.map((record) => ({
    path: record.path,
    color,
    strokeWidth: 0,
    fillColor: color,
    fillRule: record.fillRule,
    transform,
  }));
};

export const DrawingScreen: React.FC<DrawingScreenProps> = ({
  date,
  journalType,
  onBack,
  initialImage,
}) => {
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState(drawingColors[0]);
  const [selectedTool, setSelectedTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [backgroundStyle, setBackgroundStyle] = useState<JournalBackgroundStyle>(
    DEFAULT_JOURNAL_BACKGROUND_STYLE
  );
  const [activeToolOptions, setActiveToolOptions] = useState<
    'pen' | 'eraser' | 'background' | null
  >(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [vectorPreview, setVectorPreview] = useState<VectorPreviewState | null>(null);
  const [isPreviewProcessing, setIsPreviewProcessing] = useState(false);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);
  const [previewWarningMessage, setPreviewWarningMessage] = useState<string | null>(null);
  const previewRunIdRef = useRef(0);
  const skipNextAutoPreviewRef = useRef(false);

  const { width, height } = Dimensions.get('window');
  const drawingHeight = Math.max(height - 150, 320);
  const [canvasWidth, setCanvasWidth] = useState(width);
  const [canvasHeight, setCanvasHeight] = useState(drawingHeight);

  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const canvasWidthRef = useRef(canvasWidth);
  const canvasHeightRef = useRef(canvasHeight);
  const isPanningRef = useRef(isPanning);
  const lastPanPointRef = useRef(lastPanPoint);

  const runVectorizationPass = async (
    request: DecodedImageMask,
    settings: TraceSettings
  ): Promise<CompletedVectorizationResponse> => {
    const response = await LocalVectorizationService.traceMask({
      ...request,
      settings,
    });

    if (response.kind !== 'completed') {
      throw new Error('Local vectorization is not available yet.');
    }
    return response;
  };

  const warningForMaskCoverage = (mask: DecodedImageMask): string | null => {
    if (Array.isArray(mask.warnings) && mask.warnings.length > 0) {
      return mask.warnings[0];
    }

    if (typeof mask.foregroundCoveragePercent !== 'number') {
      return null;
    }
    if (mask.foregroundCoveragePercent < 0.5) {
      return 'Detected very little ink. Lower threshold or increase sensitivity.';
    }
    if (mask.foregroundCoveragePercent > 40) {
      return 'Detected too much foreground. Increase threshold to avoid blob output.';
    }
    return null;
  };

  const startVectorizationFromImage = async (base64: string, mimeType?: string | null) => {
    if (isVectorizing) {
      vectorizationLog.warn('Vectorization request ignored because one is already running');
      return;
    }

    setIsVectorizing(true);
    try {
      const request = await decodeImageToMask(base64, defaultTraceSettings, mimeType);
      vectorizationLog.info('Binary mask ready', {
        width: request.width,
        height: request.height,
        bytes: request.pixels.byteLength,
      });

      const response = await runVectorizationPass(request, defaultTraceSettings);
      vectorizationLog.info('WASM trace completed', {
        kind: response.kind,
        pathCount: response.kind === 'completed' ? response.paths.length : 0,
      });

      setPreviewErrorMessage(null);
      setPreviewWarningMessage(warningForMaskCoverage(request));
      skipNextAutoPreviewRef.current = true;
      setVectorPreview({
        sourceImage: { base64, mimeType },
        request,
        settings: { ...defaultTraceSettings },
        response,
      });
      drawingLog.info('Image vectorized successfully', {
        date,
        pathCount: response.paths.length,
        width: request.width,
        height: request.height,
      });
    } catch (error) {
      drawingLog.error('Image vectorization failed', { date, error });
      const message =
        error instanceof LocalTraceError && error.code === 'TRACE_RESOURCE_LIMIT'
          ? 'The selected image is too large to vectorize on this device.'
          : error instanceof Error
            ? error.message
            : 'The selected image could not be vectorized.';
      Alert.alert('Vectorization failed', message);
    } finally {
      setIsVectorizing(false);
    }
  };

  useEffect(() => {
    if (!initialImage) return;
    const { base64, mimeType } = initialImage;
    // Defer with setTimeout so setState calls inside startVectorizationFromImage
    // don't run synchronously in the effect body (avoids react-hooks/set-state-in-effect).
    // This effect is intentionally run only once on mount: DrawingScreen is always
    // unmounted and remounted when navigating to a different entry, so initialImage
    // (a navigation-time prop) never changes while the component is alive.
    const timer = setTimeout(() => {
      void startVectorizationFromImage(base64, mimeType);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    drawingLog.info('Loading drawing', { date });
    Promise.all([
      databaseService.loadDrawing(date, journalType),
      databaseService.getJournalBackground(journalType),
    ])
      .then(([savedDrawing, savedBackground]) => {
        if (!cancelled) {
          const normalizedDrawing = normalizePersistedDrawing(savedDrawing);
          setPaths(normalizedDrawing.paths);
          setBackgroundStyle(savedBackground);
          drawingLog.debug('Drawing loaded', {
            date,
            backgroundStyle: savedBackground,
            pathCount: normalizedDrawing.paths.length,
          });
        }
      })
      .catch((error) => {
        drawingLog.error('Error loading drawing', { date, error });
      });

    return () => {
      cancelled = true;
    };
  }, [date, journalType]);

  useEffect(() => {
    zoomRef.current = zoom;
    panXRef.current = panX;
    panYRef.current = panY;
    canvasWidthRef.current = canvasWidth;
    canvasHeightRef.current = canvasHeight;
    isPanningRef.current = isPanning;
    lastPanPointRef.current = lastPanPoint;
  }, [zoom, panX, panY, canvasWidth, canvasHeight, isPanning, lastPanPoint]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const svgElement = target?.closest?.('svg');
      if (svgElement) {
        event.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const isEventOnSvg = (event: MouseEvent) => {
      const target = event.target as Element | null;
      return Boolean(target?.closest?.('svg'));
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 2 || !isEventOnSvg(event)) {
        return;
      }

      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      setIsPanning(true);
      isPanningRef.current = true;
      setIsDrawing(false);
      setLastPanPoint(point);
      lastPanPointRef.current = point;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isPanningRef.current || !lastPanPointRef.current) {
        return;
      }

      event.preventDefault();
      const currentPoint = { x: event.clientX, y: event.clientY };
      const deltaX = currentPoint.x - lastPanPointRef.current.x;
      const deltaY = currentPoint.y - lastPanPointRef.current.y;

      setPanX((prev) => prev + deltaX);
      setPanY((prev) => prev + deltaY);
      setLastPanPoint(currentPoint);
      lastPanPointRef.current = currentPoint;
    };

    const stopPanning = () => {
      if (!isPanningRef.current) {
        return;
      }

      setIsPanning(false);
      isPanningRef.current = false;
      setLastPanPoint(null);
      lastPanPointRef.current = null;
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', stopPanning, true);
    window.addEventListener('blur', stopPanning);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', stopPanning, true);
      window.removeEventListener('blur', stopPanning);
    };
  }, []);

  const saveDrawing = async (newPaths: DrawingPath[]) => {
    try {
      drawingLog.info('Saving drawing', { date, pathCount: newPaths.length });
      await databaseService.saveDrawing(date, journalType, newPaths);
      drawingLog.debug('Drawing saved successfully', { date });
    } catch (error) {
      drawingLog.error('Error saving drawing', { date, error });
    }
  };

  const handleWheel = (event: WheelEvent) => {
    const target = event.target as Element | null;
    const svgElement = target?.closest?.('svg');
    if (!svgElement) {
      return;
    }

    event.preventDefault();

    const currentZoom = zoomRef.current;
    const currentPanX = panXRef.current;
    const currentPanY = panYRef.current;
    const currentCanvasWidth = canvasWidthRef.current;
    const currentCanvasHeight = canvasHeightRef.current;

    const delta = event.deltaY;
    const zoomStep = 1.12;
    const zoomMultiplier = delta > 0 ? 1 / zoomStep : zoomStep;
    const newZoom = Math.max(0.5, Math.min(5, currentZoom * zoomMultiplier));

    if (newZoom === currentZoom) {
      return;
    }

    // On web, keep the point under the cursor fixed while zooming.
    const rect = svgElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const normalizedX = mouseX / rect.width;
    const normalizedY = mouseY / rect.height;

    const currentViewBoxX = -currentPanX / currentZoom;
    const currentViewBoxY = -currentPanY / currentZoom;
    const currentViewBoxWidth = currentCanvasWidth / currentZoom;
    const currentViewBoxHeight = currentCanvasHeight / currentZoom;

    const worldX = currentViewBoxX + normalizedX * currentViewBoxWidth;
    const worldY = currentViewBoxY + normalizedY * currentViewBoxHeight;

    const newViewBoxWidth = currentCanvasWidth / newZoom;
    const newViewBoxHeight = currentCanvasHeight / newZoom;
    const newViewBoxX = worldX - normalizedX * newViewBoxWidth;
    const newViewBoxY = worldY - normalizedY * newViewBoxHeight;

    const newPanX = -newViewBoxX * newZoom;
    const newPanY = -newViewBoxY * newZoom;

    setPanX(newPanX);
    setPanY(newPanY);
    setZoom(newZoom);
    uiLog.debug('Zoom changed', { oldZoom: currentZoom, newZoom, delta, mouseX, mouseY });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        window.removeEventListener('wheel', handleWheel);
      };
    }
  }, []);

  const handleCanvasLayout = (event: LayoutChangeEvent) => {
    const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
    if (layoutWidth > 0 && layoutHeight > 0) {
      setCanvasWidth(layoutWidth);
      setCanvasHeight(layoutHeight);
    }
  };

  const getPointerPosition = (event: any) => ({
    x:
      typeof event.nativeEvent.pageX === 'number'
        ? event.nativeEvent.pageX
        : event.nativeEvent.locationX,
    y:
      typeof event.nativeEvent.pageY === 'number'
        ? event.nativeEvent.pageY
        : event.nativeEvent.locationY,
  });

  const isSecondaryButtonEvent = (event: any) => {
    const nativeEvent = event.nativeEvent as any;
    const button = nativeEvent.button;
    const buttons = nativeEvent.buttons;

    return button === 2 || (typeof buttons === 'number' && (buttons & 2) === 2);
  };

  const resetZoom = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    uiLog.debug('Zoom reset to default');
  };

  const handleToolSelect = (tool: 'pen' | 'eraser') => {
    setSelectedTool(tool);
    setIsMoreMenuOpen(false);
    setActiveToolOptions((currentTool) => (currentTool === tool ? null : tool));
  };

  const handleMoreToggle = () => {
    setActiveToolOptions(null);
    setIsMoreMenuOpen((isOpen) => !isOpen);
  };

  const handleCameraAction = () => {
    vectorizationLog.info('Vectorize image pressed');
    setIsMoreMenuOpen(false);
    void importAndVectorizeImage();
  };

  const handleResetZoomAction = () => {
    setIsMoreMenuOpen(false);
    resetZoom();
  };

  const handleClearCanvasAction = () => {
    setIsMoreMenuOpen(false);
    clearCanvas();
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (event) => {
      setActiveToolOptions(null);
      setIsMoreMenuOpen(false);

      const isRightClick = isSecondaryButtonEvent(event);
      if (isRightClick) {
        const pointer = getPointerPosition(event);
        setIsPanning(true);
        setIsDrawing(false);
        setLastPanPoint(pointer);
        return;
      }

      const { locationX, locationY } = event.nativeEvent;
      // Transform screen coordinates to SVG coordinates
      const svgX = -panX / zoom + locationX / zoom;
      const svgY = -panY / zoom + locationY / zoom;
      uiLog.debug('Started drawing', {
        tool: selectedTool,
        color: selectedColor,
        strokeWidth,
        x: svgX,
        y: svgY,
      });
      const startPoint = { x: svgX, y: svgY };
      setCurrentPoints([startPoint]);
      setCurrentPath(`M${svgX},${svgY}`);
      setIsDrawing(true);
    },

    onPanResponderMove: (event) => {
      if (isPanning && lastPanPoint) {
        const currentPoint = getPointerPosition(event);
        const deltaX = currentPoint.x - lastPanPoint.x;
        const deltaY = currentPoint.y - lastPanPoint.y;

        setPanX((prev) => prev + deltaX);
        setPanY((prev) => prev + deltaY);
        setLastPanPoint(currentPoint);
        return;
      }

      const { locationX, locationY } = event.nativeEvent;
      if (isDrawing) {
        // Transform screen coordinates to SVG coordinates
        const svgX = -panX / zoom + locationX / zoom;
        const svgY = -panY / zoom + locationY / zoom;
        const newPoint = { x: svgX, y: svgY };
        setCurrentPoints((prev) => {
          const newPoints = [...prev, newPoint];
          // Update current path with smoothing
          setCurrentPath(smoothPath(newPoints));
          return newPoints;
        });
      }
    },

    onPanResponderRelease: () => {
      if (isPanning) {
        setIsPanning(false);
        setLastPanPoint(null);
        return;
      }

      if (currentPath && isDrawing) {
        uiLog.debug('Finished drawing path', {
          tool: selectedTool,
          pathLength: currentPath.length,
        });
        const newDrawingPath: DrawingPath = {
          path: currentPath,
          color: selectedTool === 'eraser' ? palette.surface : selectedColor,
          strokeWidth: selectedTool === 'eraser' ? strokeWidth * 3 : strokeWidth,
        };

        const newPaths = [...paths, newDrawingPath];
        setPaths(newPaths);
        saveDrawing(newPaths);
        setCurrentPath('');
        setCurrentPoints([]);
        setIsDrawing(false);
      }
    },

    onPanResponderTerminate: () => {
      setIsPanning(false);
      setLastPanPoint(null);
      setIsDrawing(false);
      setCurrentPath('');
      setCurrentPoints([]);
    },
  });

  const clearDrawing = async () => {
    try {
      setPaths([]);
      setCurrentPath('');
      setCurrentPoints([]);
      setIsDrawing(false);
      await databaseService.deleteDrawing(date, journalType);
      drawingLog.info('Drawing cleared', { date });
    } catch (error) {
      drawingLog.error('Error clearing drawing', { date, error });
    }
  };

  const clearCanvas = () => {
    if (Platform.OS === 'web') {
      const shouldClear = window.confirm('Clear this drawing?');
      if (shouldClear) {
        clearDrawing();
      }
      return;
    }

    Alert.alert('Clear Drawing', 'Are you sure you want to clear this drawing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: clearDrawing,
      },
    ]);
  };

  const runPreviewPass = async (
    sourceImage: { base64: string; mimeType?: string | null },
    settings: TraceSettings
  ): Promise<{ request: DecodedImageMask; response: CompletedVectorizationResponse }> => {
    const request = await decodeImageToMask(sourceImage.base64, settings, sourceImage.mimeType);
    const response = await runVectorizationPass(request, settings);
    return { request, response };
  };

  const closeVectorPreview = () => {
    previewRunIdRef.current += 1;
    setVectorPreview(null);
    setPreviewErrorMessage(null);
    setPreviewWarningMessage(null);
    setIsPreviewProcessing(false);
  };

  const rerunPreviewWithSettings = async (
    sourceImage: { base64: string; mimeType?: string | null },
    settings: TraceSettings
  ) => {
    const runId = previewRunIdRef.current + 1;
    previewRunIdRef.current = runId;

    setIsPreviewProcessing(true);
    setPreviewErrorMessage(null);
    try {
      const { request, response } = await runPreviewPass(sourceImage, settings);
      setVectorPreview((current) => {
        if (!current || previewRunIdRef.current !== runId) {
          return current;
        }

        return {
          ...current,
          request,
          settings,
          response,
        };
      });
      if (previewRunIdRef.current === runId) {
        setPreviewWarningMessage(warningForMaskCoverage(request));
      }
    } catch (error) {
      const message =
        error instanceof LocalTraceError && error.code === 'TRACE_RESOURCE_LIMIT'
          ? 'Those settings exceed local trace limits. Try reducing detail.'
          : error instanceof Error
            ? error.message
            : 'Preview vectorization failed.';
      if (previewRunIdRef.current === runId) {
        setPreviewErrorMessage(message);
      }
    } finally {
      if (previewRunIdRef.current === runId) {
        setIsPreviewProcessing(false);
      }
    }
  };

  useEffect(() => {
    if (!vectorPreview) {
      return;
    }

    if (skipNextAutoPreviewRef.current) {
      skipNextAutoPreviewRef.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      void rerunPreviewWithSettings(vectorPreview.sourceImage, vectorPreview.settings);
    }, 220);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    vectorPreview?.settings.threshold,
    vectorPreview?.settings.sensitivity,
    vectorPreview?.settings.speckleMinArea,
    vectorPreview?.settings.cornerThreshold,
    vectorPreview?.settings.turnPolicy,
    vectorPreview?.settings.optimizeCurve,
  ]);

  const updatePreviewSettings = (patch: Partial<TraceSettings>) => {
    setVectorPreview((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        settings: {
          ...current.settings,
          ...patch,
        },
      };
    });
  };

  const handleApplyVectorPreview = async () => {
    if (!vectorPreview) {
      return;
    }

    const tracedPaths = drawingPathsFromVectorization(
      vectorPreview.response,
      selectedColor,
      canvasWidthRef.current,
      canvasHeightRef.current
    );

    const newPaths = [...paths, ...tracedPaths];
    setPaths(newPaths);
    await saveDrawing(newPaths);
    closeVectorPreview();
  };

  const importAndVectorizeImage = async () => {
    if (isVectorizing) {
      vectorizationLog.warn('Vectorization request ignored because one is already running');
      return;
    }

    vectorizationLog.info('Starting image picker');
    drawingLog.info('Starting image vectorization', { date, platform: Platform.OS });
    try {
      if (Platform.OS !== 'web') {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
          Alert.alert(
            'Permission required',
            'Photo library permission is required to import images.'
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
        base64: true,
      });

      if (result.canceled) {
        drawingLog.info('Image picker canceled', { date });
        return;
      }

      const asset = result.assets[0];
      if (!asset) {
        throw new Error('No image was returned by the image picker.');
      }
      drawingLog.info('Image selected for vectorization', {
        date,
        uri: asset.uri,
        mimeType: asset.mimeType,
      });
      vectorizationLog.info('Image selected', {
        width: asset.width,
        height: asset.height,
        hasBase64: Boolean(asset.base64),
      });
      let base64 = asset.base64;
      if (!base64 && Platform.OS === 'web') {
        const imageResponse = await fetch(asset.uri);
        if (!imageResponse.ok) {
          throw new Error(`Image download failed with status ${imageResponse.status}.`);
        }
        const blob = await imageResponse.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const value = reader.result;
            if (typeof value !== 'string') {
              reject(new Error('Image data could not be read.'));
              return;
            }
            const separator = value.indexOf(',');
            resolve(separator >= 0 ? value.slice(separator + 1) : value);
          };
          reader.onerror = () => reject(new Error('Image data could not be read.'));
          reader.readAsDataURL(blob);
        });
      }
      if (!base64) {
        drawingLog.error('Selected image is missing base64 content', { date, uri: asset.uri });
        throw new Error('The selected image could not be read for vectorization.');
      }

      await startVectorizationFromImage(base64, asset.mimeType);
    } catch (error) {
      drawingLog.error('Image vectorization failed', { date, error });
      const message =
        error instanceof LocalTraceError && error.code === 'TRACE_RESOURCE_LIMIT'
          ? 'The selected image is too large to vectorize on this device.'
          : error instanceof Error
            ? error.message
            : 'The selected image could not be vectorized.';
      Alert.alert('Vectorization failed', message);
    }
  };

  const formatDate = (dateString: string) => {
    // Parse the date string as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
    const formatted = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return formatted;
  };

  const handleBackgroundStyleSelect = async (nextBackgroundStyle: JournalBackgroundStyle) => {
    const previousBackgroundStyle = backgroundStyle;
    setBackgroundStyle(nextBackgroundStyle);

    try {
      await databaseService.saveJournalBackground(journalType, nextBackgroundStyle);
      drawingLog.info('Journal background updated', {
        journalType,
        backgroundStyle: nextBackgroundStyle,
      });
      setActiveToolOptions(null);
      setIsMoreMenuOpen(false);
    } catch (error) {
      setBackgroundStyle(previousBackgroundStyle);
      drawingLog.error('Error saving journal background', {
        journalType,
        backgroundStyle: nextBackgroundStyle,
        error,
      });
      Alert.alert('Unable to save paper style', 'Please try changing the paper style again.');
    }
  };

  const formattedDate = formatDate(date);
  const journal = getJournalType(journalType);
  const toolOptionsPanelWidth = Math.max(
    220,
    Math.min(width - 32, activeToolOptions === 'pen' ? 430 : 320)
  );

  return (
    <View className="flex-1 bg-canvas">
      <View className="border-b border-line bg-paper px-4 py-3" style={{ zIndex: 10 }}>
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center pr-2">
            <TouchableOpacity
              onPress={onBack}
              className="mr-3 h-11 w-11 items-center justify-center rounded-lg bg-sky-soft">
              <Ionicons name="arrow-back" size={23} color={palette.sky} />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-base font-bold text-ink" numberOfLines={1}>
                {journal.name}
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {formattedDate}
              </Text>
            </View>
          </View>

          <View className="flex-row rounded-lg bg-canvas p-1" style={{ position: 'relative' }}>
            <TouchableOpacity
              onPress={() => handleToolSelect('pen')}
              className={`mr-1 h-11 w-11 items-center justify-center rounded-lg ${
                selectedTool === 'pen' ? 'bg-teal' : 'bg-transparent'
              }`}>
              <Ionicons
                name="pencil-outline"
                size={22}
                color={selectedTool === 'pen' ? palette.surface : palette.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleToolSelect('eraser')}
              className={`mr-1 h-11 w-11 items-center justify-center rounded-lg ${
                selectedTool === 'eraser' ? 'bg-lavender' : 'bg-transparent'
              }`}>
              <Ionicons
                name="remove-circle-outline"
                size={22}
                color={selectedTool === 'eraser' ? palette.surface : palette.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMoreToggle}
              className={`h-11 w-11 items-center justify-center rounded-lg ${
                isMoreMenuOpen ? 'bg-amber-soft' : 'bg-transparent'
              }`}>
              <Ionicons name="ellipsis-horizontal" size={23} color={palette.muted} />
            </TouchableOpacity>

            {isMoreMenuOpen && (
              <View className="border border-line bg-paper p-2" style={styles.moreMenu}>
                <TouchableOpacity
                  onPress={handleCameraAction}
                  onPressIn={() => vectorizationLog.info('Vectorize menu item pressed')}
                  disabled={isVectorizing}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="camera-outline" size={20} color={palette.sky} />
                  <Text className="ml-3 text-sm font-bold text-ink">
                    {isVectorizing ? 'Processing image...' : 'Import image'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleResetZoomAction}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="contract-outline" size={20} color={palette.lavender} />
                  <Text className="ml-3 text-sm font-bold text-ink">Reset zoom</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setIsMoreMenuOpen(false);
                    setActiveToolOptions((current) =>
                      current === 'background' ? null : 'background'
                    );
                  }}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="grid-outline" size={20} color={palette.teal} />
                  <Text className="ml-3 text-sm font-bold text-ink">Paper style</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleClearCanvasAction}
                  className="flex-row items-center rounded-lg px-3 py-3">
                  <Ionicons name="trash-outline" size={20} color={palette.danger} />
                  <Text className="ml-3 text-sm font-bold text-ink">Clear drawing</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeToolOptions && (
              <View
                className="border border-line bg-paper p-3"
                style={[
                  styles.toolOptionsMenu,
                  {
                    transform: [{ translateX: -toolOptionsPanelWidth / 2 }],
                    width: toolOptionsPanelWidth,
                  },
                ]}>
                {activeToolOptions === 'pen' && (
                  <View className="mb-3 flex-row flex-wrap justify-center">
                    {drawingColors.map((color) => (
                      <TouchableOpacity
                        key={color}
                        onPress={() => setSelectedColor(color)}
                        className={`mb-2 mr-2 h-9 w-9 items-center justify-center rounded-full border-2 ${
                          selectedColor === color ? 'border-ink' : 'border-line'
                        }`}
                        style={{ backgroundColor: color }}>
                        {selectedColor === color && (
                          <Ionicons name="checkmark" size={17} color={palette.surface} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {activeToolOptions === 'background' && (
                  <View className="flex-row flex-wrap justify-center">
                    {backgroundOptions.map((option) => {
                      const isSelected = backgroundStyle === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          onPress={() => void handleBackgroundStyleSelect(option.value)}
                          className={`mb-2 mr-2 flex-row items-center rounded-full border px-4 py-2 ${
                            isSelected ? 'border-teal bg-teal-soft' : 'border-line bg-canvas'
                          }`}>
                          <Text
                            className={`text-sm font-semibold ${
                              isSelected ? 'text-teal' : 'text-muted'
                            }`}>
                            {option.label}
                          </Text>
                          {isSelected && (
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color={palette.teal}
                              style={{ marginLeft: 6 }}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {activeToolOptions !== 'background' && (
                  <View className="flex-row items-center justify-center">
                    <Text className="mr-3 text-sm font-semibold text-muted">
                      {activeToolOptions === 'eraser' ? 'Eraser size' : 'Stroke'}
                    </Text>
                    {strokeWidths.map((strokeOption) => (
                      <TouchableOpacity
                        key={strokeOption}
                        onPress={() => setStrokeWidth(strokeOption)}
                        className={`mr-2 h-11 w-11 items-center justify-center rounded-lg ${
                          strokeWidth === strokeOption ? 'bg-amber-soft' : 'bg-canvas'
                        }`}>
                        <View
                          className="rounded-full bg-ink"
                          style={{
                            height: strokeOption * 2 + 4,
                            width: strokeOption * 2 + 4,
                          }}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          <View className="flex-1" />
        </View>
      </View>

      <View className="flex-1 bg-canvas">
        <View
          className="bg-surface overflow-hidden"
          style={{ flex: 1 }}
          onLayout={handleCanvasLayout}
          {...panResponder.panHandlers}>
          <Svg
            width={canvasWidth}
            height={canvasHeight}
            style={{ backgroundColor: palette.surface }}
            viewBox={`${-panX / zoom} ${-panY / zoom} ${canvasWidth / zoom} ${canvasHeight / zoom}`}>
            <Defs>
              <Pattern id="paperGrid" width="28" height="28" patternUnits="userSpaceOnUse">
                <Rect width="28" height="28" fill={palette.surface} />
                <Line x1="28" y1="0" x2="28" y2="28" stroke={palette.paperLine} strokeWidth="1" />
                <Line x1="0" y1="28" x2="28" y2="28" stroke={palette.paperLine} strokeWidth="1" />
              </Pattern>
              <Pattern id="paperRuled" width="28" height="28" patternUnits="userSpaceOnUse">
                <Rect width="28" height="28" fill={palette.surface} />
                <Line x1="0" y1="28" x2="28" y2="28" stroke={palette.paperLine} strokeWidth="1" />
              </Pattern>
              <Pattern id="paperDot" width="28" height="28" patternUnits="userSpaceOnUse">
                <Rect width="28" height="28" fill={palette.surface} />
                <Circle cx="14" cy="14" r="1.35" fill={palette.paperLine} />
              </Pattern>
            </Defs>
            <Rect
              x={-canvasWidth * 2}
              y={-canvasHeight * 2}
              width={canvasWidth * 5}
              height={canvasHeight * 5}
              fill={
                backgroundStyle === 'blank'
                  ? palette.surface
                  : backgroundStyle === 'ruled'
                    ? 'url(#paperRuled)'
                    : backgroundStyle === 'dot'
                      ? 'url(#paperDot)'
                      : 'url(#paperGrid)'
              }
            />

            {paths.map((drawingPath, index) => (
              <Path
                key={index}
                d={drawingPath.path}
                stroke={drawingPath.fillColor ? 'none' : drawingPath.color}
                strokeWidth={drawingPath.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={drawingPath.fillColor ?? 'none'}
                fillRule={drawingPath.fillRule}
                transform={drawingPath.transform}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {currentPath && (
              <Path
                d={currentPath}
                stroke={selectedTool === 'eraser' ? palette.surface : selectedColor}
                strokeWidth={selectedTool === 'eraser' ? strokeWidth * 3 : strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            )}
          </Svg>
        </View>
      </View>

      {vectorPreview && (
        <TouchableWithoutFeedback>
          <View style={styles.previewOverlay}>
            <View className="border border-line bg-paper p-4" style={styles.previewCard}>
              <View className="mb-3 flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-bold text-ink">Vector preview</Text>
                  <Text className="mt-1 text-xs text-muted">
                    First pass complete. Tune settings, re-run, then apply when handwriting looks
                    clean.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeVectorPreview}
                  className="h-9 w-9 items-center justify-center rounded-lg bg-canvas">
                  <Ionicons name="close" size={20} color={palette.muted} />
                </TouchableOpacity>
              </View>

              <View className="bg-surface mb-4 overflow-hidden rounded-lg border border-line">
                <Svg width="100%" height={200} viewBox={vectorPreview.response.viewBox.join(' ')}>
                  <Rect
                    x={vectorPreview.response.viewBox[0]}
                    y={vectorPreview.response.viewBox[1]}
                    width={vectorPreview.response.viewBox[2]}
                    height={vectorPreview.response.viewBox[3]}
                    fill={palette.surfaceWarm}
                  />
                  {vectorPreview.response.paths.map((record, index) => (
                    <Path
                      key={`preview-${index}`}
                      d={record.path}
                      fill={selectedColor}
                      fillRule={record.fillRule}
                    />
                  ))}
                </Svg>
              </View>

              <Text className="mb-3 text-xs text-muted">
                Paths: {vectorPreview.response.paths.length} • Pixels: {vectorPreview.request.width}{' '}
                x {vectorPreview.request.height}
              </Text>

              {previewWarningMessage && (
                <View className="mb-3 rounded-lg bg-amber-soft px-3 py-2">
                  <Text className="text-xs font-semibold text-ink">{previewWarningMessage}</Text>
                </View>
              )}

              <SliderControl
                label="Threshold"
                value={vectorPreview.settings.threshold}
                minimum={40}
                maximum={240}
                step={1}
                onValueChange={(nextValue) => updatePreviewSettings({ threshold: nextValue })}
              />
              <SliderControl
                label="Sensitivity"
                value={vectorPreview.settings.sensitivity}
                minimum={0}
                maximum={100}
                step={1}
                onValueChange={(nextValue) => updatePreviewSettings({ sensitivity: nextValue })}
              />
              <SliderControl
                label="Speckle Min Area"
                value={vectorPreview.settings.speckleMinArea}
                minimum={0}
                maximum={80}
                step={1}
                onValueChange={(nextValue) => updatePreviewSettings({ speckleMinArea: nextValue })}
              />
              <SliderControl
                label="Corner Threshold"
                value={vectorPreview.settings.cornerThreshold}
                minimum={0.05}
                maximum={1}
                step={0.05}
                formatValue={(value) => value.toFixed(2)}
                onValueChange={(nextValue) =>
                  updatePreviewSettings({ cornerThreshold: Number(nextValue.toFixed(2)) })
                }
              />

              <Text className="mb-2 text-sm font-semibold text-ink">Turn policy</Text>
              <View className="mb-3 flex-row flex-wrap">
                {turnPolicies.map((policy) => {
                  const active = vectorPreview.settings.turnPolicy === policy;
                  return (
                    <TouchableOpacity
                      key={policy}
                      onPress={() => updatePreviewSettings({ turnPolicy: policy })}
                      className={`mb-2 mr-2 rounded-lg px-3 py-2 ${
                        active ? 'bg-teal' : 'bg-canvas'
                      }`}>
                      <Text
                        className={`text-xs font-semibold ${
                          active ? 'text-surface' : 'text-muted'
                        }`}>
                        {policy}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={() =>
                  updatePreviewSettings({ optimizeCurve: !vectorPreview.settings.optimizeCurve })
                }
                className="mb-4 flex-row items-center rounded-lg bg-canvas px-3 py-3">
                <Ionicons
                  name={vectorPreview.settings.optimizeCurve ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={palette.sky}
                />
                <Text className="ml-2 text-sm font-semibold text-ink">Optimize curves</Text>
              </TouchableOpacity>

              {previewErrorMessage && (
                <View className="bg-coralSoft mb-3 rounded-lg px-3 py-2">
                  <Text className="text-danger text-xs font-semibold">{previewErrorMessage}</Text>
                </View>
              )}

              <View className="flex-row">
                <TouchableOpacity
                  disabled={isPreviewProcessing}
                  onPress={() => {
                    void rerunPreviewWithSettings(
                      vectorPreview.sourceImage,
                      vectorPreview.settings
                    );
                  }}
                  className={`mr-2 flex-1 items-center rounded-lg px-3 py-3 ${
                    isPreviewProcessing ? 'bg-disabled' : 'bg-sky'
                  }`}>
                  <Text className="text-surface text-sm font-bold">
                    {isPreviewProcessing ? 'Auto-updating...' : 'Refresh now'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={isPreviewProcessing}
                  onPress={handleApplyVectorPreview}
                  className={`flex-1 items-center rounded-lg px-3 py-3 ${
                    isPreviewProcessing ? 'bg-disabled' : 'bg-teal'
                  }`}>
                  <Text className="text-surface text-sm font-bold">Apply to drawing</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  moreMenu: {
    position: 'absolute',
    right: -73,
    top: 54,
    width: 190,
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 18px rgba(27, 58, 52, 0.14)',
      },
      default: {
        elevation: 12,
        shadowColor: palette.ink,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
    }),
  },
  toolOptionsMenu: {
    left: '50%',
    position: 'absolute',
    top: 54,
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 18px rgba(27, 58, 52, 0.14)',
      },
      default: {
        elevation: 12,
        shadowColor: palette.ink,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
    }),
  },
  previewOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(27, 58, 52, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 18,
  },
  previewCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 760,
    maxHeight: '100%',
    ...Platform.select({
      web: {
        boxShadow: '0px 12px 28px rgba(27, 58, 52, 0.24)',
      },
      default: {
        elevation: 16,
        shadowColor: palette.ink,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.24,
        shadowRadius: 28,
      },
    }),
  },
});
